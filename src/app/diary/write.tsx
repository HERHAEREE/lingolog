import { useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, TextInput } from 'react-native';
import { Screen, ui } from '@/components/lingolog-ui';
import { DiaryStorageStatus } from '@/components/diary-storage-status';
import { GrowthStatus } from '@/components/growth-status';
import { useDiary } from '@/state/diary-context';
import { usePreferences } from '@/state/preferences-context';
import { useWriterDraft } from '@/state/writer-context';
import { canWriteOn, dateLabel } from '@/dates/local-date';
import { languageLabels, languagePrompts, textCount } from '@/data/languages';
import { questionById } from '@/data/writing-questions';
import { keepExistingDraft, writerRequest, type WriterDraft } from '@/data/writer-draft';
import { useLearning } from '@/state/learning-context';
import { useReview } from '@/state/review-context';
import { missionSuggestions, type ReuseMission as Mission } from '@/reuse/reuse-model';
import { ReuseMission } from '@/components/reuse-mission';

export default function WriteScreen() {
  const params = useLocalSearchParams<{ language?: string; date?: string; questionId?: string }>();
  const preferences = usePreferences();
  if (preferences.isLoading || preferences.error) return <Screen><Text style={ui.muted}>언어 설정을 확인해 주세요.</Text><Link href="/settings" style={ui.link}>설정으로 →</Link></Screen>;
  let incoming: WriterDraft;
  try { incoming = writerRequest(params, preferences.preferences.learningLanguage); }
  catch { return <Screen><Text style={ui.error}>오늘 또는 과거의 올바른 날짜를 선택해 주세요.</Text><Link href="/diary" style={ui.link}>달력으로 →</Link></Screen>; }
  return <Writer key={`${incoming.language}:${incoming.date}:${incoming.questionId ?? ''}`} incoming={incoming} />;
}
function Writer({ incoming }: { incoming: WriterDraft }) {
  const diary = useDiary();
  const shared = useWriterDraft();
  const [draft, setDraft] = useState(() => keepExistingDraft(shared.draft, incoming));
  const [retained] = useState(() => !!shared.draft?.content.trim() &&
    (shared.draft.language !== incoming.language || shared.draft.date !== incoming.date || shared.draft.questionId !== incoming.questionId));
  const [error, setError] = useState<string | null>(null);
  const learning = useLearning();
  const review = useReview();
  const missionReady = !learning.isLoading && !learning.loadError && !review.isLoading;
  const initialTargets = missionReady ? missionSuggestions(learning.items, review.error ? [] : review.data.history, draft.language) : [];
  const mission: Mission = draft.reuseMission ?? { targets: initialTargets, skipped: false };
  const alternatives = missionReady ? missionSuggestions(learning.items, review.error ? [] : review.data.history, draft.language, mission.targets.map((target) => target.itemId)) : [];
  function changeMission(nextMission: Mission) {
    const next = { ...draft, reuseMission: nextMission }; setDraft(next); shared.setDraft(next);
  }
  const question = questionById(draft.questionId);
  const disabled = !draft.content.trim() || diary.isLoading || !!diary.loadError || diary.isSaving || !canWriteOn(draft.date);
  async function save() {
    if (disabled) return;
    setError(null);
    try {
      const targets = mission.skipped ? [] : mission.targets.map(({ itemId, learningLanguage, expression }) => ({ itemId, learningLanguage, expression }));
      const id = await diary.addEntry(draft.content, draft.language, draft.date, targets);
      shared.setDraft(null); Keyboard.dismiss();
      router.replace({ pathname: '/diary/[id]', params: { id, reuseSaved: '1' } });
    } catch { setError('저장하지 못했어요. 작성 내용은 유지되어 있으니 다시 시도해 주세요.'); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen>
      <Text style={ui.title}>일기 쓰기</Text>
      <Text style={ui.sectionTitle}>{languageLabels[draft.language]} · {dateLabel(draft.date)}</Text>
      {retained && <Text accessibilityRole="alert" style={ui.muted}>작성 중인 글을 이어 열었어요. 기존 언어·일기 날짜·질문을 유지했어요. 이 글을 저장한 뒤 새 날짜의 글을 쓸 수 있어요.</Text>}
      <DiaryStorageStatus /><GrowthStatus />
      <Text style={ui.body}>{question?.korean ?? languagePrompts[draft.language].korean}</Text>
      {draft.language === 'en' && question && <Text style={ui.muted}>{question.text}</Text>}
      <ReuseMission mission={mission} loading={learning.isLoading || review.isLoading} unavailable={!!learning.loadError}
        disabled={diary.isSaving} canChange={alternatives.some((target) => !mission.targets.some((current) => current.itemId === target.itemId))}
        onChange={() => changeMission({ targets: alternatives, skipped: false })}
        onSkip={() => changeMission({ ...mission, skipped: true })} onResume={() => changeMission({ ...mission, skipped: false })} />
      <TextInput accessibilityLabel={`${languageLabels[draft.language]} 일기 내용`} multiline value={draft.content}
        onChangeText={(content) => { const next = { ...draft, content, ...(missionReady || draft.reuseMission ? { reuseMission: mission } : {}) }; setDraft(next); shared.setDraft(next); }}
        editable={!diary.isSaving} style={ui.input} placeholder={languagePrompts[draft.language].placeholder}
        placeholderTextColor="#8A948C" autoCapitalize="sentences" autoCorrect spellCheck />
      <Text style={ui.muted}>{textCount(draft.content, draft.language)}</Text>
      {draft.language === 'ja' && <Text style={ui.muted}>일본어 교정은 아직 지원하지 않아요. 저장과 일본어 듣기는 이용할 수 있어요.</Text>}
      {!canWriteOn(draft.date) && <Text style={ui.error}>기기 날짜가 바뀌었어요. 미래 날짜의 일기는 저장할 수 없어요.</Text>}
      {error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} style={[ui.button, { opacity: disabled ? 0.45 : 1 }]} onPress={() => { void save(); }}><Text style={ui.buttonText}>{diary.isSaving ? '저장 중…' : '일기 저장'}</Text></Pressable>
      <Link href="/diary" style={ui.link}>달력으로 돌아가기 →</Link>
    </Screen>
  </KeyboardAvoidingView>;
}
