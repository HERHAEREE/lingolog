import type { ReactNode } from 'react';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DiaryEntry } from '@/state/diary-context';
import { languageLabels } from '@/data/languages';
import { dateLabel, diaryDate } from '@/dates/local-date';

export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView style={ui.screen} edges={['top', 'left', 'right']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.page}>{children}</ScrollView></SafeAreaView>;
}

export function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={ui.heading}><Text style={ui.eyebrow}>LINGOLOG · 나의 언어 기록</Text><Text style={ui.title}>{title}</Text><Text style={ui.muted}>{subtitle}</Text></View>;
}

export function DiaryCard({ entry }: { entry: DiaryEntry }) {
  return <Link href={{ pathname: '/diary/[id]', params: { id: entry.id } }} asChild><Pressable accessibilityRole="button" accessibilityLabel={`${dateLabel(diaryDate(entry))} 일기 보기`} style={({ pressed }) => [ui.card, pressed && { opacity: 0.7 }]}><View style={ui.row}><Text style={ui.muted}>{dateLabel(diaryDate(entry))}</Text><Text style={ui.badge}>{entry.sample ? '샘플' : `${languageLabels[entry.learningLanguage]} 일기`}</Text></View><Text numberOfLines={1} style={ui.sectionTitle}>{entry.content.split('\n')[0]}</Text><Text numberOfLines={3} style={ui.body}>{entry.content}</Text><Text style={ui.link}>일기 읽기 →</Text></Pressable></Link>;
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF8F4' },
  page: { padding: 24, paddingBottom: 36, gap: 18, width: '100%', maxWidth: 680, alignSelf: 'center' },
  heading: { gap: 9, paddingTop: 14, paddingBottom: 8 },
  eyebrow: { color: '#326B55', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  title: { color: '#263C35', fontSize: 30, fontWeight: '700' },
  sectionTitle: { color: '#263C35', fontSize: 19, fontWeight: '600' },
  muted: { color: '#737D75', fontSize: 14, lineHeight: 22 },
  body: { color: '#39473F', fontSize: 16, lineHeight: 27 },
  card: { backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#E5E7DD', borderRadius: 20, padding: 20, gap: 12 },
  prompt: { backgroundColor: '#EAF0E4', borderColor: '#DDE7D7' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  badge: { color: '#326B55', fontSize: 12, backgroundColor: '#EAF0E4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  button: { backgroundColor: '#326B55', borderRadius: 14, padding: 16, alignItems: 'center', minHeight: 50 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  link: { color: '#326B55', fontSize: 14, fontWeight: '600' },
  error: { color: '#A33E36', fontSize: 14, lineHeight: 22 },
  secondaryButton: { padding: 14, minHeight: 48, alignItems: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  input: { minHeight: 200, padding: 16, borderWidth: 1, borderColor: '#C9D5C7', borderRadius: 14, color: '#263C35', fontSize: 17, lineHeight: 28, textAlignVertical: 'top', backgroundColor: '#FFFFFF' },
});
