import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useDiary } from '@/state/diary-context';
import { ui } from './lingolog-ui';

export function DiaryStorageStatus() {
  const { isLoading, loadError, retryLoad } = useDiary();
  if (isLoading) return <View style={ui.card}><ActivityIndicator color="#326B55" /><Text style={ui.muted}>저장된 일기를 불러오는 중이에요…</Text></View>;
  if (!loadError) return null;
  return (
    <View style={ui.card}>
      <Text accessibilityRole="alert" style={ui.body}>{loadError}</Text>
      <Pressable accessibilityRole="button" onPress={() => { void retryLoad(); }} style={ui.button}>
        <Text style={ui.buttonText}>다시 불러오기</Text>
      </Pressable>
    </View>
  );
}
