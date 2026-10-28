const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { loadModule } = require('./test-support/load-typescript.cjs');
const load = (file) => loadModule(path.resolve(__dirname, '..', file));
const { createAnonymousSessionManager } = load('src/auth/anonymous-session.ts');
const { createCorrectionHandler } = load('supabase/functions/_shared/correction-handler.ts');
const { parseCorrectionRequest, requestHash } = load('supabase/functions/_shared/correction-contract.ts');
const { MOCK_ENGLISH_ORIGINAL, MOCK_JAPANESE_ORIGINAL } = load('supabase/functions/_shared/mock-correction.ts');
const { validateForRequest } = load('src/correction/correction-validation.ts');
const { createServerCorrectionService } = load('src/correction/server-correction-service.ts');
const userA = '00000000-0000-4000-8000-000000000001', userB = '00000000-0000-4000-8000-000000000002';
const input = (patch = {}) => ({ schemaVersion: 1, diaryId: 'test-diary', originalVersion: 1, originalUpdatedAt: '2026-10-10T00:00:00.000Z',
  learningLanguage: 'en', explanationLanguage: 'ko', original: MOCK_ENGLISH_ORIGINAL, ...patch });
const request = (body, token = 'valid.user.jwt', headers = {}) => new Request('https://example.test/correct-diary', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body),
});
const session = (token = 'session-token', expires_at = 9999999999) => ({ access_token: token, expires_at, user: { id: userA } });
function storage() { return { values: new Map(), async getItem(key) { return this.values.get(key) ?? null; }, async setItem(key, value) { this.values.set(key, value); }, async removeItem(key) { this.values.delete(key); } }; }

test('anonymous session is reused across launches; simultaneous initialization signs up only once', async () => {
  const device = storage(); let stored = null, signups = 0;
  const auth = { async getSession() { return { data: { session: stored }, error: null }; }, async refreshSession() { throw Error('not needed'); },
    async signInAnonymously() { signups++; stored = session(); return { data: { session: stored }, error: null }; } };
  const manager = createAnonymousSessionManager(auth, device, 'identity');
  assert.deepEqual(await Promise.all([manager.ensure(), manager.ensure(), manager.ensure()]), ['session-token', 'session-token', 'session-token']);
  assert.equal(signups, 1); await createAnonymousSessionManager(auth, device, 'identity').ensure(); assert.equal(signups, 1);
});
test('expired sessions refresh instead of creating new users, preserving identity on refresh failure', async () => {
  const device = storage(); let signups = 0, refreshed = 0;
  const auth = { async getSession() { return { data: { session: session('old', 1) }, error: null }; },
    async refreshSession() { refreshed++; return { data: { session: session('new') }, error: null }; }, async signInAnonymously() { signups++; } };
  const manager = createAnonymousSessionManager(auth, device, 'identity'); assert.equal(await manager.ensure(), 'new'); assert.equal(refreshed, 1); assert.equal(signups, 0);
  auth.refreshSession = async () => ({ data: { session: null }, error: { status: 500 } });
  await assert.rejects(manager.ensure(), /갱신/); assert.equal(signups, 0); assert.equal(JSON.parse(device.values.get('identity')).userId, userA);
});
test('read failures, missing previous session and ambiguous sign-up failures never create accounts repeatedly', async () => {
  const device = storage(); let signups = 0;
  const auth = { async getSession() { return { data: { session: null }, error: null }; }, async refreshSession() {},
    async signInAnonymously() { signups++; return { data: { session: null }, error: { status: 500 } }; } };
  const manager = createAnonymousSessionManager(auth, device, 'identity');
  await assert.rejects(manager.ensure()); await assert.rejects(manager.ensure(), /새 계정을 자동/); assert.equal(signups, 1);
  device.values.set('identity', JSON.stringify({ state: 'ready', userId: userA })); await assert.rejects(manager.ensure()); assert.equal(signups, 1);
  device.getItem = async () => { throw Error('storage failed'); }; await assert.rejects(manager.ensure()); assert.equal(signups, 1);
});
test('definitive anonymous-auth rejection allows explicit retry after settings change without touching local records', async () => {
  const device = storage(); device.values.set('diary', 'keep'); let allowed = false;
  const auth = { async getSession() { return { data: { session: null }, error: null }; }, async refreshSession() {},
    async signInAnonymously() { return allowed ? { data: { session: session() }, error: null } : { data: { session: null }, error: { status: 422 } }; } };
  const manager = createAnonymousSessionManager(auth, device, 'identity'); await assert.rejects(manager.ensure());
  allowed = true; assert.equal(await manager.ensure(), 'session-token'); assert.equal(device.values.get('diary'), 'keep');
});
test('contract restricts languages, unknown user IDs, blank text and 2,000 Unicode codepoints', async () => {
  assert.equal([...parseCorrectionRequest(input({ original: '😀'.repeat(2000) })).original].length, 2000);
  for (const patch of [{ original: '😀'.repeat(2001) }, { original: ' \n ' }, { learningLanguage: 'fr' }, { explanationLanguage: 'en' }, { userId: userB },
    { originalVersion: -1 }, { originalVersion: 0.5 }, { schemaVersion: 2 }, { originalUpdatedAt: 'bad' }]) assert.throws(() => parseCorrectionRequest(input(patch)));
  assert.equal(await requestHash(parseCorrectionRequest(input())), await requestHash(parseCorrectionRequest(input())));
  assert.notEqual(await requestHash(parseCorrectionRequest(input())), await requestHash(parseCorrectionRequest(input({ diaryId: 'another' }))));
});

async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key);');
  await db.query('insert into auth.users values ($1), ($2)', [userA, userB]);
  await db.exec(fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261010000100_correction_limits.sql'), 'utf8'));
  return db;
}
const claim = async (db, user, hash) => (await db.query('select public.claim_diary_correction($1, $2) as result', [user, hash])).rows[0].result;
const finish = async (db, user, hash, lease, response) => (await db.query('select public.finish_diary_correction($1, $2, $3, $4) as result', [user, hash, lease, response])).rows[0].result;
test('real migration atomically caps 5 unique requests, fences concurrent work and caches retry responses', async () => {
  const db = await database();
  try {
    const hash = 'a'.repeat(64), first = await claim(db, userA, hash);
    assert.equal(first.status, 'claimed');
    assert.equal((await claim(db, userA, hash)).status, 'in_progress');
    assert.equal((await claim(db, userA, 'b'.repeat(64))).status, 'busy');
    assert.equal(await finish(db, userA, hash, first.leaseId, { schemaVersion: 1, result: 'mock' }), true);
    assert.deepEqual(await claim(db, userA, hash), { status: 'cached', response: { schemaVersion: 1, result: 'mock' } });
    for (const char of ['b', 'c', 'd', 'e']) {
      const next = await claim(db, userA, char.repeat(64)); assert.equal(next.status, 'claimed');
      await finish(db, userA, char.repeat(64), next.leaseId, { result: char });
    }
    assert.equal((await claim(db, userA, 'f'.repeat(64))).status, 'daily_limit');
    assert.equal((await claim(db, userB, 'f'.repeat(64))).status, 'claimed');
    assert.equal((await db.query('select request_count from lingolog_private.correction_daily_usage where user_id = $1', [userA])).rows[0].request_count, 5);
  } finally { await db.close(); }
});
test('concurrent reservations admit one worker and failed/expired retries cannot add quota or overwrite current lease', async () => {
  const db = await database();
  try {
    const hashes = ['a', 'b', 'c'].map((char) => char.repeat(64));
    const attempts = await Promise.all(hashes.map((hash) => claim(db, userA, hash)));
    assert.equal(attempts.filter((row) => row.status === 'claimed').length, 1);
    assert.equal(attempts.filter((row) => row.status === 'busy').length, 2);
    const first = attempts[0]; await finish(db, userA, hashes[0], first.leaseId, null);
    const retry = await claim(db, userA, hashes[0]); assert.equal(retry.status, 'claimed');
    assert.equal(await finish(db, userA, hashes[0], first.leaseId, { old: true }), false);
    await db.query("update lingolog_private.correction_requests set lease_until = clock_timestamp() - interval '1 second' where user_id = $1", [userA]);
    const recovered = await claim(db, userA, hashes[0]); assert.equal(recovered.status, 'claimed');
    assert.equal(await finish(db, userA, hashes[0], retry.leaseId, { old: true }), false);
    assert.equal(await finish(db, userA, hashes[0], recovered.leaseId, { recovered: true }), true);
    assert.equal((await db.query('select request_count from lingolog_private.correction_daily_usage where user_id = $1', [userA])).rows[0].request_count, 1);
  } finally { await db.close(); }
});
test('anon and authenticated clients cannot access private tables or call admin RPCs', async () => {
  const db = await database();
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from lingolog_private.correction_requests'), /permission denied/);
      await assert.rejects(db.query('insert into lingolog_private.correction_daily_usage values ($1, current_date, 0)', [userA]), /permission denied/);
      await assert.rejects(claim(db, userA, 'a'.repeat(64)), /permission denied/);
      await assert.rejects(finish(db, userA, 'a'.repeat(64), userB, null), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role'); assert.equal((await claim(db, userA, 'a'.repeat(64))).status, 'claimed');
    await db.exec('reset role');
  } finally { await db.close(); }
});
test('handler with real SQL authenticates, labels English/Japanese mocks and returns idempotent results matching app schema', async () => {
  const db = await database();
  try {
    const handler = createCorrectionHandler({ mode: 'mock', authenticate: async (token) => token === 'valid.user.jwt' ? userA : null,
      claim: (user, hash) => claim(db, user, hash), finish: (user, hash, lease, response) => finish(db, user, hash, lease, response) });
    for (const language of ['en', 'ja']) {
      const data = input({ diaryId: `test-${language}`, learningLanguage: language, original: language === 'en' ? MOCK_ENGLISH_ORIGINAL : MOCK_JAPANESE_ORIGINAL });
      const reply = await handler(request(data)); assert.equal(reply.status, 200);
      const body = await reply.json(); assert.equal(body.result.generationMode, 'mock'); assert.equal(body.result.source, 'server');
      const diary = { id: data.diaryId, content: data.original, learningLanguage: language, updatedAt: data.originalUpdatedAt, revision: 1 };
      assert.deepEqual(validateForRequest(body.result, diary, 'server'), body.result);
      const cached = await handler(request(data)); assert.deepEqual(await cached.json(), body);
      const adapter = createServerCorrectionService({ enabled: true, expectMock: true, endpoint: 'https://example.test/correct-diary', getAccessToken: async () => 'valid.user.jwt' },
        async (_url, options) => handler(new Request('https://example.test/correct-diary', options)));
      assert.equal((await adapter.correct(diary)).result.generationMode, 'mock');
    }
    assert.equal((await db.query('select request_count from lingolog_private.correction_daily_usage where user_id = $1', [userA])).rows[0].request_count, 2);
  } finally { await db.close(); }
});
test('handler rejects missing/fake/public-key credentials, unsupported ordinary diaries and unsafe bodies before claiming quota', async () => {
  let reservations = 0, authentications = 0;
  const handler = createCorrectionHandler({ mode: 'mock', authenticate: async (token) => { authentications++; return token === 'valid.user.jwt' ? userA : null; },
    claim: async () => { reservations++; throw Error('must not reach'); }, finish: async () => true });
  assert.equal((await handler(request(input(), 'sb_publishable_public'))).status, 401); assert.equal(authentications, 0);
  assert.equal((await handler(request(input(), 'fake.user.jwt'))).status, 401);
  assert.equal((await handler(request(input({ userId: userB })))).status, 400);
  assert.equal((await handler(request(input({ original: 'My ordinary diary.' })))).status, 422);
  assert.equal((await handler(request(input({ original: '😀'.repeat(2001) })))).status, 413);
  assert.equal((await handler(request(input(), undefined, { 'content-length': '16001' }))).status, 413);
  assert.equal((await handler(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer valid.user.jwt', 'content-type': 'application/json' }, body: 'x'.repeat(16001) }))).status, 413);
  assert.equal((await handler(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer valid.user.jwt', 'content-type': 'application/json' }, body: '{broken' }))).status, 400);
  assert.equal(reservations, 0);
});
test('disabled and unconfigured model modes never call a model; safe failures expose no tokens or original', async () => {
  for (const mode of ['disabled', 'model']) {
    const handler = createCorrectionHandler({ mode, authenticate: async () => userA, claim: async () => { throw Error('not reached'); }, finish: async () => true });
    assert.equal((await handler(request(input()))).status, 503);
  }
  const handler = createCorrectionHandler({ mode: 'mock', authenticate: async () => { throw Error('secret valid.user.jwt Yesterday I go to the park.'); }, claim: async () => {}, finish: async () => true });
  const reply = await handler(request(input())); assert.equal(reply.status, 500);
  const body = await reply.text(); assert.ok(!body.includes('valid.user.jwt')); assert.ok(!body.includes(MOCK_ENGLISH_ORIGINAL)); assert.ok(!body.includes('secret'));
});
test('app mock adapter refuses unlabelled/model results and turns ordinary diary notice into actionable guidance', async () => {
  const config = { enabled: true, expectMock: true, endpoint: 'https://example.test', getAccessToken: async () => 'valid.user.jwt' };
  const diary = { id: 'test-diary', content: MOCK_ENGLISH_ORIGINAL, learningLanguage: 'en', revision: 1, updatedAt: input().originalUpdatedAt };
  const handler = createCorrectionHandler({ mode: 'mock', authenticate: async () => userA, claim: async () => ({ status: 'claimed', leaseId: userB }), finish: async () => true });
  const body = await (await handler(request(input()))).json();
  for (const generationMode of [undefined, 'model']) {
    const result = { ...body.result, generationMode };
    await assert.rejects(createServerCorrectionService(config, async () => new Response(JSON.stringify({ schemaVersion: 1, result }))).correct(diary), /모의 교정/);
  }
  await assert.rejects(createServerCorrectionService(config, async () => new Response('{}', { status: 422 })).correct(diary), /테스트 문장/);
});
