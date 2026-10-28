const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule } = require('./test-support/load-typescript.cjs');
const load = (name) => loadModule(path.resolve(__dirname, `../src/${name}.ts`));
const { sampleEntries } = load('data/diary-model');
const { sampleCorrectionService } = load('correction/sample-correction-service');
const { createLearningRepository, LEARNING_STORAGE_KEY } = load('data/learning-repository');
const { createDiaryRepository } = load('data/diary-repository');

function storage() {
  return {
    values: new Map(), writes: 0, failRead: false, failWrite: false,
    async getItem(key) {
      if (this.failRead) throw new Error('read failed');
      return this.values.get(key) ?? null;
    },
    async setItem(key, value) {
      if (this.failWrite) throw new Error('write failed');
      this.writes++;
      this.values.set(key, value);
    },
  };
}

function input(change, result) {
  return {
    type: change.learningType, expression: change.expression, meaning: change.meaning,
    originalSentence: change.originalSentence, correctedExample: change.correctedSentence,
    learningLanguage: result.learningLanguage, explanationLanguage: 'ko', sourceDiaryId: result.diaryId, sourceCorrectionId: change.id,
  };
}

async function sampleInput() {
  const { result } = await sampleCorrectionService.correct(sampleEntries[0]);
  return input(result.changes[0], result);
}

test('sample corrections match real original and corrected sentences, and distinguish suggestions', async () => {
  const types = new Set();
  for (const entry of sampleEntries) {
    const before = structuredClone(entry);
    const outcome = await sampleCorrectionService.correct(entry);
    assert.equal(outcome.status, 'available');
    const result = outcome.result;
    assert.equal(result.source, 'sample');
    assert.equal(result.original, entry.content);
    assert.equal(result.diaryId, entry.id);
    assert.equal(result.changes.filter((change) => change.kind === 'grammar').length, 0);
    for (const change of result.changes) {
      assert.ok(result.original.includes(change.originalSentence));
      assert.ok(result.corrected.includes(change.correctedSentence));
      assert.ok(change.explanation && change.meaning);
      types.add(change.learningType);
    }
    assert.deepEqual(entry, before);
  }
  assert.deepEqual([...types].sort(), ['expression', 'grammar', 'word']);
});

test('unrelated diaries, copied user text, and edited samples never receive sample corrections', async () => {
  const sample = sampleEntries[0];
  for (const entry of [
    { ...sample, id: 'user-1', sample: false },
    { ...sample, id: 'user-2', sample: true },
    { ...sample, content: 'I had a completely different day.' },
    { ...sample, sample: false },
    { ...sample, learningLanguage: 'fr' },
  ]) assert.equal((await sampleCorrectionService.correct(entry)).status, 'unsupported');
  const first = await sampleCorrectionService.correct(sample);
  first.result.changes[0].expression = 'Changed by caller';
  assert.notEqual((await sampleCorrectionService.correct(sample)).result.changes[0].expression, 'Changed by caller');
});

test('learning items survive restart, preserve all fields, and deduplicate concurrent saves', async () => {
  const device = storage();
  const repo = createLearningRepository(device);
  assert.deepEqual(await repo.load(), []);
  assert.equal(device.writes, 0);
  const item = await sampleInput();
  const results = await Promise.all([repo.save(item), repo.save({ ...item, expression: ' GO  FOR A WALK ', sourceDiaryId: 'another-diary' })]);
  assert.equal(results[0].duplicate, false);
  assert.equal(results[1].duplicate, true);
  assert.equal(device.writes, 1);
  const restored = await createLearningRepository(device).load();
  assert.equal(restored.length, 1);
  const { id, createdAt, ...fields } = restored[0];
  assert.ok(id && Number.isFinite(Date.parse(createdAt)));
  assert.deepEqual(fields, item);
  // Different learning types remain separate entries.
  await repo.save({ ...item, type: 'grammar' });
  assert.equal((await repo.load()).length, 2);
});

test('diary edits and deletions never alter independently stored learning examples', async () => {
  const device = storage();
  const diary = createDiaryRepository(device);
  const learning = createLearningRepository(device);
  await diary.load();
  await learning.load();
  const saved = await learning.save(await sampleInput());
  await diary.update('sample-1', 'A completely changed diary.');
  await diary.remove('sample-1');
  assert.deepEqual(await createLearningRepository(device).load(), saved.items);
  await learning.remove(saved.items[0].id);
  assert.deepEqual(await createLearningRepository(device).load(), []);
  assert.equal((await createDiaryRepository(device).load()).length, 1);
});

test('pending or failed loads block writes and corrupted data is never overwritten', async () => {
  const item = await sampleInput();
  const device = storage();
  let resolveRead;
  device.getItem = () => new Promise((resolve) => { resolveRead = resolve; });
  const repo = createLearningRepository(device);
  const pending = repo.load();
  await assert.rejects(repo.save(item));
  resolveRead(null);
  await pending;
  assert.equal(device.writes, 0);
  for (const raw of ['broken JSON', JSON.stringify({ version: 99, items: [] }), JSON.stringify({ version: 1, items: [{}] })]) {
    const corrupted = storage();
    corrupted.values.set(LEARNING_STORAGE_KEY, raw);
    const repository = createLearningRepository(corrupted);
    await assert.rejects(repository.load());
    await assert.rejects(repository.save(item));
    assert.equal(corrupted.values.get(LEARNING_STORAGE_KEY), raw);
  }
  const failed = storage();
  failed.failRead = true;
  const retry = createLearningRepository(failed);
  await assert.rejects(retry.load());
  await assert.rejects(retry.save(item));
  failed.failRead = false;
  await retry.load();
  await retry.save(item);
});

test('save and delete failures preserve disk and memory and allow retry', async () => {
  const device = storage();
  const repo = createLearningRepository(device);
  await repo.load();
  const saved = await repo.save(await sampleInput());
  const raw = device.values.get(LEARNING_STORAGE_KEY);
  device.failWrite = true;
  await assert.rejects(repo.remove(saved.items[0].id));
  await assert.rejects(repo.save({ ...await sampleInput(), expression: 'another expression' }));
  assert.deepEqual(await repo.load(), saved.items);
  assert.equal(device.values.get(LEARNING_STORAGE_KEY), raw);
  device.failWrite = false;
  await repo.remove(saved.items[0].id);
  assert.deepEqual(await createLearningRepository(device).load(), []);
});

test('explicit sample import restores correction testing without overwriting edited diaries', async () => {
  const device = storage();
  const repo = createDiaryRepository(device);
  await repo.load();
  await repo.create('My personal diary stays unchanged.');
  await repo.remove('sample-1');
  await repo.update('sample-2', 'I edited this sample and want to keep it.');
  const before = await repo.load();
  const restored = await repo.addSamples();
  assert.equal(restored.length, before.length + 2);
  for (const entry of before) assert.deepEqual(restored.find((item) => item.id === entry.id), entry);
  const samples = restored.filter((entry) => entry.sample);
  assert.equal(samples.length, 2);
  for (const sample of samples) {
    const outcome = await sampleCorrectionService.correct(sample);
    assert.equal(outcome.status, 'available');
    assert.equal(outcome.result.diaryId, sample.id);
  }
  const next = await repo.addSamples();
  assert.deepEqual(next, restored);
  const restarted = await createDiaryRepository(device).load();
  assert.deepEqual(restarted, restored);
  for (const sample of restarted.filter((entry) => entry.sample)) {
    assert.equal((await sampleCorrectionService.correct(sample)).status, 'available');
  }
});

test('failed sample import preserves saved entries and allows retry', async () => {
  const device = storage();
  const repo = createDiaryRepository(device);
  for (const entry of await repo.load()) await repo.remove(entry.id);
  const raw = [...device.values];
  device.failWrite = true;
  await assert.rejects(repo.addSamples());
  assert.deepEqual(await repo.load(), []);
  assert.deepEqual([...device.values], raw);
  device.failWrite = false;
  assert.equal((await repo.addSamples()).length, 2);
});
