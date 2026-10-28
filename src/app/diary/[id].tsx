import { useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Screen, ui } from '@/components/lingolog-ui';
import { DiaryStorageStatus } from '@/components/diary-storage-status';
import { formatDate, useDiary, type DiaryEntry } from '@/state/diary-context';
import { languageLabels, languageNames, textCount } from '@/data/languages';
import { DiarySpeech } from '@/components/diary-speech';
import { GrowthStatus } from '@/components/growth-status';
import { dateLabel, diaryDate } from '@/dates/local-date';
import { ReuseDiaryResult } from '@/components/reuse-results';

export default function DiaryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entries, isLoading, loadError } = useDiary();
  const entry = entries.find((item) => item.id === id);
  if (isLoading || loadError) return <Screen><DiaryStorageStatus /></Screen>;
  if (!entry) return (
    <Screen>
      <Text style={ui.title}>일기를 찾을 수 없어요</Text>
      <Text style={ui.body}>삭제되었거나 존재하지 않는 일기예요.</Text>
      <Link href="/diary" style={ui.link}>일기 목록으로 돌아가기 →</Link>
    </Screen>
  );
  return <DiaryDetail key={entry.id} entry={entry} />;
}

function DiaryDetail({ entry }: { entry: DiaryEntry }) {
  const { updateEntry, deleteEntry, isSaving } = useDiary();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setError(null);
    try {
      await updateEntry(entry.id, draft);
      setEditing(false);
      Keyboard.dismiss();
    } catch {
      setError('수정 내용을 저장하지 못했어요. 입력한 내용은 유지되어 있으니 다시 시도해 주세요.');
    }
  }

  async function remove() {
    setConfirmDelete(false);
    setError(null);
    try {
      await deleteEntry(entry.id);
      router.replace('/diary');
    } catch {
      setError('일기를 삭제하지 못했어요. 기존 일기는 유지됩니다. 다시 시도해 주세요.');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <GrowthStatus />
        <View style={ui.heading}>
          <Text style={ui.eyebrow}>{entry.sample ? '샘플 일기' : `나의 ${languageLabels[entry.learningLanguage]} 일기`}</Text>
          <Text style={[ui.title, { fontSize: 25 }]}>{dateLabel(diaryDate(entry))}</Text>
          <Text style={ui.muted}>작성한 날: {formatDate(entry.createdAt)}</Text>
          <Text style={ui.muted}>{languageNames[entry.learningLanguage]} · {textCount(entry.content, entry.learningLanguage)}</Text>
          {entry.updatedAt !== entry.createdAt && <Text style={ui.muted}>수정일: {formatDate(entry.updatedAt)}</Text>}
        </View>
        <View style={ui.card}>
          {editing ? (
            <TextInput accessibilityLabel="일기 수정 내용" multiline value={draft} onChangeText={setDraft}
              editable={!isSaving} style={ui.input} autoCapitalize="sentences" autoCorrect spellCheck />
          ) : <Text selectable style={[ui.body, { fontSize: 18, lineHeight: 32 }]}>{entry.content}</Text>}
          {error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
          {editing ? (
            <>
              <Pressable accessibilityRole="button" disabled={isSaving || !draft.trim()}
                accessibilityState={{ disabled: isSaving || !draft.trim() }} onPress={() => { void save(); }}
                style={[ui.button, { opacity: isSaving || !draft.trim() ? 0.45 : 1 }]}>
                <Text style={ui.buttonText}>{isSaving ? '저장 중…' : '수정 내용 저장'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSaving} style={ui.secondaryButton}
                onPress={() => { setEditing(false); setDraft(entry.content); setError(null); }}>
                <Text style={ui.link}>수정 취소</Text>
              </Pressable>
            </>
          ) : (
            <View style={ui.row}>
              <Pressable accessibilityRole="button" disabled={isSaving} style={ui.secondaryButton}
                onPress={() => { setDraft(entry.content); setEditing(true); setError(null); }}>
                <Text style={ui.link}>일기 수정</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSaving} style={ui.secondaryButton}
                onPress={() => setConfirmDelete(true)}><Text style={ui.error}>{isSaving ? '처리 중…' : '일기 삭제'}</Text></Pressable>
            </View>
          )}
        </View>
        {!editing && <ReuseDiaryResult entry={entry} />}
        {!editing && <DiarySpeech key={`${entry.updatedAt}:${entry.content}`} entry={entry} />}
        {!editing && <Link href={{ pathname: '/diary/correction/[id]', params: { id: entry.id } }} asChild>
          <Pressable accessibilityRole="button" disabled={isSaving} style={ui.button}>
            <Text style={ui.buttonText}>교정하기</Text>
          </Pressable>
        </Link>}
        {!editing && <Text style={ui.muted}>현재는 원문이 그대로인 샘플 일기만 샘플 교정을 제공해요.</Text>}
        <Link href="/diary" style={ui.link}>일기 목록 보기 →</Link>
        <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
          <View style={ui.modalBackdrop}>
            <View accessibilityViewIsModal style={[ui.card, { width: '100%', maxWidth: 400 }]}>
              <Text style={ui.sectionTitle}>일기를 삭제할까요?</Text>
              <Text style={ui.body}>삭제한 일기는 되돌릴 수 없어요.</Text>
              <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setConfirmDelete(false)}>
                <Text style={ui.link}>취소</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSaving} style={[ui.button, { backgroundColor: '#A33E36' }]}
                onPress={() => { void remove(); }}><Text style={ui.buttonText}>삭제</Text></Pressable>
            </View>
          </View>
        </Modal>
      </Screen>
    </KeyboardAvoidingView>
  );
}
