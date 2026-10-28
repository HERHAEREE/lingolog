import { parseCorrectionRequest, readLimitedJson, requestHash, RequestError } from './correction-contract.ts';
import { mockCorrection, supportsMock } from './mock-correction.ts';
import { callOpenAI, modelCorrection, validModelConfig, type ModelConfig, type TokenUsage } from './openai-correction.ts';
type Reservation = { status: 'cached'; response: unknown } | { status: 'claimed'; leaseId: string } | { status: 'in_progress' | 'busy' | 'daily_limit' };
export type HandlerDependencies = {
  mode: string;
  authenticate: (token: string) => Promise<string | null>;
  claim: (userId: string, hash: string) => Promise<Reservation>;
  finish: (userId: string, hash: string, leaseId: string, response: unknown | null) => Promise<boolean>;
  now?: () => Date;
  model?: ModelConfig & { allowedUserIds: string[] };
  startModelAttempt?: (userId: string, hash: string, leaseId: string, model: string) => Promise<'started' | 'daily_limit' | 'uncertain' | 'invalid'>;
  recordModelUsage?: (userId: string, leaseId: string, usage: TokenUsage | null, responseId: string | null) => Promise<void>;
  modelTransport?: typeof fetch;
};
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-lingolog-correction-mode',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const messages: Record<string, string> = {
  UNAUTHORIZED: '사용자 인증이 필요합니다.', INVALID_REQUEST: '요청 형식과 지원 언어를 확인해 주세요.', TEXT_TOO_LONG: '원문은 2,000자 이하만 지원합니다.',
  REQUEST_TOO_LARGE: '요청 크기가 제한을 초과했습니다.', INVALID_JSON: '올바른 JSON 요청이 필요합니다.', INVALID_CONTENT_TYPE: 'JSON 요청만 지원합니다.',
  REQUEST_TIMEOUT: '요청을 읽는 시간이 초과됐습니다.',
  CORRECTION_DISABLED: '서버 교정이 비활성 상태입니다. 실제 AI는 연결하지 않았습니다.', MOCK_UNSUPPORTED: '모의 교정은 정해진 테스트 문장만 지원합니다. 일반 일기 교정은 아직 비활성 상태입니다.',
  DAILY_LIMIT: '오늘의 교정 요청 5회를 사용했습니다.', REQUEST_IN_PROGRESS: '동일 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.', BUSY: '다른 교정 요청을 처리 중입니다.',
  SERVER_ERROR: '교정 서버에서 요청을 완료하지 못했습니다. 기존 일기와 결과는 유지됩니다.', METHOD_NOT_ALLOWED: 'POST 요청만 지원합니다.',
  MODEL_NOT_ALLOWED: '이 사용자는 실제 교정 테스트가 허용되지 않았습니다.',
  MODEL_USAGE_UNKNOWN: '이전 모델 요청의 처리 여부를 확인해야 합니다. 자동으로 다시 호출하지 않습니다.',
  MODEL_INCOMPLETE: '교정 응답이 출력 한도 안에서 완료되지 않았습니다. 기존 일기와 결과는 유지됩니다.',
  MODEL_REFUSED: '모델이 이 글의 교정을 제공하지 못했습니다. 원문은 유지됩니다.',
  MODEL_TIMEOUT: '모델 응답 시간이 초과됐습니다. 처리 여부를 확인한 뒤 다시 시도해 주세요.',
  MODEL_REQUEST_FAILED: '모델 요청을 완료하지 못했습니다. 기존 일기와 결과는 유지됩니다.',
  MODEL_INVALID_OUTPUT: '모델 응답 검증에 실패했습니다. 기존 일기와 결과는 유지됩니다.',
  MODE_MISMATCH: '앱과 서버의 교정 모드가 다릅니다. 실제 모델을 호출하지 않았습니다.',
};
export function createCorrectionHandler(deps: HandlerDependencies) {
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
  const error = (code: string, status: number) => json({ schemaVersion: 1, error: { code, message: messages[code] ?? messages.SERVER_ERROR } }, status);
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 405);
    let reservation: { userId: string; hash: string; leaseId: string } | null = null;
    try {
      const authorization = request.headers.get('authorization') ?? '';
      const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
      // A publishable key is not a user JWT. Never decode a caller-supplied user ID.
      if (!token || token.split('.').length !== 3) return error('UNAUTHORIZED', 401);
      const userId = await deps.authenticate(token);
      if (!userId || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(userId)) return error('UNAUTHORIZED', 401);
      if (deps.mode !== 'mock' && deps.mode !== 'model') return error('CORRECTION_DISABLED', 503);
      const expectedMode = request.headers.get('x-lingolog-correction-mode');
      if (expectedMode && expectedMode !== deps.mode) return error('MODE_MISMATCH', 503);
      if (deps.mode === 'model') {
        if (!deps.model || !validModelConfig(deps.model) || !deps.startModelAttempt || !deps.recordModelUsage) return error('CORRECTION_DISABLED', 503);
        if (!deps.model.allowedUserIds.some((id) => id.toLowerCase() === userId.toLowerCase())) return error('MODEL_NOT_ALLOWED', 403);
      }
      const input = parseCorrectionRequest(await readLimitedJson(request));
      if (deps.mode === 'mock' && !supportsMock(input)) return error('MOCK_UNSUPPORTED', 422);
      const hash = await requestHash(input, deps.mode === 'model' ? `model-v1:${deps.model!.model}:${deps.model!.maxOutputTokens}` : 'mock-v1');
      const claim = await deps.claim(userId, hash);
      if (claim.status === 'cached') return json(claim.response);
      if (claim.status === 'daily_limit') return error('DAILY_LIMIT', 429);
      if (claim.status === 'in_progress') return error('REQUEST_IN_PROGRESS', 409);
      if (claim.status === 'busy') return error('BUSY', 429);
      if (claim.status !== 'claimed') return error('SERVER_ERROR', 500);
      reservation = { userId, hash, leaseId: claim.leaseId };
      let response: unknown;
      if (deps.mode === 'model') {
        const started = await deps.startModelAttempt!(userId, hash, claim.leaseId, deps.model!.model);
        if (started !== 'started') throw new RequestError(started === 'daily_limit' ? 'DAILY_LIMIT' : started === 'uncertain' ? 'MODEL_USAGE_UNKNOWN' : 'SERVER_ERROR', started === 'daily_limit' ? 429 : 503);
        const output = await callOpenAI(input, deps.model!, (usage, responseId) => deps.recordModelUsage!(userId, claim.leaseId, usage, responseId), deps.modelTransport);
        response = modelCorrection(input, output, (deps.now?.() ?? new Date()).toISOString());
      } else response = mockCorrection(input, (deps.now?.() ?? new Date()).toISOString());
      if (!await deps.finish(userId, hash, claim.leaseId, response)) return error('REQUEST_IN_PROGRESS', 409);
      reservation = null;
      return json(response);
    } catch (caught) {
      if (reservation) { try { await deps.finish(reservation.userId, reservation.hash, reservation.leaseId, null); } catch { /* Lease expires safely; do not log secrets or payloads. */ } }
      return caught instanceof RequestError ? error(caught.code, caught.httpStatus) : error('SERVER_ERROR', 500);
    }
  };
}
