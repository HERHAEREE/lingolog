import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useGrowth } from '@/state/growth-context';
import { ui } from './lingolog-ui';
import { languageLabels } from '@/data/languages';
import { themeFor } from '@/data/city-themes';

export function GrowthStatus() {
  const growth = useGrowth();
  if (growth.isLoading) return <View style={ui.row}><ActivityIndicator color="#326B55" /><Text style={ui.muted}>작성일 기록을 확인하고 있어요.</Text></View>;
  if (!growth.error) return null;
  return <View style={ui.card}><Text accessibilityRole="alert" style={ui.error}>{growth.error}</Text>
    <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={growth.retry}><Text style={ui.link}>작성일 보상 다시 반영</Text></Pressable>
  </View>;
}
export function GrowthCelebration() {
  const { celebration, dismiss } = useGrowth();
  return <Modal visible={!!celebration} transparent animationType="fade" onRequestClose={dismiss}>
    <View style={ui.modalBackdrop}><View accessibilityViewIsModal style={[ui.card, { width: '100%', maxWidth: 400, maxHeight: '85%' }]}>
      <ScrollView contentContainerStyle={{ gap: 16 }}>
        <Text style={ui.eyebrow}>{celebration ? `${themeFor(celebration.language)?.city} · 나의 ${languageLabels[celebration.language]} 집` : ''}</Text><Text style={ui.sectionTitle}>집에 새로운 모습이 생겼어요</Text>
        <Text accessibilityRole="alert" style={ui.body}>{celebration?.message}</Text>
        <Text style={ui.muted}>내가 남긴 날들의 작은 선물이에요. 쉬어도 집은 그대로 기다려요.</Text>
        <Pressable accessibilityRole="button" style={ui.button} onPress={dismiss}><Text style={ui.buttonText}>좋아요</Text></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}
