import type { LearningType } from '../correction/correction-service';
import type { ExplanationLanguage, LearningLanguage } from './languages';

export type LearningItemInput = {
  type: LearningType;
  expression: string;
  meaning: string;
  originalSentence: string;
  correctedExample: string;
  learningLanguage: LearningLanguage;
  explanationLanguage?: ExplanationLanguage;
  sourceDiaryId: string;
  sourceCorrectionId: string;
};

export type LearningItem = LearningItemInput & { id: string; createdAt: string; explanationLanguage: ExplanationLanguage };

export function learningItemKey(item: Pick<LearningItemInput, 'type' | 'expression' | 'learningLanguage'>) {
  return JSON.stringify([item.learningLanguage, item.type, item.expression.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()]);
}
