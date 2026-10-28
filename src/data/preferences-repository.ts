import type { DiaryStorage } from './diary-repository';
import { isLearningLanguage, type ExplanationLanguage, type LearningLanguage } from './languages';

export type Preferences = { learningLanguage: LearningLanguage; explanationLanguage: ExplanationLanguage };
export const DEFAULT_PREFERENCES: Preferences = { learningLanguage: 'en', explanationLanguage: 'ko' };
export const PREFERENCES_KEY = '@lingolog/preferences/v1';

export function createPreferencesRepository(storage: DiaryStorage) {
  let loaded = false;
  return {
    async load(): Promise<Preferences> {
      const raw = await storage.getItem(PREFERENCES_KEY);
      if (raw === null) { loaded = true; return { ...DEFAULT_PREFERENCES }; }
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 ||
          !('learningLanguage' in value) || !isLearningLanguage(value.learningLanguage) ||
          !('explanationLanguage' in value) || value.explanationLanguage !== 'ko') throw new Error('언어 설정을 읽을 수 없습니다.');
      loaded = true;
      return { learningLanguage: value.learningLanguage, explanationLanguage: value.explanationLanguage };
    },
    async save(value: Preferences) {
      if (!loaded) throw new Error('언어 설정을 먼저 불러와 주세요.');
      if (!isLearningLanguage(value.learningLanguage) || value.explanationLanguage !== 'ko') throw new Error('지원하지 않는 언어 설정입니다.');
      await storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, ...value }));
      return { ...value };
    },
  };
}
