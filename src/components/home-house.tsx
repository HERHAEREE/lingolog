import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useGrowth } from '@/state/growth-context';
import { usePreferences } from '@/state/preferences-context';
import { themeFor } from '@/data/city-themes';
import { growthFor, growthStages } from '@/growth/growth-model';
import { HouseGraphic } from './house-graphic';
import { GrowthStatus } from './growth-status';
import { HouseGrowthPreview } from './house-growth-preview';
import { ui } from './lingolog-ui';

export function HomeHouse() {
  const growth = useGrowth();
  const { preferences } = usePreferences();
  const [details, setDetails] = useState(false);
  const language = preferences.learningLanguage;
  const theme = themeFor(language)!;
  const progress = growthFor(growth.data.days, language);
  return <View style={{ gap: 14 }}>
    <Text style={ui.eyebrow}>{theme.city} · 나의 작은 집</Text>
    {!growth.isLoading && !growth.error && <HouseGraphic stage={progress.index} theme={theme} />}
    <GrowthStatus />
    {!growth.isLoading && !growth.error && <>
      <Text style={ui.sectionTitle}>{progress.stage.name} · 누적 {progress.count}일</Text>
      <Text style={ui.muted}>{progress.next ? `다음 성장까지 ${progress.remaining}일` : '모든 집 보상을 만났어요'}</Text>
    </>}
    <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setDetails(true)}><Text style={ui.link}>집 성장 안내 · 완성 모습 보기</Text></Pressable>
    <Modal visible={details} transparent animationType="fade" onRequestClose={() => setDetails(false)}>
      <View style={ui.modalBackdrop}><View accessibilityViewIsModal style={[ui.card, { width: '100%', maxWidth: 400, maxHeight: '85%' }]}>
        <ScrollView contentContainerStyle={{ gap: 16 }}>
          {details && <HouseGrowthPreview key={language} initialLanguage={language} />}
          <Text style={ui.sectionTitle}>나의 기록으로 자라는 집</Text>
          <Text style={ui.body}>언어 실력 점수가 아닌 참여 기록이에요. 일기를 실제로 저장한 날을 언어별로 하루 한 번 계산해요. 과거 날짜로 써도 보상은 오늘의 작성일로 쌓여요.</Text>
          {growthStages.map((stage) => <Text key={stage.days} style={ui.body}>{stage.days}일 · {stage.name}</Text>)}
          <Text style={ui.muted}>쉬거나 일기를 삭제해도 보상은 유지돼요. 샘플 일기는 포함하지 않아요.</Text>
          <Pressable accessibilityRole="button" style={ui.button} onPress={() => setDetails(false)}><Text style={ui.buttonText}>닫기</Text></Pressable>
        </ScrollView>
      </View></View>
    </Modal>
  </View>;
}
