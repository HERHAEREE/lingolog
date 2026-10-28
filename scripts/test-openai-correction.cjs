// All model traffic is injected. These tests never make paid/network requests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { loadModule } = require('./test-support/load-typescript.cjs');
const load = (name) => loadModule(path.resolve(__dirname, '..', name));
const { callOpenAI, modelCorrection, validModelConfig } = load('supabase/functions/_shared/openai-correction.ts');
const { createCorrectionHandler } = load('supabase/functions/_shared/correction-handler.ts');
const { requestHash } = load('supabase/functions/_shared/correction-contract.ts');
const { validateForRequest } = load('src/correction/correction-validation.ts');
const { createServerCorrectionService } = load('src/correction/server-correction-service.ts');
const user = '00000000-0000-4000-8000-000000000001';
const config = { apiKey: 'test-only-not-a-real-key', model: 'gpt-4.1-mini', maxOutputTokens: 3000 };
const input = (language = 'en') => ({ schemaVersion: 1, diaryId: `diary-${language}`, originalVersion: 2,
  originalUpdatedAt: '2026-10-10T00:00:00.000Z', learningLanguage: language, explanationLanguage: 'ko',
  original: language === 'en' ? 'Yesterday I go to the park.' : '昨日、公園に行きます。' });
const output = (language = 'en') => {
  const original = input(language).original, corrected = language === 'en' ? 'Yesterday I went to the park.' : '昨日、公園に行きました。';
  return { corrected, changes: [{ id: 'past', kind: 'grammar', learningType: 'grammar', expression: language === 'en' ? 'went' : '行きました',
    meaning: '과거의 행동', originalSentence: original, correctedSentence: corrected, explanation: '어제의 일을 과거형으로 표현해요.' }],
    learningItems: [{ id: 'past', type: 'grammar', expression: language === 'en' ? 'went' : '行きました', meaning: '과거의 행동', originalSentence: original, correctedExample: corrected }] };
};
const envelope = (data = output(), patch = {}) => ({ id: 'resp_test', status: 'completed', usage: { input_tokens: 221, output_tokens: 99, total_tokens: 320 },
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }], ...patch });
const transport = (body) => async () => new Response(JSON.stringify(body));
const request = (data = input(), mode = 'model') => new Request('https://test.local', { method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer test.user.jwt', 'X-Lingolog-Correction-Mode': mode }, body: JSON.stringify(data) });
const diary = (data) => ({ id: data.diaryId, content: data.original, learningLanguage: data.learningLanguage, revision: data.originalVersion, updatedAt: data.originalUpdatedAt });

test('Responses API uses strict schema, developer policy, token ceiling and store:false; metadata never comes from model', async () => {
  for (const language of ['en', 'ja']) {
    let usage;
    const result = await callOpenAI(input(language), config, async (value) => { usage = value; }, async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false); assert.equal(body.max_output_tokens, 3000); assert.equal(body.model, config.model);
      assert.equal(body.text.format.strict, true); assert.equal(body.text.format.schema.additionalProperties, false);
      assert.equal(body.input[0].role, 'developer'); assert.match(body.input[0].content, /Korean/);
      assert.deepEqual(JSON.parse(body.input[1].content), { learningLanguage: language, explanationLanguage: 'ko', original: input(language).original });
      return new Response(JSON.stringify(envelope(output(language))));
    });
    assert.deepEqual(usage, { inputTokens: 221, outputTokens: 99, totalTokens: 320 });
    const response = modelCorrection(input(language), result, '2026-10-10T00:01:00Z');
    assert.equal(response.result.generationMode, 'model');
    assert.deepEqual(validateForRequest(response.result, diary(input(language)), 'server'), response.result);
  }
  assert.equal(validModelConfig({ ...config, maxOutputTokens: 4097 }), false);
  assert.equal(validModelConfig({ ...config, apiKey: '' }), false);
});

test('incomplete/refused/invalid responses preserve reported usage; transport failures record unknown, never estimates', async () => {
  for (const body of [envelope(output(), { status: 'incomplete' }), envelope(output(), { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }),
    envelope(output(), { output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] })]) {
    const reports = []; await assert.rejects(callOpenAI(input(), config, async (usage) => reports.push(usage), transport(body)));
    assert.deepEqual(reports, [{ inputTokens: 221, outputTokens: 99, totalTokens: 320 }]);
  }
  for (const fetcher of [async () => { throw Error('private diary/secret'); }, async () => new Response('provider secret', { status: 429 }), transport(envelope(output(), { usage: null }))]) {
    const reports = []; await assert.rejects(callOpenAI(input(), config, async (usage) => reports.push(usage), fetcher), /MODEL_/);
    assert.deepEqual(reports, [null]);
  }
  assert.throws(() => modelCorrection(input(), { ...output(), changes: [{ ...output().changes[0], originalSentence: 'unrelated' }] }, '2026-10-10T00:00:00Z'));
  assert.throws(() => modelCorrection(input(), { ...output(), learningItems: [{ ...output().learningItems[0], expression: 'mismatch' }] }, '2026-10-10T00:00:00Z'));
  assert.deepEqual(modelCorrection(input(), { corrected: input().original, changes: [], learningItems: [] }, '2026-10-10T00:00:00Z').result.changes, []);
});

async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
  await db.query('insert into auth.users values ($1)', [user]);
  for (const file of fs.readdirSync(path.resolve(__dirname, '../supabase/migrations')).filter((file) => file.endsWith('.sql')).sort())
    await db.exec(fs.readFileSync(path.resolve(__dirname, '../supabase/migrations', file), 'utf8'));
  return db;
}
const rpc = async (db, sql, values) => (await db.query(`select ${sql} as value`, values)).rows[0].value;
function dependencies(db, fetcher, patch = {}) {
  return { mode: 'model', model: { ...config, allowedUserIds: [user] }, authenticate: async () => user, modelTransport: fetcher,
    claim: (id, hash) => rpc(db, 'public.claim_diary_correction($1,$2)', [id, hash]),
    finish: (id, hash, lease, response) => rpc(db, 'public.finish_diary_correction($1,$2,$3,$4)', [id, hash, lease, response]),
    startModelAttempt: (id, hash, lease, model) => rpc(db, 'public.start_diary_model_attempt($1,$2,$3,$4)', [id, hash, lease, model]),
    recordModelUsage: async (id, lease, usage, responseId) => {
      assert.equal(await rpc(db, 'public.record_diary_model_usage($1,$2,$3,$4)', [id, lease, usage, responseId]), true);
    }, ...patch };
}
test('allowlist and mode mismatch block before quota/model; successful retries cache, mock/model hashes differ', async () => {
  const db = await database(); let calls = 0;
  try {
    const fetcher = async () => { calls++; return new Response(JSON.stringify(envelope())); };
    const denied = createCorrectionHandler(dependencies(db, fetcher, { model: { ...config, allowedUserIds: [] } }));
    assert.equal((await denied(request())).status, 403);
    const handler = createCorrectionHandler(dependencies(db, fetcher));
    assert.equal((await handler(request(input(), 'mock'))).status, 503); assert.equal(calls, 0);
    assert.equal((await db.query('select * from lingolog_private.correction_requests')).rows.length, 0);
    const response = await handler(request()); assert.equal(response.status, 200); const body = await response.json();
    assert.equal((await handler(request())).status, 200); assert.equal(calls, 1);
    const adapter = createServerCorrectionService({ enabled: true, expectedGenerationMode: 'model', endpoint: 'https://test.local', getAccessToken: async () => 'test.user.jwt' },
      async (_, options) => handler(new Request('https://test.local', options)));
    assert.equal((await adapter.correct(diary(input()))).result.generationMode, 'model'); assert.equal(calls, 1);
    assert.equal(body.result.original, input().original);
    const row = (await db.query('select * from lingolog_private.correction_model_attempts')).rows[0];
    assert.equal(row.input_tokens, 221); assert.equal(row.output_tokens, 99); assert.equal(row.status, 'reported');
    assert.notEqual(await requestHash(input()), await requestHash(input(), `model-v1:${config.model}:3000`));
  } finally { await db.close(); }
});

test('paid attempts including explicit failed retries are capped at 5; usage survives invalid results and clients cannot access it', async () => {
  const db = await database(); let calls = 0;
  try {
    const handler = createCorrectionHandler(dependencies(db, async () => { calls++; return new Response(JSON.stringify(envelope(output(), { status: 'incomplete' }))); }));
    for (let index = 0; index < 5; index++) assert.equal((await handler(request())).status, 502);
    assert.equal((await handler(request())).status, 429); assert.equal(calls, 5);
    assert.equal(Number((await db.query('select sum(input_tokens) as total from lingolog_private.correction_model_attempts')).rows[0].total), 1105);
    assert.equal((await db.query('select request_count from lingolog_private.correction_daily_usage')).rows[0].request_count, 1);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from lingolog_private.correction_model_attempts'), /permission denied/);
      await assert.rejects(rpc(db, 'public.start_diary_model_attempt($1,$2,$3,$4)', [user, 'a'.repeat(64), user, config.model]), /permission denied/);
      await assert.rejects(rpc(db, 'public.record_diary_model_usage($1,$2,$3,$4)', [user, user, null, null]), /permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
test('uncertain call is fenced on retry; late usage can be recorded and cannot be overwritten', async () => {
  const db = await database(); let calls = 0;
  try {
    const handler = createCorrectionHandler(dependencies(db, async () => { calls++; throw Error('secret'); }));
    const failed = await handler(request()); assert.equal(failed.status, 502); assert.ok(!(await failed.text()).includes('secret'));
    assert.equal((await handler(request())).status, 503); assert.equal(calls, 1);
    const attempt = (await db.query('select * from lingolog_private.correction_model_attempts')).rows[0];
    assert.equal(attempt.input_tokens, null); assert.equal(attempt.status, 'unknown');
    assert.equal(await rpc(db, 'public.record_diary_model_usage($1,$2,$3,$4)', [user, attempt.lease_id, null, null]), true);
    assert.equal(await rpc(db, 'public.record_diary_model_usage($1,$2,$3,$4)', [user, attempt.lease_id, { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, 'resp_different']), false);
  } finally { await db.close(); }
});

test('same lease starts once; expired workers can report usage without replacing the newer correction', async () => {
  const db = await database();
  try {
    const hash = 'a'.repeat(64), deps = dependencies(db, transport(envelope()));
    const first = await deps.claim(user, hash);
    assert.equal(await deps.startModelAttempt(user, hash, first.leaseId, config.model), 'started');
    assert.equal(await deps.startModelAttempt(user, hash, first.leaseId, config.model), 'invalid');
    await db.query("update lingolog_private.correction_requests set lease_until = clock_timestamp() - interval '1 second'");
    const next = await deps.claim(user, hash);
    assert.equal(await deps.startModelAttempt(user, hash, next.leaseId, config.model), 'uncertain');
    await deps.recordModelUsage(user, first.leaseId, { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, 'resp_late');
    assert.equal(await deps.finish(user, hash, first.leaseId, { old: true }), false);
    const row = (await db.query('select * from lingolog_private.correction_model_attempts')).rows[0];
    assert.equal(row.total_tokens, 15); assert.equal(row.status, 'reported');
  } finally { await db.close(); }
});

test('usage write failure retries only the same report and cannot turn into a successful correction', async () => {
  let calls = 0; const reports = [];
  await assert.rejects(callOpenAI(input(), config, async (usage) => { reports.push(usage); throw Error('DB write failed'); }, async () => {
    calls++; return new Response(JSON.stringify(envelope()));
  }));
  assert.equal(calls, 1);
  assert.deepEqual(reports, [{ inputTokens: 221, outputTokens: 99, totalTokens: 320 }, { inputTokens: 221, outputTokens: 99, totalTokens: 320 }]);
});
