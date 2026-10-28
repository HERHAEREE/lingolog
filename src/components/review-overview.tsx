import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useLearning } from '@/state/learning-context';
import { useReview } from '@/state/review-context';
import { usePreferences } from '@/state/preferences-context';
import { languageLabels } from '@/data/languages';
import { reviewStats } from '@/review/review-model';
import { LanguageSelector } from './language-selector';
import { LearningStorageStatus } from './learning-storage-status';
import { ReviewStorageStatus } from './review-storage-status';
import { ui } from './lingolog-ui';

export function ReviewOverview({ compact = false }: { compact?: boolean }) {
  const learning = useLearning();
  const review = useReview();
  const preferences = usePreferences();
  const language = preferences.preferences.learningLanguage;
  const ready = !learning.isLoading && !learning.loadError && !review.isLoading && !review.error && !preferences.isLoading && !preferences.error;
  const stats = reviewStats(learning.items, review.data, language, review.today);
  return <View style={[ui.card, ui.prompt]}>
    <LanguageSelector disabled={review.isSaving} />
    <LearningStorageStatus /><ReviewStorageStatus />
    {ready && <>
      <Text style={ui.sectionTitle}>{languageLabels[language]} · 오늘 복습할 표현 {stats.due}개</Text>
      <Text style={ui.muted}>저장한 항목 {stats.total}개 · 오늘 복습한 항목 {stats.reviewedToday}개</Text>
      {!compact && <Text style={ui.muted}>누적 자기평가: 기억했어요 {stats.remembered}회 / 다시 연습 {stats.again}회</Text>}
      <Link href="/review" asChild><Pressable accessibilityRole="button" style={ui.button}><Text style={ui.buttonText}>{compact ? '복습하기 →' : '오늘 복습'}</Text></Pressable></Link>
      <Link href="/review/history" style={ui.link}>복습 이력 보기 →</Link>
    </>}
    <Text style={ui.muted}>스스로 기억 여부를 확인하는 복습이에요. 자동 채점은 하지 않아요.</Text>
  </View>;
}
