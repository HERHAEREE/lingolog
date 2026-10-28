import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { questionById, questionForDay, nextQuestion, questionTypeLabels } from '@/data/writing-questions';
import { useReview } from '@/state/review-context';
import { usePreferences } from '@/state/preferences-context';
import { languageLabels } from '@/data/languages';
import { ui } from './lingolog-ui';

export function TodaysQuestion() {
  const { today } = useReview();
  const { preferences } = usePreferences();
  const language = preferences.learningLanguage;
  const [choice, setChoice] = useState<{ day: string; id: string } | null>(null);
  const alternate = choice?.day === today ? questionById(choice.id) : undefined;
  const question = (alternate?.learningLanguage === language ? alternate : undefined) ?? questionForDay(today, language);
  return <View style={{ gap: 14 }}>
    <Text style={ui.eyebrow}>오늘의 {languageLabels[language]} 질문 · {questionTypeLabels[question.type]}</Text>
    {language === 'en' && <Text style={[ui.sectionTitle, { fontSize: 23 }]}>{question.text}</Text>}
    <Text style={ui.body}>{question.korean}</Text>
    <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setChoice({ day: today, id: nextQuestion(question).id })}>
      <Text style={ui.link}>다른 질문 보기</Text>
    </Pressable>
    <Link href={{ pathname: '/diary/write', params: { questionId: question.id, language, date: today } }} asChild><Pressable accessibilityRole="button" style={ui.button}><Text style={ui.buttonText}>일기 쓰기 →</Text></Pressable></Link>
  </View>;
}
