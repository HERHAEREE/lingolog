const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule } = require('./test-support/load-typescript.cjs');
const load = (name) => loadModule(path.resolve(__dirname, `../src/${name}.ts`));
const { sampleEntries } = load('data/diary-model');
const { sampleCorrectionService } = load('correction/sample-correction-service');
const { createCorrectionRepository, CORRECTION_STORAGE_KEY } = load('correction/correction-repository');
const { createCorrectionController, requestKey, selectCorrection } = load('correction/correction-controller');
const { validateCorrection, validateForRequest, matchesOriginal } = load('correction/correction-validation');
const { createServerCorrectionService } = load('correction/server-correction-service');
const { createLearningRepository } = load('data/learning-repository');
function storage() {
  return { values: new Map(), writes: 0, failRead: false, failWrite: false,
    async getItem(key) { if (this.failRead) throw Error('read failed'); return this.values.get(key) ?? null; },
    async setItem(key, value) { if (this.failWrite) throw Error('write failed'); this.writes++; this.values.set(key, value); },
  };
}
const entry = () => structuredClone(sampleEntries[0]);
const sampleResult = async (diary = entry()) => (await sampleCorrectionService.correct(diary)).result;
const services = (sample = sampleCorrectionService, server = createServerCorrectionService({ enabled: false })) => ({ sample, server });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const response = (result, status = 200) => new Response(JSON.stringify({ schemaVersion: 1, result }), { status });
const serverConfig = { enabled: true, endpoint: 'https://example.test/functions/v1/correct-diary', getAccessToken: async () => 'user-session' };

test('sample schema preserves original, revision, language, Korean explanations and optional suggestions', async () => {
  const diary = { ...entry(), revision: 4 };
  const before = structuredClone(diary), result = validateCorrection(await sampleResult(diary));
  assert.equal(result.originalVersion, 4); assert.equal(result.originalUpdatedAt, diary.updatedAt);
  assert.equal(result.explanationLanguage, 'ko'); assert.equal(result.original, diary.content);
  assert.ok(Number.isFinite(Date.parse(result.correctedAt)));
  assert.equal(result.changes.filter((change) => change.kind === 'grammar').length, 0);
  assert.equal(result.learningItems.length, 2); assert.deepEqual(diary, before);
});
test('persisted results survive restart independently without modifying existing keys', async () => {
  const device = storage(); device.values.set('existing-data', 'keep');
  const repo = createCorrectionRepository(device);
  assert.deepEqual(await repo.load(), []); assert.equal(device.writes, 0);
  const result = await sampleResult(); await repo.save(result);
  assert.deepEqual(await createCorrectionRepository(device).load(), [result]);
  assert.equal(device.values.get('existing-data'), 'keep');
  result.changes[0].meaning = 'mutated'; assert.notEqual((await repo.load())[0].changes[0].meaning, 'mutated');
});
test('corrupt or failed hydration never overwrites bytes and blocks correction writes until retry', async () => {
  const device = storage(), result = await sampleResult();
  const repo = createCorrectionRepository(device);
  await assert.rejects(repo.save(result));
  device.values.set(CORRECTION_STORAGE_KEY, '{broken');
  await assert.rejects(repo.load()); await assert.rejects(repo.save(result));
  assert.equal(device.values.get(CORRECTION_STORAGE_KEY), '{broken'); assert.equal(device.writes, 0);
  device.values.delete(CORRECTION_STORAGE_KEY); device.failRead = true; await assert.rejects(repo.load());
  device.failRead = false; await repo.load(); await repo.save(result); assert.equal(device.writes, 1);
});
test('same original reopens cached result without requesting; forced recorrection replaces only that version', async () => {
  let calls = 0;
  const device = storage(), spy = { async correct(diary) { calls++; return sampleCorrectionService.correct(diary); } };
  const ctrl = createCorrectionController(createCorrectionRepository(device), services(spy)); await ctrl.load();
  await ctrl.request(entry(), 'sample'); await ctrl.request(entry(), 'sample'); assert.equal(calls, 1);
  await ctrl.request(entry(), 'sample', true); assert.equal(calls, 2); assert.equal(ctrl.snapshot().results.length, 1);
  const reopened = createCorrectionController(createCorrectionRepository(device), services(spy)); await reopened.load();
  await reopened.request(entry(), 'sample'); assert.equal(calls, 2);
});
test('concurrent clicks and mode switches have one request per diary', async () => {
  let calls = 0; const wait = deferred();
  const ctrl = createCorrectionController(createCorrectionRepository(storage()), services({ async correct(diary) { calls++; await wait.promise; return sampleCorrectionService.correct(diary); } }));
  await ctrl.load(); const first = ctrl.request(entry(), 'sample');
  const second = ctrl.request(entry(), 'sample'); const third = ctrl.request(entry(), 'server');
  assert.equal(first, second); assert.equal(first, third);
  assert.equal(ctrl.snapshot().requests[requestKey(entry().id, 'sample')].status, 'requesting');
  wait.resolve(); await first; assert.equal(calls, 1);
});
test('late response remains bound to submitted original, never the edited diary', async () => {
  const wait = deferred(), diary = entry();
  const ctrl = createCorrectionController(createCorrectionRepository(storage()), services({ async correct(snapshot) { await wait.promise; return sampleCorrectionService.correct(snapshot); } }));
  await ctrl.load(); const task = ctrl.request(diary, 'sample');
  diary.content = 'This is a new version.'; diary.revision = 1;
  wait.resolve(); await task;
  const result = selectCorrection(ctrl.snapshot().results, diary, 'sample');
  assert.equal(result.original, sampleEntries[0].content); assert.equal(matchesOriginal(result, diary), false);
});
test('failure retains existing correction and diary; retry can complete without duplicating results', async () => {
  const device = storage(), diary = entry(), before = structuredClone(diary);
  const ctrl = createCorrectionController(createCorrectionRepository(device), services()); await ctrl.load(); await ctrl.request(diary, 'sample');
  const saved = structuredClone(ctrl.snapshot().results); const bytes = device.values.get(CORRECTION_STORAGE_KEY);
  device.failWrite = true; await ctrl.request(diary, 'sample', true);
  assert.equal(ctrl.snapshot().requests[requestKey(diary.id, 'sample')].status, 'failed');
  assert.deepEqual(ctrl.snapshot().results, saved); assert.equal(device.values.get(CORRECTION_STORAGE_KEY), bytes); assert.deepEqual(diary, before);
  device.failWrite = false; await ctrl.request(diary, 'sample', true);
  assert.equal(ctrl.snapshot().requests[requestKey(diary.id, 'sample')].status, 'completed'); assert.equal(ctrl.snapshot().results.length, 1);
});
test('wrong snapshot, source, language and unrelated examples are rejected', async () => {
  const result = await sampleResult();
  for (const patch of [{ diaryId: 'another' }, { originalVersion: 99 }, { originalUpdatedAt: '2020-01-01T00:00:00Z' }, { original: 'unrelated' }, { learningLanguage: 'ja' }, { source: 'server' }, { explanationLanguage: 'en' }]) {
    assert.throws(() => validateForRequest({ ...result, ...patch }, entry(), 'sample'));
  }
  assert.throws(() => validateCorrection({ ...result, changes: [{ ...result.changes[0], originalSentence: 'unrelated' }] }));
  assert.throws(() => validateCorrection({ ...result, learningItems: [{ ...result.learningItems[0], expression: 'different' }] }));
  assert.throws(() => validateCorrection({ ...result, changes: [result.changes[0], result.changes[0]] }));
});
test('disabled, unconfigured and unauthenticated server modes never call transport or fall back to sample', async () => {
  let calls = 0; const transport = async () => { calls++; return response(await sampleResult()); };
  for (const config of [{ enabled: false }, { ...serverConfig, enabled: false }, { ...serverConfig, getAccessToken: async () => null }]) {
    await assert.rejects(createServerCorrectionService(config, transport).correct(entry()));
  }
  const ctrl = createCorrectionController(createCorrectionRepository(storage()), services()); await ctrl.load(); await ctrl.request(entry(), 'server');
  assert.equal(ctrl.snapshot().requests[requestKey(entry().id, 'server')].status, 'failed'); assert.deepEqual(ctrl.snapshot().results, []); assert.equal(calls, 0);
});
test('server adapter sends only captured contract and session auth; validates English and Japanese', async () => {
  for (const language of ['en', 'ja']) {
    const diary = { ...entry(), learningLanguage: language, revision: 7, content: language === 'ja' ? '今日は散歩しました。' : entry().content };
    const result = { ...(await sampleResult()), source: 'server', learningLanguage: language, originalVersion: 7,
      original: diary.content, corrected: diary.content, changes: [], learningItems: [] };
    let sent;
    const service = createServerCorrectionService({ ...serverConfig, publishableKey: 'public-project-key' }, async (url, options) => {
      sent = { url, ...options }; return response(result);
    });
    const outcome = await service.correct(diary); assert.deepEqual(outcome.result, result);
    assert.equal(sent.headers.Authorization, 'Bearer user-session'); assert.equal(sent.headers.apikey, 'public-project-key');
    const body = JSON.parse(sent.body); assert.equal(body.original, diary.content); assert.equal(body.originalVersion, 7); assert.equal(body.explanationLanguage, 'ko');
    assert.deepEqual(Object.keys(body).sort(), ['diaryId', 'explanationLanguage', 'learningLanguage', 'original', 'originalUpdatedAt', 'originalVersion', 'schemaVersion']);
  }
});
test('HTTP errors, malformed JSON, oversized and wrong-version responses cannot become successful corrections', async () => {
  const result = { ...(await sampleResult()), source: 'server' };
  for (const reply of [response(result, 429), response(result, 401), response(result, 500), new Response('{broken'), new Response('x'.repeat(100001)),
    new Response(JSON.stringify({ schemaVersion: 2, result })), response({ ...result, diaryId: 'wrong' })]) {
    await assert.rejects(createServerCorrectionService(serverConfig, async () => reply).correct(entry()));
  }
  await assert.rejects(createServerCorrectionService(serverConfig, async () => { throw Error('offline'); }).correct(entry()), /연결하지/);
});
test('timeout bounds stalled fetch, response body and token lookup, aborting requests', async () => {
  const blocked = () => new Promise(() => {});
  let signal;
  const transport = async (_url, options) => { signal = options.signal; return blocked(); };
  await assert.rejects(createServerCorrectionService({ ...serverConfig, timeoutMs: 10 }, transport).correct(entry()), /초과/);
  assert.equal(signal.aborted, true);
  await assert.rejects(createServerCorrectionService({ ...serverConfig, timeoutMs: 10 }, async () => ({ ok: true, text: blocked })).correct(entry()), /초과/);
  await assert.rejects(createServerCorrectionService({ ...serverConfig, timeoutMs: 10, getAccessToken: blocked }, transport).correct(entry()), /초과/);
});
test('client length limits and HTTPS validation stop transport but do not change diary content', async () => {
  let calls = 0; const transport = async () => { calls++; };
  const diary = { ...entry(), content: 'a'.repeat(5001) };
  await assert.rejects(createServerCorrectionService(serverConfig, transport).correct(diary)); assert.equal(diary.content.length, 5001);
  await assert.rejects(createServerCorrectionService({ ...serverConfig, endpoint: 'http://example.test' }, transport).correct(entry())); assert.equal(calls, 0);
});
test('version history persists and selector prefers matching current original over a late older result', async () => {
  const device = storage(), repo = createCorrectionRepository(device); await repo.load();
  const original = await sampleResult(), diary = { ...entry(), content: 'A new diary.', revision: 1 };
  const edited = { ...original, originalVersion: 1, original: diary.content, corrected: diary.content, changes: [], learningItems: [] };
  await repo.save(edited); await repo.save(original);
  const results = await createCorrectionRepository(device).load(); assert.equal(results.length, 2);
  assert.equal(selectCorrection(results, diary, 'sample').originalVersion, 1);
});
test('recorrection item ids can change without duplicate vocabulary or loss of original/corrected examples', async () => {
  const device = storage(), repo = createLearningRepository(device); await repo.load();
  const result = await sampleResult(), item = result.learningItems[0];
  const input = { ...item, sourceDiaryId: result.diaryId, sourceCorrectionId: item.id, learningLanguage: result.learningLanguage, explanationLanguage: result.explanationLanguage };
  delete input.id;
  await repo.save(input); await repo.save({ ...input, sourceCorrectionId: 'recorrected-id', expression: ' GO  FOR A WALK ' });
  const restored = await createLearningRepository(device).load(); assert.equal(restored.length, 1);
  assert.equal(restored[0].originalSentence, item.originalSentence); assert.equal(restored[0].correctedExample, item.correctedExample);
});
