const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule } = require('./test-support/load-typescript.cjs');
const load = (name) => loadModule(path.resolve(__dirname, `../src/${name}.ts`));
const { localDate, monthCells, monthStart, shiftMonth, canWriteOn, diaryDate } = load('dates/local-date');
const { createDiaryRepository, DIARY_STORAGE_KEY } = load('data/diary-repository');
const { createGrowthRepository } = load('growth/growth-repository');
const { growthFor } = load('growth/growth-model');
const { writerRequest, keepExistingDraft } = load('data/writer-draft');
const { questionForDay, nextQuestion, writingQuestions } = load('data/writing-questions');
const { calendarEntries, calendarCounts } = load('data/diary-calendar');
const { sampleCorrectionService } = load('correction/sample-correction-service');
const entry = (id, language = 'en', extra = {}) => ({ id, learningLanguage: language, content: 'A quiet day.', createdAt: '2026-10-01T15:05:00Z', updatedAt: '2026-10-01T15:05:00Z', ...extra });
function storage() {
  return { values: new Map(), writes: 0, fail: false,
    async getItem(key) { return this.values.get(key) ?? null; },
    async setItem(key, value) { if (this.fail) throw new Error('write'); this.writes++; this.values.set(key, value); },
  };
}
test('legacy diary migration fixes local dates once and preserves journal and existing fields', async () => {
  const device = storage(); const journal = [{ learningLanguage: 'en', date: '2026-10-02' }];
  const original = entry('legacy');
  device.values.set(DIARY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [original], writingDays: journal }));
  device.values.set('learning-items', 'keep'); device.values.set('review', 'keep');
  const repo = createDiaryRepository(device);
  const [migrated] = await repo.load();
  assert.deepEqual(migrated, { ...original, diaryDate: localDate(new Date(original.createdAt)) });
  assert.deepEqual(repo.writingDays(), journal);
  assert.equal(JSON.parse(device.values.get(DIARY_STORAGE_KEY)).version, 2);
  assert.equal(device.writes, 1);
  assert.deepEqual(await createDiaryRepository(device).load(), [migrated]);
  assert.equal(device.writes, 1);
  assert.equal(device.values.get('learning-items'), 'keep'); assert.equal(device.values.get('review'), 'keep');
});
test('failed date migration leaves original bytes intact and blocks mutations until retry', async () => {
  const device = storage(); const raw = JSON.stringify({ version: 1, entries: [entry('legacy')] });
  device.values.set(DIARY_STORAGE_KEY, raw); device.fail = true;
  const repo = createDiaryRepository(device);
  await assert.rejects(repo.load()); await assert.rejects(repo.create('Blocked'));
  assert.equal(device.values.get(DIARY_STORAGE_KEY), raw);
  device.fail = false; assert.equal((await repo.load()).length, 1);
});
test('backdated diaries go on selected days but earn only the actual writing day', async () => {
  const device = storage(); const repo = createDiaryRepository(device); await repo.load();
  const [first] = await repo.create('A memory', 'en', '2020-01-01');
  const [second] = await repo.create('Another memory', 'en', '2020-01-02');
  assert.equal(first.diaryDate, '2020-01-01'); assert.equal(second.diaryDate, '2020-01-02');
  assert.equal(repo.writingDays().length, 1); assert.equal(repo.writingDays()[0].date, localDate(new Date(second.createdAt)));
  const growth = await createGrowthRepository(device).reconcile(await repo.load(), repo.writingDays());
  assert.equal(growthFor(growth.data.days, 'en').count, 1);
  const updated = (await repo.update(first.id, 'Updated memory')).find((item) => item.id === first.id);
  assert.equal(updated.diaryDate, first.diaryDate); assert.equal(updated.createdAt, first.createdAt);
  const reboot = await createDiaryRepository(device).load();
  assert.equal(reboot.find((item) => item.id === first.id).diaryDate, '2020-01-01');
});
test('future and malformed dates are rejected in storage as well as writer requests', async () => {
  const device = storage(); const repo = createDiaryRepository(device); await repo.load();
  for (const date of ['9999-12-31', '2026-02-30', 'wrong']) await assert.rejects(repo.create('Invalid day', 'ja', date));
  assert.equal(device.writes, 0); assert.equal(repo.writingDays().length, 0);
  assert.throws(() => writerRequest({ date: '2026-10-11' }, 'en', '2026-10-10'));
  assert.equal(canWriteOn('2026-10-10', '2026-10-10'), true);
  assert.equal(canWriteOn('2026-10-11', '2026-10-10'), false);
});
test('calendar keeps all same-day entries and isolates languages and assigned dates', () => {
  const all = [entry('one', 'en', { diaryDate: '2020-01-01' }), entry('two', 'en', { diaryDate: '2020-01-01' }), entry('ja', 'ja', { diaryDate: '2020-01-01' }), entry('other', 'en', { diaryDate: '2020-01-02' })];
  assert.deepEqual(calendarEntries(all, 'en', '2020-01-01').map((item) => item.id), ['one', 'two']);
  assert.equal(calendarCounts(all, 'en').get('2020-01-01'), 2);
  assert.equal(calendarCounts(all, 'ja').get('2020-01-01'), 1);
  assert.deepEqual(calendarEntries(all, 'en', '2020-01-03'), []);
});
test('monthly calendar handles leap years, weekdays and year boundaries without UTC parsing', () => {
  const leap = monthCells('2024-02-01');
  assert.equal(leap.filter(Boolean).length, 29); assert.equal(leap.length % 7, 0);
  assert.equal(leap[0], null); assert.equal(leap[4], '2024-02-01');
  assert.equal(monthCells('2025-02-01').filter(Boolean).length, 28);
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01');
  assert.equal(monthStart('2026-10-31'), '2026-10-01');
});
test('migrated diary calendar dates remain fixed after a timezone change', async () => {
  const previous = process.env.TZ;
  try {
    const device = storage(); device.values.set(DIARY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [entry('timezone')] }));
    process.env.TZ = 'Asia/Seoul';
    const [korean] = await createDiaryRepository(device).load(); assert.equal(diaryDate(korean), '2026-10-02');
    process.env.TZ = 'America/New_York';
    const [reboot] = await createDiaryRepository(device).load(); assert.equal(diaryDate(reboot), '2026-10-02');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('navigation preserves a nonempty draft content, language, date and question', () => {
  const existing = { content: '書きかけの日記', language: 'ja', date: '2026-10-01', questionId: 'ja-day-smile' };
  const incoming = writerRequest({ language: 'en', date: '2026-10-10', questionId: 'day-smile' }, 'ja', '2026-10-10');
  assert.deepEqual(keepExistingDraft(existing, incoming), existing);
  assert.deepEqual(keepExistingDraft({ ...existing, content: ' ' }, incoming), incoming);
  assert.equal(writerRequest({ language: 'ja', questionId: 'day-smile' }, 'en', '2026-10-10').questionId, undefined);
});
test('Japanese daily questions are stable, shown with Korean guidance and never switch into English', () => {
  const question = questionForDay('2026-10-10', 'ja');
  assert.equal(questionForDay('2026-10-10', 'ja').id, question.id);
  assert.ok(question.korean.length); const ids = new Set(); let current = question;
  const count = writingQuestions.filter((item) => item.learningLanguage === 'ja').length;
  for (let i = 0; i < count; i++) { assert.equal(current.learningLanguage, 'ja'); ids.add(current.id); current = nextQuestion(current); }
  assert.equal(ids.size, count); assert.equal(current.id, question.id);
});
test('Japanese correction clearly remains unsupported and cannot attach English sample output', async () => {
  const result = await sampleCorrectionService.correct(entry('sample-1', 'ja', { sample: true }));
  assert.equal(result.status, 'unsupported'); assert.match(result.message, /일본어 교정/);
});
