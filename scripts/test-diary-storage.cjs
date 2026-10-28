const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule } = require('./test-support/load-typescript.cjs');
const { createDiaryRepository, DIARY_STORAGE_KEY } = loadModule(path.resolve(__dirname, '../src/data/diary-repository.ts'));

function storage(initial = null) {
  return {
    value: initial, writes: 0, failRead: false, failWrite: false,
    async getItem(key) {
      assert.equal(key, DIARY_STORAGE_KEY);
      if (this.failRead) throw new Error('read failed');
      return this.value;
    },
    async setItem(key, value) {
      assert.equal(key, DIARY_STORAGE_KEY);
      if (this.failWrite) throw new Error('write failed');
      this.writes++;
      this.value = value;
    },
  };
}

test('load never writes, pending hydration blocks mutations', async () => {
  const device = storage();
  let resolveRead;
  device.getItem = () => new Promise((resolve) => { resolveRead = resolve; });
  const repo = createDiaryRepository(device);
  const load = repo.load();
  await assert.rejects(repo.create('Must not overwrite'));
  assert.equal(device.writes, 0);
  resolveRead(null);
  assert.equal((await load).length, 2);
  assert.equal(device.writes, 0);
});

test('create, edit, and delete survive new repository instances', async () => {
  const device = storage();
  const repo = createDiaryRepository(device);
  await repo.load();
  const entries = await repo.create('  Today was fun.\nI learned a word.  ');
  const original = entries[0];
  assert.equal(original.learningLanguage, 'en');
  assert.equal(original.content, 'Today was fun.\nI learned a word.');
  assert.equal(original.createdAt, original.updatedAt);
  assert.deepEqual((await createDiaryRepository(device).load())[0], original);
  const updated = (await repo.update(original.id, 'Updated text.'))[0];
  assert.equal(updated.id, original.id);
  assert.equal(updated.createdAt, original.createdAt);
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(original.updatedAt));
  assert.equal((await createDiaryRepository(device).load())[0].content, 'Updated text.');
  await repo.remove(original.id);
  assert.ok(!(await createDiaryRepository(device).load()).some((entry) => entry.id === original.id));
});

test('an empty saved list stays empty after restart without reseeding samples', async () => {
  const device = storage();
  const repo = createDiaryRepository(device);
  for (const entry of await repo.load()) await repo.remove(entry.id);
  assert.deepEqual(await createDiaryRepository(device).load(), []);
});

test('failed reads and invalid payloads preserve stored bytes and block writes', async () => {
  for (const raw of ['invalid json', JSON.stringify({ version: 3, entries: [] }), JSON.stringify({ version: 1, entries: [{ id: 'broken' }] })]) {
    const device = storage(raw);
    const repo = createDiaryRepository(device);
    await assert.rejects(repo.load());
    await assert.rejects(repo.create('New entry'));
    assert.equal(device.value, raw);
    assert.equal(device.writes, 0);
  }
  const device = storage(JSON.stringify({ version: 1, entries: [] }));
  device.failRead = true;
  const repo = createDiaryRepository(device);
  await assert.rejects(repo.load());
  await assert.rejects(repo.create('New entry'));
  device.failRead = false;
  assert.deepEqual(await repo.load(), []);
  assert.equal((await repo.create('Retry succeeds'))[0].content, 'Retry succeeds');
});

test('failed writes leave memory and disk intact and permit retry', async () => {
  const device = storage();
  const repo = createDiaryRepository(device);
  const before = await repo.load();
  device.failWrite = true;
  await assert.rejects(repo.create('Draft survives in caller'));
  await assert.rejects(repo.update(before[0].id, 'Changed'));
  await assert.rejects(repo.remove(before[0].id));
  assert.deepEqual(await repo.load(), before);
  assert.equal(device.value, null);
  device.failWrite = false;
  assert.equal((await repo.create('Draft survives in caller'))[0].content, 'Draft survives in caller');
});

test('concurrent writes are serialized and blank content is rejected', async () => {
  const device = storage(JSON.stringify({ version: 1, entries: [] }));
  const repo = createDiaryRepository(device);
  await repo.load();
  await assert.rejects(repo.create(' \n '));
  await Promise.all([repo.create('First'), repo.create('Second'), repo.create('Third')]);
  const restored = await createDiaryRepository(device).load();
  assert.equal(restored.length, 3);
  assert.equal(new Set(restored.map((entry) => entry.id)).size, 3);
  assert.deepEqual(restored.map((entry) => entry.content), ['Third', 'Second', 'First']);
});
