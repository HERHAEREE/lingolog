export type LearningLanguage = 'en' | 'ja';
export type ExplanationLanguage = 'ko';
export const languageLabels: Record<LearningLanguage, string> = { en: '영어', ja: '일본어' };
export const languageNames: Record<LearningLanguage, string> = { en: 'English', ja: '日本語' };
export const languagePrompts: Record<LearningLanguage, { text: string; korean: string; placeholder: string }> = {
  en: { text: 'What made you smile today?', korean: '오늘 당신을 미소 짓게 한 일은 무엇인가요?', placeholder: 'Today, I felt happy because…' },
  ja: { text: '今日、笑顔になったことは何ですか？', korean: '오늘 당신을 미소 짓게 한 일은 무엇인가요?', placeholder: '今日は…' },
};
export function isLearningLanguage(value: unknown): value is LearningLanguage {
  return value === 'en' || value === 'ja';
}
export function textCount(content: string, language: LearningLanguage) {
  return language === 'en'
    ? `${content.trim() ? content.trim().split(/\s+/).length : 0} words`
    : `${Array.from(content.replace(/\s/g, '')).length}자`;
}
