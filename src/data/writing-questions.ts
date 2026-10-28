import type { LearningLanguage } from './languages';
export type WritingQuestion = { id: string; learningLanguage: LearningLanguage; type: 'day' | 'imagine' | 'sentence'; text: string; korean: string };
export const questionTypeLabels = { day: '오늘 있었던 일', imagine: '상상하기', sentence: '한 문장 쓰기' };
export const writingQuestions: WritingQuestion[] = [
  { id: 'day-smile', learningLanguage: 'en', type: 'day', text: 'What made you smile today?', korean: '오늘 당신을 미소 짓게 한 일은 무엇인가요?' },
  { id: 'imagine-cafe', learningLanguage: 'en', type: 'imagine', text: 'Imagine a quiet café in New York. What do you see?', korean: '뉴욕의 조용한 카페에 앉아 있다면 무엇이 보일까요?' },
  { id: 'sentence-feeling', learningLanguage: 'en', type: 'sentence', text: 'Describe your day in one sentence.', korean: '오늘 하루를 한 문장으로 표현해 보세요.' },
  { id: 'day-discovery', learningLanguage: 'en', type: 'day', text: 'What small thing did you notice today?', korean: '오늘 새롭게 눈에 들어온 작은 것은 무엇인가요?' },
  { id: 'imagine-letter', learningLanguage: 'en', type: 'imagine', text: 'Write a short note to your future self.', korean: '미래의 나에게 짧은 메모를 남겨 보세요.' },
  { id: 'sentence-thanks', learningLanguage: 'en', type: 'sentence', text: 'Write one sentence about something you appreciate.', korean: '고마운 것 하나를 한 문장으로 적어 보세요.' },
  { id: 'ja-day-smile', learningLanguage: 'ja', type: 'day', text: '今日、笑顔になったことは何ですか？', korean: '오늘 당신을 미소 짓게 한 일을 일본어로 적어 보세요.' },
  { id: 'ja-imagine-street', learningLanguage: 'ja', type: 'imagine', text: '東京の静かな道を歩いています。何が見えますか？', korean: '도쿄의 조용한 골목을 걷는다면 무엇이 보일까요?' },
  { id: 'ja-sentence-day', learningLanguage: 'ja', type: 'sentence', text: '今日の一日を一文で書いてみましょう。', korean: '오늘 하루를 일본어 한 문장으로 표현해 보세요.' },
  { id: 'ja-day-food', learningLanguage: 'ja', type: 'day', text: '今日は何を食べましたか？', korean: '오늘 먹은 음식과 느낌을 일본어로 적어 보세요.' },
  { id: 'ja-imagine-letter', learningLanguage: 'ja', type: 'imagine', text: '未来の自分に短い手紙を書いてみましょう。', korean: '미래의 나에게 일본어로 짧은 메모를 남겨 보세요.' },
  { id: 'ja-sentence-thanks', learningLanguage: 'ja', type: 'sentence', text: '感謝していることを一文で書いてみましょう。', korean: '고마운 것 하나를 일본어 한 문장으로 적어 보세요.' },
];
export function questionForDay(date: string, language: LearningLanguage = 'en'): WritingQuestion {
  const hash = [...date].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  const questions = writingQuestions.filter((question) => question.learningLanguage === language);
  return questions[hash % questions.length];
}
export function questionById(id: unknown) {
  return typeof id === 'string' ? writingQuestions.find((question) => question.id === id) : undefined;
}
export function nextQuestion(question: WritingQuestion) {
  const questions = writingQuestions.filter((entry) => entry.learningLanguage === question.learningLanguage);
  return questions[(questions.findIndex((entry) => entry.id === question.id) + 1) % questions.length];
}
