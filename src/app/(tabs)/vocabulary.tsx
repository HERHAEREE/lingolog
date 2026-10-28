import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heading, ui } from '@/components/lingolog-ui';
import { LearningCard } from '@/components/learning-card';
import { ReviewOverview } from '@/components/review-overview';
import { useLearning } from '@/state/learning-context';
import { usePreferences } from '@/state/preferences-context';
import { languageLabels } from '@/data/languages';

const words = [
  { word: 'grateful', meaning: '감사하는', example: 'I felt grateful for this peaceful moment.' },
  { word: 'peaceful', meaning: '평화로운, 고요한', example: 'A walk in the park made my day peaceful.' },
  { word: 'try', meaning: '시도하다, 해 보다', example: 'I want to try a new recipe tomorrow.' },
  { word: 'share', meaning: '나누다, 공유하다', example: 'I want to share this meal with a friend.' },
];

export default function VocabularyScreen() {
  const { items, isLoading, loadError } = useLearning();
  const preferences = usePreferences();
  const language = preferences.preferences.learningLanguage;
  const filtered = preferences.isLoading || preferences.error ? [] : items.filter((item) => item.learningLanguage === language);
  return (
    <SafeAreaView style={ui.screen} edges={['top', 'left', 'right']}>
      <FlatList data={filtered} keyExtractor={(item) => item.id} contentContainerStyle={ui.page}
        renderItem={({ item }) => <LearningCard item={item} />}
        ListHeaderComponent={<View style={{ gap: 18 }}>
          <Heading title="작은 단어장" subtitle="일기에서 배운 단어와 표현을 모아 보세요." />
          <ReviewOverview /><Text style={ui.sectionTitle}>{languageLabels[language]} 학습 항목 · {filtered.length}개</Text>
        </View>}
        ListEmptyComponent={!isLoading && !loadError && !preferences.isLoading && !preferences.error ? <View style={ui.card}>
          <Text style={ui.sectionTitle}>아직 저장한 항목이 없어요</Text>
          <Text style={ui.body}>{language === 'en' ? '샘플 일기 상세에서 교정하기를 누르고 마음에 드는 표현을 단어장에 저장해 보세요.' : '일본어 교정과 표현 저장은 아직 지원하지 않아요. 영어를 선택하면 기존 항목을 복습할 수 있어요.'}</Text>
        </View> : null}
        ListFooterComponent={language === 'en' ? <View style={{ gap: 18, paddingTop: 18 }}>
          <Text style={ui.sectionTitle}>참고용 샘플 단어</Text>
          <Text style={ui.muted}>아래는 기존 학습 예시이며, 저장한 항목에 포함되지 않아요.</Text>
          {words.map(({ word, meaning, example }) => <View key={word} style={ui.card}>
            <View style={ui.row}><Text style={ui.sectionTitle}>{word}</Text><Text style={ui.badge}>샘플</Text></View>
            <Text style={ui.body}>{meaning}</Text><Text style={ui.muted}>{example}</Text>
          </View>)}
        </View> : null}
      />
    </SafeAreaView>
  );
}
