// Opt-in hosted development smoke check. Never called by local unit tests.
// Only fixed test sentences are sent; tokens are stored under ignored .expo, never printed.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { loadModule } = require('./test-support/load-typescript.cjs');
const { createAnonymousSessionManager } = loadModule(path.resolve(__dirname, '../src/auth/anonymous-session.ts'));
const { validateForRequest } = loadModule(path.resolve(__dirname, '../src/correction/correction-validation.ts'));
async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url ?? '') || !key?.startsWith('sb_publishable_')) throw Error('PUBLIC_CONFIG');
  const project = new URL(url).hostname.split('.')[0];
  const folder = path.resolve(__dirname, '../.expo/supabase-check', project);
  await fs.mkdir(folder, { recursive: true });
  const storage = {
    async getItem(name) { try { return await fs.readFile(path.join(folder, encodeURIComponent(name)), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
    async setItem(name, value) { const target = path.join(folder, encodeURIComponent(name)); await fs.writeFile(`${target}.tmp`, value, { mode: 0o600 }); await fs.rename(`${target}.tmp`, target); },
    async removeItem(name) { await fs.rm(path.join(folder, encodeURIComponent(name)), { force: true }); },
  };
  const client = createClient(url, key, { auth: { storage, storageKey: 'session', autoRefreshToken: false, persistSession: true, detectSessionInUrl: false } });
  const manager = createAnonymousSessionManager(client.auth, storage, 'identity');
  const token = await manager.ensure();
  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/correct-diary`;
  const day = new Date().toISOString().slice(0, 10); // Same UTC boundary as the server quota.
  const invoke = (body, authorization) => fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', apikey: key, 'X-Lingolog-Correction-Mode': 'mock', ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) }, body: JSON.stringify(body) });
  const base = { schemaVersion: 1, diaryId: `server-check-en-${day}-v1`, originalVersion: 1, originalUpdatedAt: '2026-10-10T00:00:00.000Z', learningLanguage: 'en', explanationLanguage: 'ko', original: 'Yesterday I go to the park.' };
  assert.equal((await invoke(base)).status, 401); console.log('PASS: requests without a user JWT are rejected');
  assert.equal((await invoke({ ...base, userId: '00000000-0000-4000-8000-000000000000' }, token)).status, 400);
  assert.equal((await invoke({ ...base, original: 'My ordinary diary.' }, token)).status, 422);
  assert.equal((await invoke({ ...base, original: '😀'.repeat(2001) }, token)).status, 413);
  console.log('PASS: caller identity, ordinary diaries and oversized text are rejected');
  for (const learningLanguage of ['en', 'ja']) {
    const body = { ...base, learningLanguage, diaryId: `server-check-${learningLanguage}-${day}-v1`, original: learningLanguage === 'en' ? base.original : '昨日、公園に行きます。' };
    const reply = await invoke(body, token); assert.equal(reply.status, 200);
    const payload = await reply.json(); assert.equal(payload.result.generationMode, 'mock');
    const diary = { id: body.diaryId, content: body.original, learningLanguage, revision: 1, updatedAt: body.originalUpdatedAt };
    validateForRequest(payload.result, diary, 'server');
    const cached = await invoke(body, token); assert.equal(cached.status, 200); assert.deepEqual(await cached.json(), payload);
    console.log(`PASS: ${learningLanguage} mock contract and idempotent retry`);
  }
  if (process.argv.includes('--quota')) {
    // Together with the 2 requests above: total 5 unique requests. Same IDs are reused on reruns.
    for (let index = 3; index <= 5; index++) assert.equal((await invoke({ ...base, diaryId: `server-check-extra-${index}-${day}-v1` }, token)).status, 200);
    assert.equal((await invoke({ ...base, diaryId: `server-check-limit-sixth-${day}-v1` }, token)).status, 429);
    console.log('PASS: sixth unique daily request is denied');
  }
  client.auth.stopAutoRefresh();
  console.log('Development smoke check completed. No diary data or model request was sent.');
}
main().catch(() => { console.error('Server check failed. Check anonymous Auth, migration, CORRECTION_MODE=mock, deployment and the daily limit. No credentials or response bodies are printed.'); process.exitCode = 1; });
