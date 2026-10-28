import type { DiaryEntry } from './diary-model';
import type { LearningLanguage } from './languages';
import { diaryDate } from '../dates/local-date';

export function calendarEntries(entries: DiaryEntry[], language: LearningLanguage, date: string) {
  return entries.filter((entry) => entry.learningLanguage === language && diaryDate(entry) === date);
}
export function calendarCounts(entries: DiaryEntry[], language: LearningLanguage) {
  const counts = new Map<string, number>();
  entries.filter((entry) => entry.learningLanguage === language).forEach((entry) => {
    const day = diaryDate(entry); counts.set(day, (counts.get(day) ?? 0) + 1);
  });
  return counts;
}
