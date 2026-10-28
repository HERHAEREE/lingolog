import type { DiaryEntry } from '../data/diary-model';
import { isLearningLanguage } from '../data/languages';
import type { CorrectionMode, CorrectionResult, CorrectionChange, CorrectionLearningItem, LearningType } from './correction-service';

export const MAX_CORRECTION_CHARACTERS = 2000;
export const MAX_RESPONSE_CHARACTERS = 100000;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('교정 응답 형식이 올바르지 않아요.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 20000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('교정 응답의 문장을 확인할 수 없어요.');
  return value;
}
function date(value: unknown) {
  const result = text(value, 64);
  if (!Number.isFinite(Date.parse(result))) throw new Error('교정 시각이 올바르지 않아요.');
  return result;
}
function array(value: unknown) {
  if (!Array.isArray(value) || value.length > 40) throw new Error('교정 항목 형식이 올바르지 않아요.');
  return value;
}
function learningType(value: unknown): LearningType {
  if (value !== 'word' && value !== 'expression' && value !== 'grammar') throw new Error('학습 항목 유형이 올바르지 않아요.');
  return value;
}
export function validateCorrection(value: unknown): CorrectionResult {
  const data = object(value);
  if (data.generationMode !== undefined && data.generationMode !== 'mock' && data.generationMode !== 'model') throw new Error('교정 생성 모드가 올바르지 않아요.');
  if ((data.source !== 'sample' && data.source !== 'server') || !isLearningLanguage(data.learningLanguage) || data.explanationLanguage !== 'ko' ||
    typeof data.originalVersion !== 'number' || !Number.isSafeInteger(data.originalVersion) || data.originalVersion < 0) throw new Error('교정 결과의 언어·버전이 올바르지 않아요.');
  const original = text(data.original), corrected = text(data.corrected);
  const ids = new Set<string>();
  const changes = array(data.changes).map((value): CorrectionChange => {
    const change = object(value), id = text(change.id, 200);
    if (ids.has(id) || (change.kind !== 'grammar' && change.kind !== 'natural')) throw new Error('교정 변경 항목이 올바르지 않아요.');
    ids.add(id);
    const originalSentence = text(change.originalSentence), correctedSentence = text(change.correctedSentence);
    // Both examples must be grounded in the corresponding snapshot, not unrelated text.
    if (!original.includes(originalSentence) || !corrected.includes(correctedSentence)) throw new Error('교정 예문이 원문·교정문과 맞지 않아요.');
    return { id, kind: change.kind, learningType: learningType(change.learningType), expression: text(change.expression, 1000),
      meaning: text(change.meaning, 3000), originalSentence, correctedSentence, explanation: text(change.explanation, 5000) };
  });
  const itemIds = new Set<string>();
  const learningItems = array(data.learningItems).map((value): CorrectionLearningItem => {
    const item = object(value), id = text(item.id, 200);
    if (itemIds.has(id)) throw new Error('학습 항목 ID가 중복돼요.');
    itemIds.add(id);
    const originalSentence = text(item.originalSentence), correctedExample = text(item.correctedExample);
    if (!original.includes(originalSentence) || !corrected.includes(correctedExample)) throw new Error('학습 예문이 교정 결과와 맞지 않아요.');
    const candidate = { id, type: learningType(item.type), expression: text(item.expression, 1000), meaning: text(item.meaning, 3000), originalSentence, correctedExample };
    const change = changes.find((change) => change.id === id);
    if (change && (candidate.type !== change.learningType || candidate.expression !== change.expression || candidate.meaning !== change.meaning ||
      candidate.originalSentence !== change.originalSentence || candidate.correctedExample !== change.correctedSentence)) throw new Error('변경 설명과 학습 항목이 서로 맞지 않아요.');
    return candidate;
  });
  return { source: data.source, ...(data.generationMode ? { generationMode: data.generationMode as 'mock' | 'model' } : {}), diaryId: text(data.diaryId, 200), originalVersion: data.originalVersion,
    originalUpdatedAt: date(data.originalUpdatedAt), learningLanguage: data.learningLanguage, explanationLanguage: 'ko',
    correctedAt: date(data.correctedAt), original, corrected, changes, learningItems };
}
export function matchesOriginal(result: CorrectionResult, entry: DiaryEntry) {
  return result.diaryId === entry.id && result.learningLanguage === entry.learningLanguage && result.originalVersion === (entry.revision ?? 0) &&
    result.originalUpdatedAt === entry.updatedAt && result.original === entry.content;
}
export function validateForRequest(value: unknown, entry: DiaryEntry, mode: CorrectionMode) {
  const result = validateCorrection(value);
  if (!matchesOriginal(result, entry) || result.source !== mode || result.explanationLanguage !== 'ko') throw new Error('요청한 원문과 다른 교정 응답이에요.');
  return result;
}
