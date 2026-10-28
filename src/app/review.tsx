import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen, ui } from '@/components/lingolog-ui';
import { SpeechControls } from '@/components/speech-controls';
import { LanguageSelector } from '@/components/language-selector';
import { LearningStorageStatus } from '@/components/learning-storage-status';
import { ReviewStorageStatus } from '@/components/review-storage-status';
import { usePreferences } from '@/state/preferences-context';
import { useLearning } from '@/state/learning-context';
import { useReview } from '@/state/review-context';
import { languageLabels, languageNames } from '@/data/languages';
import { advanceSession, createSession, dueItems, revealSession, type SelfRating } from '@/review/review-model';

export default function ReviewScreen() {
  const learning = useLearning();
  const review = useReview();
  const preferences = usePreferences();
  const [round, setRound] = useState(0);
  const language = preferences.preferences.learningLanguage;
  const ready = !learning.isLoading && !learning.loadError && !review.isLoading && !review.error && !preferences.isLoading && !preferences.error;
  const ids = dueItems(learning.items, review.data.states, language, review.today).map((item) => item.id);
  return <Screen>
    <Text style={ui.title}>오늘 복습</Text><LanguageSelector disabled={review.isSaving} />
    <LearningStorageStatus /><ReviewStorageStatus />
    {ready && <Session key={`${language}:${round}`} initialIds={ids} onRestart={() => setRound((value) => value + 1)} />}
  </Screen>;
}

function Session({ initialIds, onRestart }: { initialIds: string[]; onRestart: () => void }) {
  const learning = useLearning();
  const review = useReview();
  const { preferences } = usePreferences();
  const [session, setSession] = useState(() => createSession(initialIds));
  const [sessionId] = useState(() => `review-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const pending = useRef(false);
  const queue = session.queue.filter((id) => learning.items.some((item) => item.id === id && item.learningLanguage === preferences.learningLanguage));
  const item = learning.items.find((entry) => entry.id === queue[0]);
  const revealed = session.revealed && queue[0] === session.queue[0];
  const disabled = review.isSaving || learning.isSaving;

  async function assess(rating: SelfRating) {
    if (!item || !revealed || disabled || pending.current) return;
    pending.current = true; setError(null);
    try {
      const saved = await review.record(item, rating, sessionId, `${sessionId}:${session.assessments + 1}`);
      setFeedback(rating === 'remembered' ? `이전 카드: 기억했어요 · 다음 복습일 ${saved.dueDate}` : '이전 카드: 다시 연습 · 오늘 일정에 남겨두었어요.');
      setSession(advanceSession({ ...session, queue }, rating));
    } catch { setError('자기평가를 저장하지 못했어요. 카드는 그대로 유지됩니다. 다시 시도해 주세요.'); }
    finally { pending.current = false; }
  }

  if (!item) {
    const remaining = dueItems(learning.items, review.data.states, preferences.learningLanguage, review.today).length;
    return <View style={ui.card}>
      <Text style={ui.sectionTitle}>{session.assessments ? '이번 복습을 마쳤어요' : '오늘 복습할 항목이 없어요'}</Text>
      <Text style={ui.body}>자기평가 · 기억했어요 {session.remembered}회 / 다시 연습 {session.again}회</Text>
      {feedback && <Text style={ui.muted}>{feedback}</Text>}
      <Text style={ui.muted}>{remaining ? `다시 연습할 항목 ${remaining}개가 오늘 일정에 남아 있어요.` : '기억한 항목은 다음 복습 날짜에 다시 만나요. 저장한 항목이 없다면 샘플 교정에서 표현을 저장해 주세요.'}</Text>
      {remaining > 0 && <Pressable accessibilityRole="button" style={ui.button} onPress={onRestart}><Text style={ui.buttonText}>남은 항목 다시 복습</Text></Pressable>}
      <Link href="/review/history" style={ui.link}>복습 이력 보기 →</Link>
      <Link href="/vocabulary" style={ui.link}>단어장으로 돌아가기 →</Link>
    </View>;
  }

  return <>
    {feedback && <Text accessibilityRole="alert" style={ui.muted}>{feedback}</Text>}
    <Text style={ui.muted}>{languageLabels[item.learningLanguage]} · 남은 카드 {queue.length}장 · 자기평가 {session.assessments}회</Text>
    <View style={[ui.card, ui.prompt]}>
      <Text style={ui.eyebrow}>{revealed ? '뒷면 · 표현과 내 일기 예문' : '앞면 · 한국어 뜻 또는 설명'}</Text>
      <Text style={[ui.title, { fontSize: 25 }]}>{item.meaning}</Text>
      {!revealed ? <>
        <Text style={ui.muted}>뜻을 보고 {languageLabels[item.learningLanguage]} 표현을 떠올려 보세요.</Text>
        <Pressable accessibilityRole="button" style={ui.button} onPress={() => setSession(revealSession({ ...session, queue }))}><Text style={ui.buttonText}>답 보기</Text></Pressable>
      </> : <>
        <Text style={ui.eyebrow}>{languageNames[item.learningLanguage]} 표현</Text>
        <Text selectable style={ui.sectionTitle}>{item.expression}</Text>
        <SpeechControls key={`expression:${item.id}:${session.assessments}`} text={item.expression} language={item.learningLanguage} label="정답 표현" />
        <Text style={ui.eyebrow}>내 일기의 교정된 예문</Text>
        <Text selectable style={ui.body}>{item.correctedExample}</Text>
        <SpeechControls key={`example:${item.id}:${session.assessments}`} text={item.correctedExample} language={item.learningLanguage} label="예문" />
        <Text style={ui.eyebrow}>저장 당시 원래 문장</Text>
        <Text selectable style={ui.body}>{item.originalSentence}</Text>
        <Text style={ui.muted}>자기평가예요. 자동 채점 결과가 아니에요.</Text>
        {error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }}
          style={ui.secondaryButton} onPress={() => { void assess('again'); }}><Text style={ui.link}>다시 연습</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }}
          style={[ui.button, { opacity: disabled ? 0.5 : 1 }]} onPress={() => { void assess('remembered'); }}>
          <Text style={ui.buttonText}>{disabled ? '저장 중…' : '기억했어요'}</Text>
        </Pressable>
      </>}
    </View>
    <Text style={ui.muted}>다시 연습한 카드는 세션 뒤쪽에 한 번 더 나와요. 반복 후에도 어렵다면 오늘 일정에 남겨 다음 세션에서 연습해요.</Text>
  </>;
}
