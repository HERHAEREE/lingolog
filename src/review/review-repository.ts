import type { DiaryStorage } from '../data/diary-repository';
import { isLearningLanguage, type LearningLanguage } from '../data/languages';
import { isDateKey, localDate, scheduleReview, type ReviewData, type ReviewHistory, type ReviewState, type SelfRating } from './review-model';

export const REVIEW_STORAGE_KEY = '@lingolog/review/v1';
type Assessment = { itemId: string; learningLanguage: LearningLanguage; sessionId: string; attemptId: string; rating: SelfRating };

function decode(raw: string): ReviewData {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 ||
      !('states' in value) || !Array.isArray(value.states) || !('history' in value) || !Array.isArray(value.history)) throw new Error('복습 데이터 형식을 읽을 수 없습니다.');
  const stateKeys = new Set<string>();
  const states = value.states.map((unknownState: unknown): ReviewState => {
    if (!unknownState || typeof unknownState !== 'object') throw new Error('복습 상태가 올바르지 않습니다.');
    const state = unknownState as Record<string, unknown>;
    if (typeof state.itemId !== 'string' || !state.itemId || !isLearningLanguage(state.learningLanguage) || !isDateKey(state.dueDate) ||
        !Number.isInteger(state.intervalDays) || (state.intervalDays as number) < 0 ||
        !Number.isInteger(state.streak) || (state.streak as number) < 0 ||
        typeof state.lastReviewedAt !== 'string' || !Number.isFinite(Date.parse(state.lastReviewedAt))) throw new Error('복습 상태가 올바르지 않습니다.');
    const key = JSON.stringify([state.itemId, state.learningLanguage]);
    if (stateKeys.has(key)) throw new Error('중복된 복습 상태입니다.');
    stateKeys.add(key);
    return { itemId: state.itemId, learningLanguage: state.learningLanguage, dueDate: state.dueDate,
      intervalDays: state.intervalDays as number, streak: state.streak as number, lastReviewedAt: state.lastReviewedAt };
  });
  const historyIds = new Set<string>();
  const history = value.history.map((unknownEntry: unknown): ReviewHistory => {
    if (!unknownEntry || typeof unknownEntry !== 'object') throw new Error('복습 이력이 올바르지 않습니다.');
    const entry = unknownEntry as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id || historyIds.has(entry.id) || typeof entry.itemId !== 'string' || !entry.itemId ||
        !isLearningLanguage(entry.learningLanguage) || typeof entry.sessionId !== 'string' || !entry.sessionId ||
        typeof entry.reviewedAt !== 'string' || !Number.isFinite(Date.parse(entry.reviewedAt)) || !isDateKey(entry.reviewDate) ||
        entry.evaluationSource !== 'self' || (entry.selfRating !== 'again' && entry.selfRating !== 'remembered') || entry.automaticGrade !== null) throw new Error('복습 이력이 올바르지 않습니다.');
    historyIds.add(entry.id);
    return { id: entry.id, itemId: entry.itemId, learningLanguage: entry.learningLanguage, sessionId: entry.sessionId,
      reviewedAt: entry.reviewedAt, reviewDate: entry.reviewDate, evaluationSource: 'self', selfRating: entry.selfRating, automaticGrade: null };
  });
  return { states, history };
}

export function createReviewRepository(storage: DiaryStorage, now = () => new Date()) {
  let data: ReviewData | null = null;
  let loading: Promise<ReviewData> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const snapshot = (): ReviewData => ({ states: data!.states.map((state) => ({ ...state })), history: data!.history.map((entry) => ({ ...entry })) });
  return {
    load(): Promise<ReviewData> {
      if (data) return Promise.resolve(snapshot());
      if (loading) return loading;
      loading = (async () => {
        try {
          const raw = await storage.getItem(REVIEW_STORAGE_KEY);
          data = raw === null ? { states: [], history: [] } : decode(raw);
          return snapshot();
        } finally { loading = null; }
      })();
      return loading;
    },
    record(assessment: Assessment): Promise<ReviewData> {
      if (!data) return Promise.reject(new Error('복습 기록을 먼저 불러와 주세요.'));
      const captured = { ...assessment };
      const operation = queue.then(async () => {
        if (!captured.itemId || !captured.sessionId || !captured.attemptId || !isLearningLanguage(captured.learningLanguage) ||
            (captured.rating !== 'again' && captured.rating !== 'remembered')) throw new Error('자기평가 입력이 올바르지 않습니다.');
        const duplicate = data!.history.find((entry) => entry.id === captured.attemptId);
        if (duplicate) {
          if (duplicate.itemId !== captured.itemId || duplicate.learningLanguage !== captured.learningLanguage || duplicate.selfRating !== captured.rating) throw new Error('다른 평가에 사용한 요청입니다.');
          return snapshot();
        }
        const time = now();
        const previous = data!.states.find((state) => state.itemId === captured.itemId && state.learningLanguage === captured.learningLanguage);
        const state = scheduleReview(previous, captured.itemId, captured.learningLanguage, captured.rating, time);
        const history: ReviewHistory = {
          id: captured.attemptId, itemId: captured.itemId, learningLanguage: captured.learningLanguage,
          sessionId: captured.sessionId, reviewedAt: time.toISOString(), reviewDate: localDate(time),
          evaluationSource: 'self', selfRating: captured.rating, automaticGrade: null,
        };
        const next: ReviewData = {
          states: [...data!.states.filter((entry) => !(entry.itemId === state.itemId && entry.learningLanguage === state.learningLanguage)), state],
          history: [history, ...data!.history],
        };
        // Keep state and history in one atomic payload, separate from learning content.
        await storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify({ version: 1, ...next }));
        data = next;
        return snapshot();
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}
