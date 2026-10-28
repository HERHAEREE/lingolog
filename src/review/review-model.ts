import type { LearningLanguage } from '../data/languages';
import type { LearningItem } from '../data/learning-model';
import { localDate, addDays } from '../dates/local-date';
export { localDate, isDateKey, addDays } from '../dates/local-date';

export type SelfRating = 'again' | 'remembered';
export type ReviewState = {
  itemId: string; learningLanguage: LearningLanguage; dueDate: string;
  intervalDays: number; streak: number; lastReviewedAt: string;
};
export type ReviewHistory = {
  id: string; itemId: string; learningLanguage: LearningLanguage;
  sessionId: string; reviewedAt: string; reviewDate: string;
  evaluationSource: 'self'; selfRating: SelfRating; automaticGrade: null;
};
export type ReviewData = { states: ReviewState[]; history: ReviewHistory[] };

export function stateFor(states: ReviewState[], item: Pick<LearningItem, 'id' | 'learningLanguage'>) {
  return states.find((state) => state.itemId === item.id && state.learningLanguage === item.learningLanguage);
}
export function dueItems(items: LearningItem[], states: ReviewState[], language: LearningLanguage, today: string) {
  const dates = new Map(states.filter((state) => state.learningLanguage === language).map((state) => [state.itemId, state.dueDate]));
  return items.filter((item) => item.learningLanguage === language && (dates.get(item.id) ?? today) <= today)
    .sort((a, b) => (dates.get(a.id) ?? today).localeCompare(dates.get(b.id) ?? today) || a.createdAt.localeCompare(b.createdAt));
}
export function scheduleReview(previous: ReviewState | undefined, itemId: string, language: LearningLanguage, rating: SelfRating, now: Date): ReviewState {
  const streak = rating === 'remembered' ? (previous?.streak ?? 0) + 1 : 0;
  const intervals = [1, 3, 7, 14, 30];
  const intervalDays = rating === 'remembered' ? intervals[Math.min(streak - 1, intervals.length - 1)] : 0;
  return { itemId, learningLanguage: language, dueDate: addDays(localDate(now), intervalDays), intervalDays, streak, lastReviewedAt: now.toISOString() };
}
export function reviewStats(items: LearningItem[], data: ReviewData, language: LearningLanguage, today: string) {
  const history = data.history.filter((entry) => entry.learningLanguage === language);
  const todayHistory = history.filter((entry) => entry.reviewDate === today);
  return {
    total: items.filter((item) => item.learningLanguage === language).length,
    due: dueItems(items, data.states, language, today).length,
    reviewedToday: new Set(todayHistory.map((entry) => entry.itemId)).size,
    remembered: history.filter((entry) => entry.selfRating === 'remembered').length,
    again: history.filter((entry) => entry.selfRating === 'again').length,
  };
}

export type ReviewSession = { queue: string[]; repeated: string[]; assessments: number; remembered: number; again: number; revealed: boolean };
export function createSession(ids: string[]): ReviewSession {
  return { queue: [...ids], repeated: [], assessments: 0, remembered: 0, again: 0, revealed: false };
}
export function revealSession(session: ReviewSession): ReviewSession {
  return { ...session, revealed: true };
}
export function advanceSession(session: ReviewSession, rating: SelfRating): ReviewSession {
  const [current, ...rest] = session.queue;
  if (!current) return session;
  if (!session.revealed) throw new Error('답을 본 뒤 자기평가를 해 주세요.');
  const repeat = rating === 'again' && !session.repeated.includes(current);
  return {
    queue: repeat ? [...rest, current] : rest,
    repeated: repeat ? [...session.repeated, current] : session.repeated,
    assessments: session.assessments + 1,
    remembered: session.remembered + Number(rating === 'remembered'),
    again: session.again + Number(rating === 'again'),
    revealed: false,
  };
}
