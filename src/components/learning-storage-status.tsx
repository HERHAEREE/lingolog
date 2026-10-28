import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useLearning } from '@/state/learning-context';
import { ui } from './lingolog-ui';

export function LearningStorageStatus() {
  const { isLoading, loadError, retryLoad } = useLearning();
  if (isLoading) return <View style={ui.card}><ActivityIndicator color="#326B55" /><Text style={ui.muted}>단어장을 불러오는 중이에요…</Text></View>;
  if (!loadError) return null;
  return (
    <View style={ui.card}>
      <Text accessibilityRole="alert" style={ui.error}>{loadError}</Text>
      <Pressable accessibilityRole="button" style={ui.button} onPress={() => { void retryLoad(); }}>
        <Text style={ui.buttonText}>단어장 다시 불러오기</Text>
      </Pressable>
    </View>
  );
}
