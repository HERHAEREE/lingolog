const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule } = require('./test-support/load-typescript.cjs');
const load = (name) => loadModule(path.resolve(__dirname, `../src/${name}.ts`));
const { createLearningRepository, LEARNING_STORAGE_KEY } = load('data/learning-repository');
const { createDiaryRepository } = load('data/diary-repository');
const { createPreferencesRepository, PREFERENCES_KEY } = load('data/preferences-repository');
const { createReviewRepository, REVIEW_STORAGE_KEY } = load('review/review-repository');
const { localDate, addDays, dueItems, reviewStats, createSession, revealSession, advanceSession, scheduleReview } = load('review/review-model');

function storage() {
  return {
    values: new Map(), writes: 0, failWrite: false, failRead: false,
    async getItem(key) { if (this.failRead) throw new Error('read failed'); return this.values.get(key) ?? null; },
    async setItem(key, value) { if (this.failWrite) throw new Error('write failed'); this.values.set(key, value); this.writes++; },
  };
}
const base = {
  id: 'legacy-1', type: 'word', expression: 'thankful', meaning: '감사하는',
  originalSentence: 'I felt grateful.', correctedExample: 'I felt thankful.', learningLanguage: 'en',
  sourceDiaryId: 'original', sourceCorrectionId: 'change-1', createdAt: '2026-10-01T10:00:00Z',
};
function assessment(attemptId, rating = 'remembered', learningLanguage = 'en', itemId = 'legacy-1') {
  return { attemptId, rating, learningLanguage, itemId, sessionId: 'session-1' };
}

test('legacy items gain defaults without losing content or overwriting original storage', async () => {
  const device = storage();
  const raw = JSON.stringify({ version: 1, items: [base] });
  device.values.set(LEARNING_STORAGE_KEY, raw);
  const repo = createLearningRepository(device);
  const [migrated] = await repo.load();
  assert.deepEqual(migrated, { ...base, explanationLanguage: 'ko' });
  assert.equal(device.values.get(LEARNING_STORAGE_KEY), raw);
  assert.equal(device.writes, 0);
  assert.equal(dueItems([migrated], [], 'en', '2026-10-10').length, 1);
  const { id, createdAt, ...input } = base;
  await repo.save({ ...input, learningLanguage: 'ja', expression: 'ありがとう', meaning: '고마워요' });
  assert.equal(JSON.parse(device.values.get(LEARNING_STORAGE_KEY)).version, 2);
  const restored = await createLearningRepository(device).load();
  assert.deepEqual(restored.find((entry) => entry.id === base.id), migrated);
  assert.equal(restored.length, 2);
  const missingLanguage = storage();
  const { learningLanguage, ...oldest } = base;
  missingLanguage.values.set(LEARNING_STORAGE_KEY, JSON.stringify({ version: 1, items: [oldest] }));
  assert.equal((await createLearningRepository(missingLanguage).load())[0].learningLanguage, 'en');
});

test('session requires answer reveal, retries at the back, and ends after one extra attempt', () => {
  let session = createSession(['a', 'b', 'c']);
  assert.equal(session.revealed, false);
  assert.throws(() => advanceSession(session, 'remembered'));
  session = advanceSession(revealSession(session), 'again');
  assert.deepEqual(session.queue, ['b', 'c', 'a']);
  assert.equal(session.revealed, false);
  session = advanceSession(revealSession(session), 'remembered');
  session = advanceSession(revealSession(session), 'remembered');
  session = advanceSession(revealSession(session), 'again');
  assert.deepEqual(session.queue, []);
  assert.equal(session.assessments, 4);
  assert.equal(session.again, 2);
  assert.equal(session.remembered, 2);
});

test('calendar schedules cross month/year boundaries and use increasing intervals', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  let state;
  const time = new Date(2026, 9, 10, 23, 50);
  for (const days of [1, 3, 7, 14, 30, 30]) {
    state = scheduleReview(state, 'one', 'en', 'remembered', time);
    assert.equal(state.intervalDays, days);
    assert.equal(state.dueDate, addDays(localDate(time), days));
  }
  state = scheduleReview(state, 'one', 'en', 'again', time);
  assert.equal(state.streak, 0);
  assert.equal(state.dueDate, '2026-10-10');
  assert.equal(scheduleReview(state, 'one', 'en', 'remembered', time).intervalDays, 1);
});

test('self assessments, schedule and history persist atomically with idempotent attempts', async () => {
  const device = storage();
  const time = new Date(2026, 9, 10, 14);
  const repo = createReviewRepository(device, () => time);
  assert.deepEqual(await repo.load(), { states: [], history: [] });
  assert.equal(device.writes, 0);
  const first = await repo.record(assessment('one'));
  assert.equal(first.states[0].dueDate, '2026-10-11');
  assert.equal(first.history[0].evaluationSource, 'self');
  assert.equal(first.history[0].automaticGrade, null);
  assert.equal(first.history[0].selfRating, 'remembered');
  await repo.record(assessment('one'));
  assert.equal(device.writes, 1);
  assert.deepEqual(await createReviewRepository(device).load(), first);
  const again = await repo.record(assessment('two', 'again'));
  assert.equal(again.history.length, 2);
  assert.equal(again.states[0].dueDate, '2026-10-10');
});

test('due queues and statistics are isolated by language, including the same item id', async () => {
  const device = storage();
  const repo = createReviewRepository(device, () => new Date(2026, 9, 10, 14));
  await repo.load();
  await repo.record(assessment('en-1', 'remembered'));
  const data = await repo.record(assessment('ja-1', 'again', 'ja'));
  const items = [{ ...base, explanationLanguage: 'ko' }, { ...base, learningLanguage: 'ja', expression: '感謝する', explanationLanguage: 'ko' }];
  assert.equal(dueItems(items, data.states, 'en', '2026-10-10').length, 0);
  assert.equal(dueItems(items, data.states, 'ja', '2026-10-10').length, 1);
  assert.equal(dueItems(items, data.states, 'en', '2026-10-11').length, 1);
  assert.equal(reviewStats(items, data, 'en', '2026-10-10').remembered, 1);
  assert.equal(reviewStats(items, data, 'en', '2026-10-10').again, 0);
  assert.equal(reviewStats(items, data, 'ja', '2026-10-10').again, 1);
  assert.equal(reviewStats(items, data, 'ja', '2026-10-10').remembered, 0);
});

test('failed writes preserve both schedule and history and allow retry without advancing', async () => {
  const device = storage();
  const repo = createReviewRepository(device);
  await repo.load();
  const before = await repo.record(assessment('before'));
  const raw = device.values.get(REVIEW_STORAGE_KEY);
  device.failWrite = true;
  await assert.rejects(repo.record(assessment('retry', 'again')));
  assert.deepEqual(await repo.load(), before);
  assert.equal(device.values.get(REVIEW_STORAGE_KEY), raw);
  device.failWrite = false;
  const after = await repo.record(assessment('retry', 'again'));
  assert.equal(after.history.length, 2);
});

test('load errors, corruption and writes before hydration do not destroy review data', async () => {
  for (const raw of ['bad json', JSON.stringify({ version: 99, states: [], history: [] }), JSON.stringify({ version: 1, states: [{}], history: [] })]) {
    const device = storage();
    device.values.set(REVIEW_STORAGE_KEY, raw);
    const repo = createReviewRepository(device);
    await assert.rejects(repo.record(assessment('early')));
    await assert.rejects(repo.load());
    await assert.rejects(repo.record(assessment('after')));
    assert.equal(device.values.get(REVIEW_STORAGE_KEY), raw);
  }
  const device = storage();
  const repo = createReviewRepository(device);
  device.failRead = true;
  await assert.rejects(repo.load());
  device.failRead = false;
  await repo.load();
  await repo.record(assessment('retry'));
});

test('language preferences persist independently and failed updates preserve previous setting', async () => {
  const device = storage();
  const repo = createPreferencesRepository(device);
  await assert.rejects(repo.save({ learningLanguage: 'ja', explanationLanguage: 'ko' }));
  assert.deepEqual(await repo.load(), { learningLanguage: 'en', explanationLanguage: 'ko' });
  await repo.save({ learningLanguage: 'ja', explanationLanguage: 'ko' });
  assert.deepEqual(await createPreferencesRepository(device).load(), { learningLanguage: 'ja', explanationLanguage: 'ko' });
  const raw = device.values.get(PREFERENCES_KEY);
  device.failWrite = true;
  await assert.rejects(repo.save({ learningLanguage: 'en', explanationLanguage: 'ko' }));
  assert.equal(device.values.get(PREFERENCES_KEY), raw);
});

test('Japanese diary creation preserves language and does not affect existing English diaries', async () => {
  const device = storage();
  const repo = createDiaryRepository(device);
  await repo.load();
  const entries = await repo.create('今日は楽しかったです。', 'ja');
  const restored = await createDiaryRepository(device).load();
  assert.equal(restored[0].learningLanguage, 'ja');
  assert.equal(restored[0].content, entries[0].content);
  assert.equal(restored.filter((entry) => entry.learningLanguage === 'en').length, 2);
});
