import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDiary } from '@/state/diary-context';
import { ui } from './lingolog-ui';
import { dateLabel, diaryDate } from '@/dates/local-date';

export function SampleDiariesAction() {
  const diary = useDiary();
  const [message, setMessage] = useState<string | null>(null);
  const disabled = diary.isLoading || !!diary.loadError || diary.isSaving;
  async function add() {
    try { await diary.addSampleEntries(); setMessage('영어 샘플이 준비됐어요. 아래 날짜를 영어 달력에서 확인해 주세요.'); }
    catch { setMessage('샘플을 추가하지 못했어요. 기존 데이터는 유지됩니다.'); }
  }
  return <View style={ui.card}><Text style={ui.sectionTitle}>영어 샘플 교정</Text>
    <Text style={ui.muted}>원문이 일치하는 영어 샘플만 교정 예시를 제공해요. 일본어 교정은 미지원입니다.</Text>
    <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} style={ui.secondaryButton} onPress={() => { void add(); }}><Text style={ui.link}>교정용 샘플 일기 추가</Text></Pressable>
    {message && <Text accessibilityRole="alert" style={ui.muted}>{message}</Text>}
    {message && <Text style={ui.muted}>{[...new Set(diary.entries.filter((entry) => entry.sample && entry.learningLanguage === 'en').map((entry) => dateLabel(diaryDate(entry))))].join(' / ')}</Text>}
  </View>;
}
