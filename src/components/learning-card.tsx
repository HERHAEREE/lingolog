import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { learningTypeLabels } from '@/correction/correction-service';
import type { LearningItem } from '@/data/learning-model';
import { languageNames } from '@/data/languages';
import { ui } from './lingolog-ui';
import { SpeechControls } from './speech-controls';

export function LearningCard({ item }: { item: LearningItem }) {
  return (
    <View style={ui.card}>
      <Link href={{ pathname: '/vocabulary/[id]', params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.expression} 학습 항목 보기`}
        style={({ pressed }) => [{ gap: 12 }, pressed && { opacity: 0.7 }]}>
        <View style={ui.row}><Text style={ui.badge}>{learningTypeLabels[item.type]}</Text><Text style={ui.muted}>{languageNames[item.learningLanguage]}</Text></View>
        <Text style={ui.sectionTitle}>{item.expression}</Text>
        <Text style={ui.body}>{item.meaning}</Text>
        <Text numberOfLines={2} style={ui.muted}>{item.correctedExample}</Text>
        <Text style={ui.link}>자세히 보기 →</Text>
      </Pressable>
      </Link>
      <SpeechControls text={item.expression} language={item.learningLanguage} label="표현" />
      <SpeechControls text={item.correctedExample} language={item.learningLanguage} label="예문" />
    </View>
  );
}
