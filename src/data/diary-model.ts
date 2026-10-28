import type { LearningLanguage } from './languages';
import type { ReuseTarget } from '../reuse/reuse-model';

export type DiaryEntry = {
  id: string;
  learningLanguage: LearningLanguage;
  content: string;
  createdAt: string;
  updatedAt: string;
  /** Calendar date, independent of actual creation timestamp; missing only in legacy inputs. */
  diaryDate?: string;
  revision?: number;
  reuseTargets?: ReuseTarget[];
  sample?: boolean;
  sampleTemplateId?: string;
};

export const sampleEntries: DiaryEntry[] = [
  {
    id: 'sample-1', learningLanguage: 'en',
    content: 'Today I took a walk in the park. The air was fresh, and the sky was clear. A small dog ran past me and made me smile. I felt grateful for this peaceful moment.',
    createdAt: '2026-10-09T09:00:00+09:00', updatedAt: '2026-10-09T09:00:00+09:00', sample: true,
  },
  {
    id: 'sample-2', learningLanguage: 'en',
    content: 'I tried a new recipe for dinner. It was not perfect, but I enjoyed cooking. Next time, I want to share this meal with a friend.',
    createdAt: '2026-10-08T19:00:00+09:00', updatedAt: '2026-10-08T19:00:00+09:00', sample: true,
  },
];
