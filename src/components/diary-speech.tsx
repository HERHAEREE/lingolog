import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { correctionService } from '@/correction';
import { useCorrection } from '@/state/correction-context';
import { matchesOriginal } from '@/correction/correction-validation';
import type { DiaryEntry } from '@/data/diary-model';
import type { CorrectionResult } from '@/correction/correction-service';
import { SpeechControls } from './speech-controls';
import { ui } from './lingolog-ui';

export function DiarySpeech({ entry }: { entry: DiaryEntry }) {
  const correction = useCorrection();
  const stored = [...correction.results].reverse().find((result) => matchesOriginal(result, entry));
  const [sample, setSample] = useState<CorrectionResult | null>(null);
  const corrected = sample && matchesOriginal(sample, entry) ? sample.corrected : null;
  useEffect(() => {
    let active = true;
    void correctionService.correct(entry).then((outcome) => {
      if (active) setSample(outcome.status === 'available' ? outcome.result : null);
    }).catch(() => {});
    return () => { active = false; };
  }, [entry]);
  return <>
    <View style={ui.card}><Text style={ui.sectionTitle}>원문 듣기</Text>
      <SpeechControls text={entry.content} language={entry.learningLanguage} label="원문 전체" sentenceControls />
    </View>
    {(stored || corrected) && <View style={ui.card}><Text style={ui.badge}>{stored?.generationMode === 'mock' ? '모의 교정 · 실제 AI 결과가 아닙니다' : stored?.source === 'server' ? '저장된 서버 교정' : '샘플 교정 · 실제 AI 결과가 아닙니다'}</Text>
      <Text selectable style={ui.body}>{stored?.corrected ?? corrected}</Text>
      <SpeechControls text={stored?.corrected ?? corrected!} language={entry.learningLanguage} label="교정문 전체" sentenceControls />
    </View>}
  </>;
}
