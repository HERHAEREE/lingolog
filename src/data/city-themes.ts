import type { LearningLanguage } from './languages';

// Theme IDs are visual choices, never reward/storage keys.
export type CityTheme = { id: string; learningLanguage: LearningLanguage; city: string; subtitle: string; renderer: 'new-york-house' | 'tokyo-house' };
export const cityThemes: CityTheme[] = [
  { id: 'new-york', learningLanguage: 'en', city: '뉴욕', subtitle: '조용한 골목, 나의 작은 집', renderer: 'new-york-house' },
  { id: 'tokyo', learningLanguage: 'ja', city: '도쿄', subtitle: '작은 골목에 쌓이는 나의 이야기', renderer: 'tokyo-house' },
];
export function themeFor(language: LearningLanguage, id?: string) {
  return cityThemes.find((theme) => theme.learningLanguage === language && (!id || theme.id === id));
}
