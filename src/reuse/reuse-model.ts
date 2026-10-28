import type { DiaryEntry } from '../data/diary-model';
import type { LearningItem } from '../data/learning-model';
import { isLearningLanguage, type LearningLanguage } from '../data/languages';
import type { ReviewHistory } from '../review/review-model';
import { includesEnglishExpression } from './english-matcher';
import { includesJapaneseExpression } from './japanese-matcher';

export type ReuseTarget = { itemId: string; learningLanguage: LearningLanguage; expression: string };
export type MissionExpression = ReuseTarget & { meaning: string; example: string };
export type ReuseMission = { targets: MissionExpression[]; skipped: boolean };
export type ReuseRecord = ReuseTarget & {
  diaryId: string; checkedAt: string; diaryRevision: number; diaryUpdatedAt: string; included: boolean; diaryDeleted: boolean;
};
export function includesExpression(original: string, expression: string, language: LearningLanguage) {
  return language === 'en' ? includesEnglishExpression(original, expression) : includesJapaneseExpression(original, expression);
}
export function reuseKey(target: ReuseTarget, diaryId: string) { return JSON.stringify([diaryId, target.learningLanguage, target.itemId]); }
export function decodeTargets(value: unknown, language: LearningLanguage): ReuseTarget[] {
  if (!Array.isArray(value) || value.length > 2) throw new Error('표현 미션을 읽을 수 없습니다.');
  const ids = new Set<string>();
  return value.map((target: unknown) => {
    if (!target || typeof target !== 'object' || !('itemId' in target) || typeof target.itemId !== 'string' || !target.itemId || ids.has(target.itemId) ||
      !('learningLanguage' in target) || !isLearningLanguage(target.learningLanguage) || target.learningLanguage !== language ||
      !('expression' in target) || typeof target.expression !== 'string' || !target.expression.trim()) throw new Error('표현 미션이 올바르지 않습니다.');
    ids.add(target.itemId);
    return { itemId: target.itemId, learningLanguage: target.learningLanguage, expression: target.expression.trim() };
  });
}
export function missionSuggestions(items: LearningItem[], history: ReviewHistory[], language: LearningLanguage, previousIds: string[] = []): MissionExpression[] {
  const reviewed = new Map<string, string>();
  history.filter((entry) => entry.learningLanguage === language).forEach((entry) => {
    if ((reviewed.get(entry.itemId) ?? '') < entry.reviewedAt) reviewed.set(entry.itemId, entry.reviewedAt);
  });
  const seen = new Set<string>();
  const candidates = items.filter((item) => item.learningLanguage === language && item.expression.trim()).sort((a, b) =>
    Number(reviewed.has(b.id)) - Number(reviewed.has(a.id)) ||
    (reviewed.get(b.id) ?? '').localeCompare(reviewed.get(a.id) ?? '') || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .filter((item) => {
      const normalized = item.expression.normalize('NFKC').trim().replace(/\s+/gu, ' ');
      const key = language === 'en' ? normalized.toLowerCase() : normalized;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  const rotated = [...candidates.filter((item) => !previousIds.includes(item.id)), ...candidates.filter((item) => previousIds.includes(item.id))];
  return rotated.slice(0, 2).map((item) => ({ itemId: item.id, learningLanguage: item.learningLanguage, expression: item.expression, meaning: item.meaning, example: item.correctedExample }));
}
export function currentReuseRecords(records: ReuseRecord[], entries: DiaryEntry[], itemId?: string, language?: LearningLanguage) {
  const current = new Map(entries.map((entry) => [entry.id, entry]));
  return records.filter((record) => {
    const diary = current.get(record.diaryId);
    return record.included && !record.diaryDeleted && !!diary && diary.learningLanguage === record.learningLanguage &&
      !!diary.reuseTargets?.some((target) => target.itemId === record.itemId && target.learningLanguage === record.learningLanguage && target.expression === record.expression) &&
      (diary.revision ?? 0) === record.diaryRevision && diary.updatedAt === record.diaryUpdatedAt &&
      (!itemId || record.itemId === itemId) && (!language || record.learningLanguage === language);
  });
}
