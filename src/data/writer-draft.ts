import { canWriteOn, localDate } from '../dates/local-date';
import { isLearningLanguage, type LearningLanguage } from './languages';
import { questionById } from './writing-questions';
import type { ReuseMission } from '../reuse/reuse-model';

export type WriterDraft = { content: string; language: LearningLanguage; date: string; questionId?: string; reuseMission?: ReuseMission };
export function writerRequest(params: { language?: unknown; date?: unknown; questionId?: unknown }, fallback: LearningLanguage, today = localDate()): WriterDraft {
  const language = isLearningLanguage(params.language) ? params.language : fallback;
  const question = questionById(params.questionId);
  const date = params.date === undefined ? today : params.date;
  if (!canWriteOn(date, today)) throw new Error('오늘 또는 과거 날짜를 선택해 주세요.');
  return { content: '', language, date, ...(question?.learningLanguage === language ? { questionId: question.id } : {}) };
}
export function keepExistingDraft(existing: WriterDraft | null, incoming: WriterDraft): WriterDraft {
  return existing?.content.trim() ? { ...existing } : { ...incoming };
}
