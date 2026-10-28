import type { CorrectionService } from './correction-service';
import { MAX_CORRECTION_CHARACTERS, MAX_RESPONSE_CHARACTERS, validateForRequest } from './correction-validation';

export type ServerCorrectionConfig = {
  enabled: boolean; endpoint?: string; publishableKey?: string;
  getAccessToken?: () => Promise<string | null>; timeoutMs?: number;
  expectMock?: boolean;
  expectedGenerationMode?: 'mock' | 'model';
};
// No model secret belongs here. The token is a Supabase user session, supplied later by authentication.
export function createServerCorrectionService(config: ServerCorrectionConfig, transport: typeof fetch = fetch): CorrectionService {
  return { async correct(entry, explanationLanguage = 'ko') {
    if (!config.endpoint?.trim()) throw new Error('교정 서버가 설정되지 않았어요. 현재는 샘플 모드만 이용할 수 있어요.');
    if (!config.enabled) throw new Error('실제 서버 교정 요청은 아직 비활성 상태예요.');
    if (!/^https:\/\//i.test(config.endpoint)) throw new Error('교정 서버에는 HTTPS 주소가 필요해요.');
    if (!entry.content.trim() || [...entry.content].length > MAX_CORRECTION_CHARACTERS) throw new Error(`교정은 비어 있지 않은 ${MAX_CORRECTION_CHARACTERS}자 이하의 글을 지원해요. 일기는 유지됩니다.`);
    const timeoutMs = config.timeoutMs ?? 30000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('교정 요청 제한 시간이 올바르지 않아요.');
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The race also handles a transport that fails to honor AbortSignal, including token acquisition/body read.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error('교정 요청 시간이 초과됐어요. 다시 시도해 주세요.')); abort.abort(); }, timeoutMs);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const token = await config.getAccessToken?.();
        if (abort.signal.aborted) throw new Error('교정 요청 시간이 초과됐어요.');
        if (!token) throw new Error('서버 교정에는 사용자 인증 연결이 필요해요. 현재 단계에서는 요청하지 않습니다.');
        const response = await transport(config.endpoint!, { method: 'POST', signal: abort.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(config.publishableKey ? { apikey: config.publishableKey } : {}),
            ...((config.expectedGenerationMode || config.expectMock) ? { 'X-Lingolog-Correction-Mode': config.expectedGenerationMode ?? 'mock' } : {}) },
          body: JSON.stringify({ schemaVersion: 1, diaryId: entry.id, originalVersion: entry.revision ?? 0, originalUpdatedAt: entry.updatedAt,
            learningLanguage: entry.learningLanguage, explanationLanguage, original: entry.content }),
        }).catch(() => { throw new Error('교정 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'); });
        if (!response.ok) {
          let errorCode: unknown;
          try { const body = await response.text(); if (body.length < 10000) errorCode = JSON.parse(body)?.error?.code; } catch { /* Only local, allowlisted messages are shown. */ }
          if (errorCode === 'MODEL_USAGE_UNKNOWN') throw new Error('이전 모델 요청의 처리 여부가 불확실해요. 관리자에게 사용 기록을 확인한 뒤 재시도해 주세요. 원문과 기존 결과는 유지됩니다.');
          if (errorCode === 'MODEL_INCOMPLETE') throw new Error('교정 응답이 출력 한도에 도달했어요. 글을 줄이거나 서버 출력 한도를 확인해 주세요. 원문과 기존 결과는 유지됩니다.');
          if (errorCode === 'MODE_MISMATCH') throw new Error('앱과 서버의 교정 모드가 달라요. 설정을 확인해 주세요.');
          if (response.status === 429) throw new Error('교정 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
          if (response.status === 401 || response.status === 403) throw new Error('교정 서버의 인증과 실제 교정 허용 사용자 ID를 확인해 주세요.');
          if (response.status === 409) throw new Error('같은 교정 요청을 처리 중이에요. 잠시 후 다시 시도해 주세요.');
          if (response.status === 422) throw new Error(config.expectedGenerationMode === 'model' ? '모델이 이 글의 교정을 제공하지 못했어요. 원문과 기존 결과는 유지됩니다.' : '서버 모의 교정은 정해진 테스트 문장만 지원해요. 일반 일기 교정과 실제 AI는 아직 비활성 상태예요.');
          if (response.status === 503) throw new Error('서버 교정이 비활성 상태이거나 준비되지 않았어요. 기존 결과는 유지됩니다.');
          throw new Error('교정 서버 요청에 실패했어요. 기존 일기와 결과는 유지됩니다.');
        }
        const raw = await response.text();
        if (raw.length > MAX_RESPONSE_CHARACTERS) throw new Error('교정 서버 응답이 너무 커요.');
        let payload;
        try { payload = JSON.parse(raw); } catch { throw new Error('교정 서버 응답이 올바른 JSON이 아니에요.'); }
        if (payload?.schemaVersion !== 1) throw new Error('지원하지 않는 교정 서버 응답 버전이에요.');
        const result = validateForRequest(payload.result, entry, 'server');
        if (config.expectMock && result.generationMode !== 'mock') throw new Error('서버 연결 테스트에는 명확히 표시된 모의 교정 응답이 필요해요.');
        if (config.expectedGenerationMode && result.generationMode !== config.expectedGenerationMode) throw new Error('앱과 서버의 교정 모드가 달라요. 설정을 확인해 주세요. 기존 결과는 유지됩니다.');
        return { status: 'available' as const, result };
      })()]);
    } finally { if (timer) clearTimeout(timer); }
  } };
}
