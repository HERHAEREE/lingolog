import type { DiaryEntry } from '../data/diary-model';
import type { ExplanationLanguage, LearningLanguage } from '../data/languages';

export type LearningType = 'word' | 'expression' | 'grammar';
export const learningTypeLabels: Record<LearningType, string> = {
  word: '단어', expression: '표현', grammar: '문법',
};

export type CorrectionChange = {
  id: string;
  kind: 'grammar' | 'natural';
  learningType: LearningType;
  expression: string;
  meaning: string;
  originalSentence: string;
  correctedSentence: string;
  explanation: string;
};

export type CorrectionResult = {
  source: 'sample' | 'server';
  generationMode?: 'mock' | 'model';
  diaryId: string;
  originalVersion: number;
  originalUpdatedAt: string;
  learningLanguage: LearningLanguage;
  explanationLanguage: ExplanationLanguage;
  correctedAt: string;
  original: string;
  corrected: string;
  changes: CorrectionChange[];
  learningItems: CorrectionLearningItem[];
};

export type CorrectionLearningItem = {
  id: string; type: LearningType; expression: string; meaning: string;
  originalSentence: string; correctedExample: string;
};
export type CorrectionMode = CorrectionResult['source'];

export type CorrectionOutcome =
  | { status: 'available'; result: CorrectionResult }
  | { status: 'unsupported'; message: string };

// Replace this implementation with an API adapter without changing the screen contract.
export interface CorrectionService {
  correct(entry: DiaryEntry, explanationLanguage?: ExplanationLanguage): Promise<CorrectionOutcome>;
}
