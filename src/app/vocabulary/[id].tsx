import { useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Modal, Pressable, Text, View } from 'react-native';
import { Screen, ui } from '@/components/lingolog-ui';
import { SpeechControls } from '@/components/speech-controls';
import { LearningStorageStatus } from '@/components/learning-storage-status';
import { DiaryStorageStatus } from '@/components/diary-storage-status';
import { learningTypeLabels } from '@/correction/correction-service';
import type { LearningItem } from '@/data/learning-model';
import { useLearning } from '@/state/learning-context';
import { formatDate, useDiary } from '@/state/diary-context';
import { languageNames } from '@/data/languages';
import { useReview } from '@/state/review-context';
import { stateFor } from '@/review/review-model';
import { ReviewStorageStatus } from '@/components/review-storage-status';
import { ReuseItemLinks } from '@/components/reuse-results';

export default function LearningDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, isLoading, loadError } = useLearning();
  const item = items.find((entry) => entry.id === id);
  if (isLoading || loadError) return <Screen><LearningStorageStatus /></Screen>;
  if (!item) return <Screen><Text style={ui.title}>학습 항목을 찾을 수 없어요</Text><Link href="/vocabulary" style={ui.link}>단어장 목록으로 →</Link></Screen>;
  return <LearningDetail key={item.id} item={item} />;
}

function LearningDetail({ item }: { item: LearningItem }) {
  const { deleteItem, isSaving } = useLearning();
  const review = useReview();
  const reviewState = stateFor(review.data.states, item);
  const { entries, isLoading: diaryLoading, loadError: diaryError } = useDiary();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceExists = entries.some((entry) => entry.id === item.sourceDiaryId);

  async function remove() {
    setConfirmDelete(false);
    setError(null);
    try { await deleteItem(item.id); router.replace('/vocabulary'); }
    catch { setError('학습 항목을 삭제하지 못했어요. 기존 내용은 유지됩니다. 다시 시도해 주세요.'); }
  }

  return (
    <Screen>
      <View style={ui.row}><Text style={ui.badge}>{learningTypeLabels[item.type]}</Text><Text style={ui.muted}>학습 언어 · {languageNames[item.learningLanguage]}</Text></View>
      <Text style={ui.muted}>설명 언어 · 한국어</Text>
      <Text style={ui.title}>{item.expression}</Text>
      <Text style={ui.body}>{item.meaning}</Text>
      <SpeechControls text={item.expression} language={item.learningLanguage} label="표현" />
      <Text style={ui.muted}>저장일 · {formatDate(item.createdAt)}</Text>
      <ReviewStorageStatus />
      <ReuseItemLinks item={item} />
      {!review.isLoading && !review.error && <Text style={ui.muted}>다음 복습일 · {reviewState?.dueDate ?? '오늘 (아직 복습하지 않은 항목)'}</Text>}
      <View style={ui.card}><Text style={ui.sectionTitle}>원래 문장</Text><Text selectable style={ui.body}>{item.originalSentence}</Text></View>
      <View style={[ui.card, ui.prompt]}><Text style={ui.sectionTitle}>교정된 예문</Text><Text selectable style={ui.body}>{item.correctedExample}</Text>
        <SpeechControls text={item.correctedExample} language={item.learningLanguage} label="예문" /></View>
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>원본 일기</Text>
        {diaryLoading || diaryError ? <DiaryStorageStatus /> : sourceExists ? (
          <Link href={{ pathname: '/diary/[id]', params: { id: item.sourceDiaryId } }} style={ui.link}>원본 일기 보기 →</Link>
        ) : <Text style={ui.muted}>원본 일기가 삭제되어도 저장한 항목과 예문은 유지돼요.</Text>}
        <Text style={ui.muted}>예문은 저장 당시 내용이에요. 원본 일기를 수정해도 바뀌지 않아요.</Text>
      </View>
      {error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: isSaving }} disabled={isSaving}
        style={ui.secondaryButton} onPress={() => setConfirmDelete(true)}>
        <Text style={ui.error}>{isSaving ? '처리 중…' : '학습 항목 삭제'}</Text>
      </Pressable>
      <Link href="/vocabulary" style={ui.link}>단어장 목록 보기 →</Link>
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={ui.modalBackdrop}>
          <View accessibilityViewIsModal style={[ui.card, { width: '100%', maxWidth: 400 }]}>
            <Text style={ui.sectionTitle}>학습 항목을 삭제할까요?</Text>
            <Text style={ui.body}>이 항목만 삭제됩니다. 원본 일기는 유지돼요.</Text>
            <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setConfirmDelete(false)}><Text style={ui.link}>취소</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={isSaving} style={[ui.button, { backgroundColor: '#A33E36' }]}
              onPress={() => { void remove(); }}><Text style={ui.buttonText}>삭제</Text></Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
