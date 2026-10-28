import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DiaryProvider } from '@/state/diary-context';
import { LearningProvider } from '@/state/learning-context';
import { ReviewProvider } from '@/state/review-context';
import { PreferencesProvider } from '@/state/preferences-context';
import { SpeechProvider } from '@/state/speech-context';
import { GrowthProvider } from '@/state/growth-context';
import { GrowthCelebration } from '@/components/growth-status';
import { WriterProvider } from '@/state/writer-context';
import { ReuseProvider } from '@/state/reuse-context';
import { CorrectionProvider } from '@/state/correction-context';
import { AnonymousAuthProvider } from '@/state/auth-context';

export default function RootLayout() {
  return (
    <AnonymousAuthProvider>
    <DiaryProvider>
      <WriterProvider>
      <GrowthProvider>
      <PreferencesProvider>
        <LearningProvider>
          <ReviewProvider>
            <ReuseProvider>
            <CorrectionProvider>
            <SpeechProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerStyle: { backgroundColor: '#FAF8F4' }, headerTintColor: '#263C35', contentStyle: { backgroundColor: '#FAF8F4' } }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="diary/[id]" options={{ title: '일기 상세' }} />
              <Stack.Screen name="diary/write" options={{ title: '일기 쓰기' }} />
              <Stack.Screen name="diary/correction/[id]" options={{ title: '샘플 교정' }} />
              <Stack.Screen name="vocabulary/[id]" options={{ title: '학습 항목 상세' }} />
              <Stack.Screen name="review" options={{ title: '오늘 복습' }} />
              <Stack.Screen name="review/history" options={{ title: '복습 이력' }} />
            </Stack>
            <GrowthCelebration />
            </SpeechProvider>
            </CorrectionProvider>
            </ReuseProvider>
          </ReviewProvider>
        </LearningProvider>
      </PreferencesProvider>
      </GrowthProvider>
      </WriterProvider>
    </DiaryProvider>
    </AnonymousAuthProvider>
  );
}
