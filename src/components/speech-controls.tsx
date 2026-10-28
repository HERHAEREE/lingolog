import { useEffect, useId, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LearningLanguage } from '@/data/languages';
import { useSpeech } from '@/state/speech-context';
import { sentences } from '@/speech/speech-controller';
import { ui } from './lingolog-ui';

export function SpeechControls({ text, language, label, sentenceControls = false }: {
  text: string; language: LearningLanguage; label: string; sentenceControls?: boolean;
}) {
  const id = useId();
  const { owner, error, play, stop, speeds, setSpeed } = useSpeech();
  const [expanded, setExpanded] = useState(false);
  const [requested, setRequested] = useState(false);
  useEffect(() => () => { void stop(id); }, [id, stop, text, language]);
  const active = owner === id;
  function read(value: string) { setRequested(true); void play(id, value, language, speeds[language]); }
  return <View style={{ gap: 8 }}>
    <View style={[ui.row, { flexWrap: 'wrap' }]}>
      {(['normal', 'slow'] as const).map((speed) => <Pressable key={speed} accessibilityRole="radio"
        accessibilityState={{ checked: speeds[language] === speed }} style={ui.secondaryButton}
        onPress={() => setSpeed(language, speed)}><Text style={ui.link}>{speeds[language] === speed ? '✓ ' : ''}{speed === 'normal' ? '기본 속도' : '느린 속도'}</Text></Pressable>)}
    </View>
    <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => active ? void stop(id) : read(text)}>
      <Text style={ui.link}>{active ? '■ 중지' : `▶ ${label} 듣기`}</Text>
    </Pressable>
    {requested && error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {sentenceControls && <>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={ui.secondaryButton} onPress={() => setExpanded(!expanded)}>
        <Text style={ui.link}>{expanded ? '문장별 듣기 접기' : '문장별 듣기 펼치기'}</Text>
      </Pressable>
      {expanded && sentences(text).map((sentence, index) => <View key={`${index}:${sentence}`} style={{ gap: 4 }}>
        <Text style={ui.body}>{sentence}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번 문장 듣기`} style={ui.secondaryButton} onPress={() => read(sentence)}>
          <Text style={ui.link}>▶ {index + 1}번 문장 듣기</Text>
        </Pressable>
      </View>)}
    </>}
  </View>;
}
