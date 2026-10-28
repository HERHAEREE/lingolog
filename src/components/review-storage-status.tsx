import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useReview } from '@/state/review-context';
import { ui } from './lingolog-ui';

export function ReviewStorageStatus() {
  const { isLoading, error, retryLoad } = useReview();
  if (isLoading) return <View style={ui.card}><ActivityIndicator color="#326B55" /><Text style={ui.muted}>복습 기록을 불러오는 중이에요…</Text></View>;
  if (!error) return null;
  return <View style={ui.card}><Text accessibilityRole="alert" style={ui.error}>{error}</Text><Pressable accessibilityRole="button" style={ui.button} onPress={() => { void retryLoad(); }}><Text style={ui.buttonText}>복습 기록 다시 불러오기</Text></Pressable></View>;
}
