import type { DiaryEntry } from '../data/diary-model';
import { isLearningLanguage, type LearningLanguage } from '../data/languages';
import { isDateKey, localDate } from '../dates/local-date';

export type WritingDay = { learningLanguage: LearningLanguage; date: string; source?: 'legacy' };
export type GrowthData = { migrated: boolean; days: WritingDay[] };
export const growthStages = [
  { days: 0, name: '빈 대지', message: '나의 이야기가 머물 자리를 마련했어요.' },
  { days: 1, name: '기초', message: '첫 기록이 집의 기초가 되었어요.' },
  { days: 3, name: '벽과 지붕', message: '이야기가 쌓여 벽과 지붕이 생겼어요.' },
  { days: 5, name: '완성된 집', message: '다섯 날의 기록으로 집이 완성되었어요.' },
  { days: 7, name: '꾸며진 집', message: '일곱 날의 이야기가 집을 따뜻하게 꾸몄어요.' },
] as const;
export function growthFor(days: WritingDay[], language: LearningLanguage) {
  const count = new Set(days.filter((day) => day.learningLanguage === language).map((day) => day.date)).size;
  const index = growthStages.reduce((stage, current, i) => count >= current.days ? i : stage, 0);
  const next = growthStages[index + 1];
  return { count, index, stage: growthStages[index], next, remaining: next ? next.days - count : 0 };
}
export function isSample(entry: DiaryEntry) {
  return !!entry.sample || !!entry.sampleTemplateId || /^sample-[12](?:$|-copy-)/.test(entry.id);
}
export function historicalDays(entries: DiaryEntry[]): WritingDay[] {
  return uniqueDays(entries.filter((entry) => !isSample(entry) && entry.content.trim()).map((entry) => ({
    learningLanguage: entry.learningLanguage, date: localDate(new Date(entry.createdAt)), source: 'legacy',
  })));
}
export function uniqueDays(days: WritingDay[]): WritingDay[] {
  return [...new Map(days.map((day) => [`${day.learningLanguage}:${day.date}`, { ...day }])).values()]
    .sort((a, b) => a.learningLanguage.localeCompare(b.learningLanguage) || a.date.localeCompare(b.date));
}
export function decodeDays(value: unknown): WritingDay[] {
  if (!Array.isArray(value)) throw new Error('작성 보상 기록을 읽을 수 없습니다.');
  return uniqueDays(value.map((day: unknown) => {
    if (!day || typeof day !== 'object' || !('learningLanguage' in day) || !isLearningLanguage(day.learningLanguage) ||
      !('date' in day) || !isDateKey(day.date) || ('source' in day && day.source !== 'legacy')) throw new Error('작성 보상 기록이 올바르지 않습니다.');
    return { learningLanguage: day.learningLanguage, date: day.date, ...('source' in day ? { source: 'legacy' as const } : {}) };
  }));
}
