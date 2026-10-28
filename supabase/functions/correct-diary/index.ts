import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createCorrectionHandler, type HandlerDependencies } from '../_shared/correction-handler.ts';

function injectedKey(name: string, fallback: string) {
  const raw = Deno.env.get(name);
  return raw ? JSON.parse(raw).default as string : Deno.env.get(fallback);
}
// Only this server entrypoint can access administrator credentials. No payload/key logging.
const url = Deno.env.get('SUPABASE_URL');
const publishable = Deno.env.get('LINGOLOG_SUPABASE_PUBLISHABLE_KEY') ?? injectedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const adminKey = injectedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
if (!url || !publishable || !adminKey) throw new Error('Server configuration is incomplete.');
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
} };
const authClient = createClient(url, publishable, options);
const admin = createClient(url, adminKey, options);
const handler = createCorrectionHandler({
  mode: Deno.env.get('CORRECTION_MODE') ?? 'disabled',
  model: { apiKey: Deno.env.get('OPENAI_API_KEY') ?? '', model: Deno.env.get('OPENAI_MODEL') ?? '',
    maxOutputTokens: Number(Deno.env.get('OPENAI_MAX_OUTPUT_TOKENS') ?? '3000'),
    allowedUserIds: (Deno.env.get('OPENAI_ALLOWED_USER_IDS') ?? '').split(',').map((id) => id.trim()).filter((id) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) },
  async startModelAttempt(userId, hash, leaseId, model) {
    const { data, error } = await admin.rpc('start_diary_model_attempt', { p_user_id: userId, p_request_hash: hash, p_lease_id: leaseId, p_model: model });
    if (error || !['started', 'daily_limit', 'uncertain', 'invalid'].includes(data)) throw new Error('Model reservation failed.');
    return data as 'started' | 'daily_limit' | 'uncertain' | 'invalid';
  },
  async recordModelUsage(userId, leaseId, usage, responseId) {
    const { data, error } = await admin.rpc('record_diary_model_usage', { p_user_id: userId, p_lease_id: leaseId, p_usage: usage, p_response_id: responseId });
    if (error || data !== true) throw new Error('Usage persistence failed.');
  },
  async authenticate(token) {
    // Auth server verifies signature/issuer/expiry and resolves the actual user.
    const { data, error } = await authClient.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  async claim(userId, hash) {
    const { data, error } = await admin.rpc('claim_diary_correction', { p_user_id: userId, p_request_hash: hash });
    if (error || !data) throw new Error('Reservation failed.');
    return data as Awaited<ReturnType<HandlerDependencies['claim']>>;
  },
  async finish(userId, hash, leaseId, response) {
    const { data, error } = await admin.rpc('finish_diary_correction', { p_user_id: userId, p_request_hash: hash, p_lease_id: leaseId, p_response: response });
    if (error) throw new Error('Reservation completion failed.');
    return data === true;
  },
});
Deno.serve(handler);
