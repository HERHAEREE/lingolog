const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule } = require('./test-support/load-typescript.cjs');
const load = (file) => loadModule(path.resolve(__dirname, `../src/${file}.ts`));
const { growthFor, historicalDays } = load('growth/growth-model');
const { createGrowthRepository, GROWTH_KEY } = load('growth/growth-repository');
const { createDiaryRepository, DIARY_STORAGE_KEY } = load('data/diary-repository');
const { questionForDay, writingQuestions, nextQuestion, questionById } = load('data/writing-questions');
const { themeFor } = load('data/city-themes');
function storage() {
  return { values: new Map(), writes: [], failKey: null, failRead: false,
    async getItem(key) { if (this.failRead) throw new Error('read'); return this.values.get(key) ?? null; },
    async setItem(key, value) { if (this.failKey === key) throw new Error('write'); this.writes.push(key); this.values.set(key, value); },
  };
}
const diary = (id, createdAt, language = 'en', extra = {}) => ({ id, content: 'A day in my life.', learningLanguage: language, createdAt, updatedAt: createdAt, ...extra });
const days = (count, language = 'en') => Array.from({ length: count }, (_, i) => ({ learningLanguage: language, date: `2026-10-${String(i + 1).padStart(2, '0')}` }));

test('five growth stages use cumulative unique days, separated by language', () => {
  for (const [count, index, remaining] of [[0, 0, 1], [1, 1, 2], [2, 1, 1], [3, 2, 2], [5, 3, 2], [7, 4, 0], [12, 4, 0]]) {
    const entries = [...days(count), ...days(7, 'ja')];
    if (count) entries.push(entries[0]);
    const progress = growthFor(entries, 'en');
    assert.equal(progress.count, count); assert.equal(progress.index, index); assert.equal(progress.remaining, remaining);
    assert.equal(growthFor(entries, 'ja').count, 7);
  }
});
test('legacy migration counts creation dates once, ignores all sample origins, and never modifies existing keys', async () => {
  const device = storage();
  const legacy = [diary('one', '2026-10-01T12:00:00Z'), diary('two', '2026-10-01T14:00:00Z'), diary('ja', '2026-10-01T12:00:00Z', 'ja'),
    diary('sample-1', '2026-10-02T12:00:00Z', 'en', { sample: false }),
    diary('copy', '2026-10-03T12:00:00Z', 'en', { sampleTemplateId: 'sample-2' }),
    diary('flag', '2026-10-04T12:00:00Z', 'en', { sample: true })];
  const raw = JSON.stringify({ version: 1, entries: legacy });
  device.values.set(DIARY_STORAGE_KEY, raw);
  device.values.set('learning', 'untouched'); device.values.set('reviews', 'untouched');
  const repo = createGrowthRepository(device);
  const result = await repo.reconcile(legacy, historicalDays(legacy));
  assert.equal(result.migration, true); assert.deepEqual(result.advanced, []);
  assert.equal(growthFor(result.data.days, 'en').count, 1); assert.equal(growthFor(result.data.days, 'ja').count, 1);
  await repo.reconcile(legacy, historicalDays(legacy));
  assert.deepEqual(device.writes, [GROWTH_KEY]);
  assert.equal(device.values.get(DIARY_STORAGE_KEY), raw);
  assert.equal(device.values.get('learning'), 'untouched'); assert.equal(device.values.get('reviews'), 'untouched');
  // A later timezone interpretation of a legacy timestamp is not a new reward.
  const reboot = await createGrowthRepository(device).reconcile(legacy, [{ learningLanguage: 'en', date: '2026-10-02', source: 'legacy' }]);
  assert.equal(growthFor(reboot.data.days, 'en').count, 1);
});
test('diary commit is independent of failed reward storage; retry survives deletion and restart', async () => {
  const device = storage(); const diaryRepo = createDiaryRepository(device); await diaryRepo.load();
  const growth = createGrowthRepository(device); await growth.reconcile(await diaryRepo.load(), diaryRepo.writingDays());
  device.failKey = GROWTH_KEY;
  const [saved] = await diaryRepo.create('Saved even if rewards fail.');
  const journal = diaryRepo.writingDays(); assert.equal(journal.length, 1);
  await assert.rejects(growth.reconcile(await diaryRepo.load(), journal));
  assert.ok((await diaryRepo.load()).some((entry) => entry.id === saved.id));
  await diaryRepo.remove(saved.id);
  const rebootDiary = createDiaryRepository(device); await rebootDiary.load();
  assert.deepEqual(rebootDiary.writingDays(), journal);
  device.failKey = null;
  const rebootGrowth = createGrowthRepository(device);
  const result = await rebootGrowth.reconcile(await rebootDiary.load(), rebootDiary.writingDays());
  assert.equal(growthFor(result.data.days, 'en').count, 1);
  await rebootGrowth.reconcile(await rebootDiary.load(), rebootDiary.writingDays());
  assert.equal(device.writes.filter((key) => key === GROWTH_KEY).length, 2);
});
test('multiple saves same day, edits, blank saves and sample imports never duplicate awards', async () => {
  const device = storage(); const repo = createDiaryRepository(device); await repo.load();
  await assert.rejects(repo.create('  ')); assert.equal(repo.writingDays().length, 0);
  await repo.create('First'); const [second] = await repo.create('Second');
  assert.equal(repo.writingDays().length, 1);
  await repo.update(second.id, 'Changed'); await repo.addSamples(); await repo.update('sample-1', 'Changed sample');
  assert.equal(repo.writingDays().length, 1);
  await repo.create('日本語', 'ja'); assert.equal(repo.writingDays().length, 2);
  device.failKey = DIARY_STORAGE_KEY;
  await assert.rejects(repo.create('Not committed'));
  assert.equal(repo.writingDays().length, 2);
});
test('migration failure preserves legacy days even if source diaries are deleted before retry', async () => {
  const device = storage(); device.values.set(DIARY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [diary('legacy', '2026-10-01T12:00:00Z')] }));
  const repo = createDiaryRepository(device); await repo.load();
  const growth = createGrowthRepository(device); device.failKey = GROWTH_KEY;
  await assert.rejects(growth.reconcile(await repo.load(), repo.writingDays()));
  await repo.remove('legacy'); device.failKey = null;
  const reboot = createDiaryRepository(device); await reboot.load();
  const restored = await createGrowthRepository(device).reconcile([], reboot.writingDays());
  assert.equal(growthFor(restored.data.days, 'en').count, 1);
});
test('concurrent delivery is idempotent and new milestones celebrate only once', async () => {
  const device = storage(); const repo = createGrowthRepository(device);
  await repo.reconcile([], []);
  const results = await Promise.all([repo.reconcile([], days(3)), repo.reconcile([], days(3))]);
  assert.deepEqual(results[0].advanced, ['en']); assert.deepEqual(results[1].advanced, []);
  assert.equal(growthFor(results[1].data.days, 'en').index, 2);
  const afterDeletion = await repo.reconcile([], []);
  assert.equal(growthFor(afterDeletion.data.days, 'en').count, 3);
});
test('corrupted reward and diary journal data are preserved and cannot be overwritten', async () => {
  for (const raw of ['bad JSON', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, migrated: true, days: [{ learningLanguage: 'en', date: '2026-02-30' }] })]) {
    const device = storage(); device.values.set(GROWTH_KEY, raw);
    await assert.rejects(createGrowthRepository(device).reconcile([], days(1)));
    assert.equal(device.values.get(GROWTH_KEY), raw); assert.equal(device.writes.length, 0);
  }
  const device = storage(); const raw = JSON.stringify({ version: 1, entries: [], writingDays: 'broken' });
  device.values.set(DIARY_STORAGE_KEY, raw); const repo = createDiaryRepository(device);
  await assert.rejects(repo.load()); await assert.rejects(repo.create('Must not overwrite'));
  assert.equal(device.values.get(DIARY_STORAGE_KEY), raw);
});
test('local dates avoid UTC midnight errors and retain awarded keys across timezone changes', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Seoul';
    const korean = historicalDays([diary('one', '2026-10-01T15:05:00Z')]);
    assert.equal(korean[0].date, '2026-10-02');
    process.env.TZ = 'America/New_York';
    const american = historicalDays([diary('two', '2026-10-02T00:05:00Z')]);
    assert.equal(american[0].date, '2026-10-01');
    assert.equal(korean[0].date, '2026-10-02');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('daily question is deterministic, cycles through all types and resolves route ids safely', () => {
  const day = '2026-10-10'; const question = questionForDay(day);
  assert.equal(questionForDay(day).id, question.id);
  const ids = new Set(); let current = question;
  const english = writingQuestions.filter((entry) => entry.learningLanguage === 'en');
  for (let i = 0; i < english.length; i++) { ids.add(current.id); current = nextQuestion(current); }
  assert.equal(ids.size, english.length); assert.equal(current.id, question.id);
  assert.equal(new Set(writingQuestions.map((entry) => entry.type)).size, 3);
  assert.equal(questionById('unknown'), undefined); assert.equal(questionById([question.id]), undefined);
  assert.equal(questionById(question.id).text, question.text);
});
test('city themes are distinct from language; unavailable cities/languages are not advertised as supported', () => {
  assert.equal(themeFor('en').id, 'new-york'); assert.equal(themeFor('en', 'london'), undefined);
  assert.equal(themeFor('ja').id, 'tokyo');
  assert.equal(themeFor('ja', 'new-york'), undefined);
});
