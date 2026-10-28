export type CorrectionRequest = {
  schemaVersion: 1; diaryId: string; originalVersion: number; originalUpdatedAt: string;
  learningLanguage: 'en' | 'ja'; explanationLanguage: 'ko'; original: string;
};
export const MAX_REQUEST_BYTES = 16000;
export class RequestError extends Error {
  constructor(public code: string, public httpStatus: number) { super(code); }
}
export function parseCorrectionRequest(value: unknown): CorrectionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('INVALID_REQUEST', 400);
  const data = value as Record<string, unknown>;
  const allowed = ['schemaVersion', 'diaryId', 'originalVersion', 'originalUpdatedAt', 'learningLanguage', 'explanationLanguage', 'original'];
  if (Object.keys(data).some((key) => !allowed.includes(key)) || data.schemaVersion !== 1 ||
    typeof data.diaryId !== 'string' || !data.diaryId.trim() || data.diaryId.length > 200 ||
    typeof data.originalVersion !== 'number' || !Number.isSafeInteger(data.originalVersion) || data.originalVersion < 0 ||
    typeof data.originalUpdatedAt !== 'string' || data.originalUpdatedAt.length > 64 || !Number.isFinite(Date.parse(data.originalUpdatedAt)) ||
    (data.learningLanguage !== 'en' && data.learningLanguage !== 'ja') || data.explanationLanguage !== 'ko' ||
    typeof data.original !== 'string' || !data.original.trim()) throw new RequestError('INVALID_REQUEST', 400);
  if ([...data.original].length > 2000) throw new RequestError('TEXT_TOO_LONG', 413);
  // Explicit construction excludes any caller-controlled user identity.
  return { schemaVersion: 1, diaryId: data.diaryId, originalVersion: data.originalVersion, originalUpdatedAt: data.originalUpdatedAt,
    learningLanguage: data.learningLanguage, explanationLanguage: 'ko', original: data.original };
}
export async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new RequestError('INVALID_CONTENT_TYPE', 415);
  const announced = request.headers.get('content-length');
  if (announced !== null && (!/^\d+$/.test(announced) || Number(announced) > MAX_REQUEST_BYTES)) throw new RequestError('REQUEST_TOO_LARGE', 413);
  if (!request.body) throw new RequestError('INVALID_REQUEST', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 10000);
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new RequestError('REQUEST_TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  if (timedOut) throw new RequestError('REQUEST_TIMEOUT', 408);
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new RequestError('INVALID_JSON', 400); }
}
export async function requestHash(request: CorrectionRequest, namespace = 'mock-v1') {
  const bytes = new TextEncoder().encode(JSON.stringify({ mode: namespace, ...request }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
