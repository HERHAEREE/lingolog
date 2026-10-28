import { Text, View } from 'react-native';
import { Heading, Screen, ui } from '@/components/lingolog-ui';
import { LanguageSelector } from '@/components/language-selector';
import { SampleDiariesAction } from '@/components/sample-diaries-action';

export default function SettingsScreen() {
  return <Screen>
    <Heading title="설정" subtitle="나의 언어 학습 공간" />
    <View style={ui.card}>
      <LanguageSelector />
      <View style={ui.row}><Text style={ui.body}>설명 언어</Text><Text style={ui.sectionTitle}>한국어</Text></View>
      <Text style={ui.muted}>학습 언어와 설명 언어는 별도로 관리해요. 설명 언어는 현재 한국어를 지원해요.</Text>
      <Text style={ui.muted}>일본어 일기 저장과 언어별 복습 구조를 지원합니다. 일본어 교정·표현 추출은 아직 지원하지 않아요.</Text>
    </View>
    <View style={[ui.card, ui.prompt]}>
      <Text style={ui.sectionTitle}>간단한 복습 규칙</Text>
      <Text style={ui.body}>기억했어요: 연속 자기평가에 따라 1·3·7·14·30일 뒤에 다시 복습해요. 이후에는 30일 간격으로 만나요.</Text>
      <Text style={ui.body}>다시 연습: 세션 뒤쪽에 한 번 더 보여드려요. 반복 후에도 어려우면 오늘 복습할 항목으로 남아요.</Text>
      <Text style={ui.muted}>자기평가는 자동 채점 결과나 정확도 점수가 아니에요.</Text>
    </View>
    <View style={ui.card}><Text style={ui.sectionTitle}>이 기기에 기록을 보관해요</Text><Text style={ui.body}>일기·학습 항목·복습 기록·언어 설정은 앱을 다시 시작해도 유지돼요. 다른 기기와 동기화는 아직 지원하지 않아요.</Text></View>
    <SampleDiariesAction />
    <Text style={ui.muted}>Lingolog · 하루 한 문장으로 시작하는 외국어 일기</Text>
  </Screen>;
}
