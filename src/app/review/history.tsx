import { Link } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ui } from '@/components/lingolog-ui';
import { LanguageSelector } from '@/components/language-selector';
import { ReviewStorageStatus } from '@/components/review-storage-status';
import { useReview } from '@/state/review-context';
import { useLearning } from '@/state/learning-context';
import { usePreferences } from '@/state/preferences-context';
import { languageLabels } from '@/data/languages';

export default function ReviewHistoryScreen() {
  const review = useReview();
  const learning = useLearning();
  const { preferences, isLoading, error } = usePreferences();
  const entries = review.data.history.filter((entry) => entry.learningLanguage === preferences.learningLanguage);
  const ready = !review.isLoading && !review.error && !isLoading && !error;
  return <SafeAreaView style={ui.screen} edges={['top', 'left', 'right']}>
    <FlatList data={ready ? entries : []} keyExtractor={(entry) => entry.id} contentContainerStyle={ui.page}
      ListHeaderComponent={<View style={{ gap: 18 }}><Text style={ui.title}>복습 이력</Text><LanguageSelector /><ReviewStorageStatus />
        <Text style={ui.muted}>{languageLabels[preferences.learningLanguage]} · 자기평가 기록이며 자동 채점 결과가 아닙니다.</Text></View>}
      ListEmptyComponent={ready ? <Text style={ui.muted}>아직 복습 기록이 없어요.</Text> : null}
      renderItem={({ item: entry }) => {
        const item = learning.items.find((value) => value.id === entry.itemId && value.learningLanguage === entry.learningLanguage);
        return <View style={ui.card}>
          <Text style={ui.sectionTitle}>{item?.expression ?? (learning.isLoading ? '학습 항목 확인 중…' : learning.loadError ? '학습 항목을 불러오지 못했어요' : '삭제된 학습 항목')}</Text>
          <Text style={ui.body}>자기평가 · {entry.selfRating === 'remembered' ? '기억했어요' : '다시 연습'}</Text>
          <Text style={ui.muted}>{new Date(entry.reviewedAt).toLocaleString('ko-KR')}</Text>
          {item && <Link href={{ pathname: '/vocabulary/[id]', params: { id: item.id } }} style={ui.link}>학습 항목 보기 →</Link>}
        </View>;
      }} />
  </SafeAreaView>;
}
