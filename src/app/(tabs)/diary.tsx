import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ui } from '@/components/lingolog-ui';
import { DiaryStorageStatus } from '@/components/diary-storage-status';
import { LanguageSelector } from '@/components/language-selector';
import { MonthCalendar } from '@/components/month-calendar';
import { useDiary } from '@/state/diary-context';
import { usePreferences } from '@/state/preferences-context';
import { useReview } from '@/state/review-context';
import { canWriteOn, dateLabel, monthStart } from '@/dates/local-date';
import { calendarEntries, calendarCounts } from '@/data/diary-calendar';

export default function DiaryScreen() {
  const diary = useDiary();
  const preferences = usePreferences();
  const { today } = useReview();
  const [month, setMonth] = useState(() => monthStart(today));
  const [selected, setSelected] = useState(today);
  const language = preferences.preferences.learningLanguage;
  const ready = !diary.isLoading && !diary.loadError && !preferences.isLoading && !preferences.error;
  const entries = ready ? diary.entries.filter((entry) => entry.learningLanguage === language) : [];
  const counts = calendarCounts(entries, language);
  const selectedEntries = calendarEntries(entries, language, selected);
  const writable = ready && canWriteOn(selected, today);
  return <SafeAreaView style={ui.screen} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={[ui.page, { padding: 16 }]}>
      <LanguageSelector /><DiaryStorageStatus />
      <MonthCalendar month={month} selected={selected} today={today} counts={counts}
        onMonth={(day) => { setMonth(day); setSelected(day); }} onSelect={setSelected} />
      <Text style={ui.sectionTitle}>{dateLabel(selected)}</Text>
      {ready && selectedEntries.length === 0 && <Text style={ui.muted}>{selected > today ? '미래 날짜에는 아직 일기를 쓸 수 없어요.' : '이날의 일기는 아직 없어요.'}</Text>}
      {selectedEntries.map((entry) => <Link key={entry.id} href={{ pathname: '/diary/[id]', params: { id: entry.id } }} asChild>
        <Pressable accessibilityRole="button" style={ui.card} accessibilityLabel={`${dateLabel(selected)} 일기 보기`}>
          {entry.sample && <Text style={ui.badge}>샘플</Text>}<Text numberOfLines={2} style={ui.body}>{entry.content}</Text><Text style={ui.link}>일기 보기 →</Text>
        </Pressable>
      </Link>)}
      {writable ? <Link href={{ pathname: '/diary/write', params: { language, date: selected } }} asChild>
        <Pressable accessibilityRole="button" style={ui.button}><Text style={ui.buttonText}>일기 쓰기</Text></Pressable>
      </Link> : <Pressable accessibilityRole="button" disabled accessibilityState={{ disabled: true }} style={[ui.button, { opacity: 0.45 }]}><Text style={ui.buttonText}>일기 쓰기</Text></Pressable>}
    </ScrollView>
  </SafeAreaView>;
}
