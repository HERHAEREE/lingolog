const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule } = require('./test-support/load-typescript.cjs');
const load = (name) => loadModule(path.resolve(__dirname, `../src/${name}.ts`));
const { includesExpression, missionSuggestions, currentReuseRecords } = load('reuse/reuse-model');
const { createReuseRepository, REUSE_KEY } = load('reuse/reuse-repository');
const { createDiaryRepository, DIARY_STORAGE_KEY } = load('data/diary-repository');
const { keepExistingDraft } = load('data/writer-draft');
function storage() {
  return { values: new Map(), writes: [], failKey: null, failRead: false,
    async getItem(key) { if (this.failRead && key === REUSE_KEY) throw new Error('read'); return this.values.get(key) ?? null; },
    async setItem(key, value) { if (this.failKey === key) throw new Error('write'); this.writes.push(key); this.values.set(key, value); },
  };
}
const target = { itemId: 'thankful', learningLanguage: 'en', expression: 'thankful' };
const item = (id, language = 'en', expression = id) => ({ id, learningLanguage: language, expression, meaning: '한국어 뜻', correctedExample: 'My example.', type: 'expression', createdAt: '2026-10-01T09:00:00Z' });
const diary = (content = 'I am thankful.', extra = {}) => ({ id: 'diary', content, learningLanguage: 'en', createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', revision: 1, reuseTargets: [target], ...extra });
const checked = new Date('2026-10-10T10:00:00Z');
test('English normalizes case and repeated spaces but rejects substrings inside words', () => {
  assert.equal(includesExpression('I WENT   FOR\n A WALK today.', 'went for a walk', 'en'), true);
  assert.equal(includesExpression('I felt THANKFUL!', 'thankful', 'en'), true);
  for (const text of ['thankfully', 'unthankful', 'thankful2', 'my_thankful', 'éthankful']) assert.equal(includesExpression(text, 'thankful', 'en'), false, text);
  assert.equal(includesExpression('A party.', 'art', 'en'), false);
  assert.equal(includesExpression('I saw (art).', 'art', 'en'), true);
  assert.equal(includesExpression('I use C++.', 'C++', 'en'), true);
  assert.equal(includesExpression('I walked.', 'walk', 'en'), false);
  assert.equal(includesExpression('I am grateful.', 'thankful', 'en'), false);
  assert.equal(includesExpression('Anything', '   ', 'en'), false);
});
test('Japanese checks substrings without English boundaries or synonym/inflection claims', () => {
  assert.equal(includesExpression('今日はありがとうと言いました。', 'ありがとう', 'ja'), true);
  assert.equal(includesExpression('友達と散歩しました。', '散歩', 'ja'), true);
  assert.equal(includesExpression('食べました。', '食べる', 'ja'), false);
  assert.equal(includesExpression('ＡＢＣを見ました', 'ABC', 'ja'), true);
  assert.equal(includesExpression('嬉しいです', '楽しい', 'ja'), false);
});
test('suggestions prioritize reviewed items, isolate languages and cap at two unique expressions', () => {
  const items = [item('new'), item('reviewed'), item('older'), item('ja', 'ja', '散歩'), item('duplicate', 'en', 'REVIEWED')];
  const history = [{ itemId: 'reviewed', learningLanguage: 'en', reviewedAt: '2026-10-09T09:00:00Z' }, { itemId: 'older', learningLanguage: 'en', reviewedAt: '2026-10-08T09:00:00Z' }];
  assert.deepEqual(missionSuggestions(items, history, 'en').map((entry) => entry.itemId), ['reviewed', 'older']);
  assert.deepEqual(missionSuggestions(items, history, 'ja').map((entry) => entry.itemId), ['ja']);
  assert.equal(missionSuggestions([], history, 'en').length, 0);
  assert.equal(missionSuggestions([item('one')], [], 'en').length, 1);
});
test('other-expression selection brings unseen expressions forward without exceeding two', () => {
  const items = ['one', 'two', 'three', 'four'].map((id) => item(id));
  const initial = missionSuggestions(items, [], 'en');
  const other = missionSuggestions(items, [], 'en', initial.map((entry) => entry.itemId));
  assert.equal(other.length, 2); assert.ok(other.every((entry) => !initial.some((old) => old.itemId === entry.itemId)));
});
test('checks persist required metadata and idempotent replay/restart never duplicates a diary-item pair', async () => {
  const device = storage(); const repo = createReuseRepository(device, () => checked);
  const records = await repo.reconcile([diary()]);
  assert.deepEqual(records[0], { ...target, diaryId: 'diary', checkedAt: checked.toISOString(), diaryRevision: 1, diaryUpdatedAt: diary().updatedAt, included: true, diaryDeleted: false });
  await Promise.all([repo.reconcile([diary()]), repo.reconcile([diary()])]);
  assert.equal(device.writes.length, 1);
  const reboot = await createReuseRepository(device).reconcile([diary()]);
  assert.deepEqual(reboot, records); assert.equal(currentReuseRecords(reboot, [diary()], target.itemId, 'en').length, 1);
});
test('editing removes and restores current inclusion even when update timestamps are equal', async () => {
  const device = storage(); const repo = createReuseRepository(device, () => checked);
  const original = diary(); const first = await repo.reconcile([original]);
  const removed = diary('A quiet day.', { revision: 2 });
  assert.equal(currentReuseRecords(first, [removed]).length, 0);
  const second = await repo.reconcile([removed]); assert.equal(second.length, 1); assert.equal(second[0].included, false); assert.equal(second[0].diaryRevision, 2);
  const restored = diary('I am thankful again.', { revision: 3 });
  const third = await repo.reconcile([restored]); assert.equal(third.length, 1); assert.equal(third[0].included, true);
});
test('deleted diaries are immediately excluded and deletion persists without unsafe links', async () => {
  const device = storage(); const repo = createReuseRepository(device);
  const before = await repo.reconcile([diary()]); assert.equal(currentReuseRecords(before, []).length, 0);
  const after = await repo.reconcile([]); assert.equal(after[0].diaryDeleted, true); assert.equal(after[0].included, false);
  const reboot = await createReuseRepository(device).reconcile([]); assert.deepEqual(reboot, after);
});
test('reuse storage failures preserve diaries and retry from durable mission targets after restart', async () => {
  const device = storage(); const diaries = createDiaryRepository(device); await diaries.load();
  const [saved] = await diaries.create('I am thankful.', 'en', '2020-01-01', [target]);
  device.failKey = REUSE_KEY;
  await assert.rejects(createReuseRepository(device).reconcile(await diaries.load()));
  assert.ok(device.values.has(DIARY_STORAGE_KEY)); assert.equal(device.values.has(REUSE_KEY), false);
  const rebootDiaries = createDiaryRepository(device); const loaded = await rebootDiaries.load();
  assert.deepEqual(loaded.find((entry) => entry.id === saved.id).reuseTargets, [target]);
  device.failKey = null;
  const records = await createReuseRepository(device).reconcile(loaded); assert.equal(records.length, 1); assert.equal(records[0].included, true);
  assert.equal(rebootDiaries.writingDays().length, 1);
});
test('failed update/delete check cannot leave stale inclusion in current statistics', async () => {
  const device = storage(); const repo = createReuseRepository(device);
  const original = diary(); const before = await repo.reconcile([original]); const raw = device.values.get(REUSE_KEY);
  device.failKey = REUSE_KEY;
  const removed = diary('No target.', { revision: 2 }); await assert.rejects(repo.reconcile([removed]));
  assert.equal(device.values.get(REUSE_KEY), raw); assert.equal(currentReuseRecords(before, [removed]).length, 0);
  await assert.rejects(repo.reconcile([])); assert.equal(currentReuseRecords(before, []).length, 0);
  device.failKey = null; const next = await repo.reconcile([removed]); assert.equal(next[0].included, false);
});
test('missing records read as empty without writes; corrupt reads never overwrite existing bytes', async () => {
  const empty = storage(); assert.deepEqual(await createReuseRepository(empty).reconcile([]), []); assert.equal(empty.writes.length, 0);
  for (const raw of ['bad JSON', JSON.stringify({ version: 2, records: [] }), JSON.stringify({ version: 1, records: [{ itemId: 'broken' }] })]) {
    const device = storage(); device.values.set(REUSE_KEY, raw);
    await assert.rejects(createReuseRepository(device).reconcile([diary()]));
    assert.equal(device.values.get(REUSE_KEY), raw); assert.equal(device.writes.length, 0);
  }
  const device = storage(); device.failRead = true; const repo = createReuseRepository(device);
  await assert.rejects(repo.reconcile([diary()])); assert.equal(device.writes.length, 0);
  device.failRead = false; assert.equal((await repo.reconcile([diary()])).length, 1);
});
test('diary revisions and target snapshots survive edit/restart; skip or no mission creates no check', async () => {
  const device = storage(); const repo = createDiaryRepository(device); await repo.load();
  const [saved] = await repo.create('I am thankful.', 'en', undefined, [target]);
  const updated = (await repo.update(saved.id, 'No expression now.')).find((entry) => entry.id === saved.id);
  assert.equal(updated.revision, 2); assert.deepEqual(updated.reuseTargets, [target]); assert.equal(updated.diaryDate, saved.diaryDate);
  const fresh = await createDiaryRepository(device).load(); assert.equal(fresh.find((entry) => entry.id === saved.id).revision, 2);
  const [skipped] = await repo.create('thankful', 'en', undefined, []);
  const checks = await createReuseRepository(device).reconcile(await repo.load());
  assert.ok(!checks.some((record) => record.diaryId === skipped.id));
  await assert.rejects(repo.create('Wrong language.', 'ja', undefined, [target]));
});
test('draft retention includes chosen targets and skip state across navigation', () => {
  const existing = { content: 'In progress.', language: 'en', date: '2026-10-01', reuseMission: { targets: [{ ...target, meaning: '감사하는', example: 'I am thankful.' }], skipped: true } };
  assert.deepEqual(keepExistingDraft(existing, { content: '', language: 'ja', date: '2026-10-10' }), existing);
});
