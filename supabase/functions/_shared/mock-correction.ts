import type { CorrectionRequest } from './correction-contract.ts';
export const MOCK_ENGLISH_ORIGINAL = 'Yesterday I go to the park.';
export const MOCK_JAPANESE_ORIGINAL = '昨日、公園に行きます。';
export function supportsMock(request: CorrectionRequest) {
  return request.original === (request.learningLanguage === 'en' ? MOCK_ENGLISH_ORIGINAL : MOCK_JAPANESE_ORIGINAL);
}
export function mockCorrection(request: CorrectionRequest, correctedAt: string) {
  if (!supportsMock(request)) throw new Error('unsupported mock');
  const english = request.learningLanguage === 'en';
  const corrected = english ? 'Yesterday I went to the park.' : '昨日、公園に行きました。';
  const id = english ? 'mock-en-past-go' : 'mock-ja-past-iku';
  const expression = english ? 'went' : '行きました';
  const meaning = english ? 'go의 과거형' : '갔습니다: 行きます의 과거형';
  const explanation = english ? '어제 있었던 일이므로 go의 과거형 went를 사용해요.' : '昨日는 어제라는 뜻이므로 行きます를 과거형 行きました로 바꿔요.';
  return { schemaVersion: 1, result: {
    source: 'server', generationMode: 'mock', diaryId: request.diaryId, originalVersion: request.originalVersion, originalUpdatedAt: request.originalUpdatedAt,
    learningLanguage: request.learningLanguage, explanationLanguage: 'ko', correctedAt, original: request.original, corrected,
    changes: [{ id, kind: 'grammar', learningType: 'grammar', expression, meaning, originalSentence: request.original, correctedSentence: corrected, explanation }],
    learningItems: [{ id, type: 'grammar', expression, meaning, originalSentence: request.original, correctedExample: corrected }],
  } };
}
