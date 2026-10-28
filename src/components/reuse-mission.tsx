import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MissionExpression, ReuseMission as Mission } from '@/reuse/reuse-model';
import { ui } from './lingolog-ui';

function MissionItem({ target }: { target: MissionExpression }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={{ gap: 6 }}>
    <Text style={ui.sectionTitle}>{target.expression}</Text><Text style={ui.body}>{target.meaning}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={ui.secondaryButton} onPress={() => setExpanded(!expanded)}><Text style={ui.link}>{expanded ? '예문 닫기' : '예문 보기'}</Text></Pressable>
    {expanded && <Text selectable style={ui.body}>{target.example}</Text>}
  </View>;
}
export function ReuseMission({ mission, loading, unavailable, disabled, canChange, onChange, onSkip, onResume }: {
  mission: Mission; loading: boolean; unavailable: boolean; disabled: boolean; canChange: boolean;
  onChange: () => void; onSkip: () => void; onResume: () => void;
}) {
  if (loading && !mission.targets.length) return <Text style={ui.muted}>표현을 찾고 있어요. 미션 없이도 저장할 수 있어요.</Text>;
  if (unavailable && !mission.targets.length) return <Text style={ui.muted}>지금은 표현 제안을 불러오지 못했어요. 미션 없이 편하게 써 주세요.</Text>;
  if (!mission.targets.length) return null;
  return <View style={[ui.card, { gap: 10 }]}>
    <Text style={ui.sectionTitle}>표현 재사용 · 선택 미션</Text>
    {mission.skipped ? <>
      <Text style={ui.muted}>이번 글은 미션 없이 자유롭게 써 주세요.</Text>
      <Pressable accessibilityRole="button" disabled={disabled} style={ui.secondaryButton} onPress={onResume}><Text style={ui.link}>표현 다시 보기</Text></Pressable>
    </> : <>
      <Text style={ui.muted}>마음에 드는 표현을 글에 넣어 보세요. 사용하지 않아도 저장할 수 있어요.</Text>
      {mission.targets.map((target) => <MissionItem key={target.itemId} target={target} />)}
      <View style={ui.row}>
        <Pressable accessibilityRole="button" disabled={disabled || !canChange} accessibilityState={{ disabled: disabled || !canChange }} style={[ui.secondaryButton, { opacity: !canChange ? 0.45 : 1 }]} onPress={onChange}><Text style={ui.link}>다른 표현</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={disabled} style={ui.secondaryButton} onPress={onSkip}><Text style={ui.link}>이번에는 건너뛰기</Text></Pressable>
      </View>
      <Text style={ui.muted}>저장 후 원문의 표현 포함만 확인해요. 활용형·동의어·문법적 사용이나 숙달 여부는 판정하지 않아요.</Text>
    </>}
  </View>;
}
