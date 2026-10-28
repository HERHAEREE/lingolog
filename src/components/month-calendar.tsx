import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { monthCells, shiftMonth, isDateKey } from '@/dates/local-date';
import { ui } from './lingolog-ui';

export function MonthCalendar({ month, selected, today, counts, onMonth, onSelect }: {
  month: string; selected: string; today: string; counts: Map<string, number>;
  onMonth: (day: string) => void; onSelect: (day: string) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const available = Math.min(width, 680) - 32;
  const gridWidth = Math.max(available, 7 * Math.max(40, Math.ceil(26 * fontScale + 10)));
  const cells = monthCells(month);
  const previous = shiftMonth(month, -1), next = shiftMonth(month, 1);
  return <View style={{ gap: 14 }}>
    <Text style={ui.title}>{Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월</Text>
    <View style={ui.row}>
      <Pressable accessibilityRole="button" disabled={!isDateKey(previous)} style={ui.secondaryButton} onPress={() => onMonth(previous)}><Text style={ui.link}>‹ 이전 달</Text></Pressable>
      <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => { onMonth(`${today.slice(0, 7)}-01`); onSelect(today); }}><Text style={ui.link}>오늘</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!isDateKey(next)} style={ui.secondaryButton} onPress={() => onMonth(next)}><Text style={ui.link}>다음 달 ›</Text></Pressable>
    </View>
    {gridWidth > available && <Text style={ui.muted}>달력을 좌우로 밀어 다른 날짜를 확인하세요.</Text>}
    <ScrollView horizontal showsHorizontalScrollIndicator={gridWidth > available}>
      <View style={{ width: gridWidth, gap: 6 }}>
        <View style={{ flexDirection: 'row' }}>{['일', '월', '화', '수', '목', '금', '토'].map((weekday) => <Text key={weekday} style={[ui.muted, { width: gridWidth / 7, textAlign: 'center' }]}>{weekday}</Text>)}</View>
        {Array.from({ length: cells.length / 7 }, (_, row) => <View key={row} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          {cells.slice(row * 7, row * 7 + 7).map((day, column) => day ? <Pressable key={day} accessibilityRole="button"
            accessibilityLabel={`${day}, ${day === today ? '오늘, ' : ''}일기 ${counts.get(day) ?? 0}편${day > today ? ', 미래 날짜' : ''}`}
            accessibilityState={{ selected: day === selected }} onPress={() => onSelect(day)}
            style={{ width: gridWidth / 7, minHeight: 66, paddingVertical: 6, alignItems: 'center', gap: 2, borderWidth: day === selected ? 2 : 1, borderColor: day === selected ? '#326B55' : 'transparent', borderRadius: 12, backgroundColor: day === selected ? '#EAF0E4' : undefined }}>
            <Text style={[ui.body, { fontWeight: day === selected ? '700' : '400', color: day > today ? '#737D75' : '#263C35' }]}>{Number(day.slice(8))}</Text>
            <Text style={[ui.muted, { fontSize: 12 }]}>{day === selected ? '✓' : day === today ? '오늘' : ' '}{counts.has(day) ? ' •' : ''}</Text>
          </Pressable> : <View key={`blank-${column}`} style={{ width: gridWidth / 7 }} />)}
        </View>)}
      </View>
    </ScrollView>
    <Text style={ui.muted}>✓ 선택한 날 · • 일기가 있는 날</Text>
  </View>;
}
