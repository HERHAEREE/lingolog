import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { learningTypeLabels, type CorrectionChange, type CorrectionResult, type CorrectionLearningItem } from '@/correction/correction-service';
import { learningItemKey, type LearningItemInput } from '@/data/learning-model';
import { useLearning } from '@/state/learning-context';
import { ui } from './lingolog-ui';

function SaveCorrectionItem({ item, result }: { item: CorrectionLearningItem; result: CorrectionResult }) {
  const { items, isLoading, isSaving, loadError, saveItem } = useLearning();
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const input: LearningItemInput = {
    type: item.type, expression: item.expression, meaning: item.meaning,
    originalSentence: item.originalSentence, correctedExample: item.correctedExample,
    learningLanguage: result.learningLanguage, explanationLanguage: result.explanationLanguage, sourceDiaryId: result.diaryId, sourceCorrectionId: item.id,
  };
  const saved = items.some((item) => learningItemKey(item) === learningItemKey(input));
  const disabled = saved || isLoading || isSaving || !!loadError;

  async function save() {
    if (disabled || pending.current) return;
    pending.current = true;
    setError(null);
    try { await saveItem(input); }
    catch { setError('단어장에 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { pending.current = false; }
  }

  return <>
    {error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      style={[ui.button, { opacity: disabled ? 0.5 : 1 }]} onPress={() => { void save(); }}>
      <Text style={ui.buttonText}>{saved ? '단어장에 저장됨' : isSaving ? '저장 중…' : '단어장에 저장'}</Text>
    </Pressable>
  </>;
}
export function CorrectionChangeCard({ change, result }: { change: CorrectionChange; result: CorrectionResult }) {
  const item = result.learningItems.find((candidate) => candidate.id === change.id);
  return (
    <View style={ui.card}>
      <View style={ui.row}>
        <Text style={ui.badge}>{learningTypeLabels[change.learningType]}</Text>
        <Text style={ui.muted}>{change.kind === 'grammar' ? '문법 오류 수정' : '자연스러운 표현 제안'}</Text>
      </View>
      <Text style={ui.sectionTitle}>{change.expression}</Text>
      <Text style={ui.body}>{change.meaning}</Text>
      <Text style={ui.eyebrow}>원래 문장</Text>
      <Text selectable style={ui.body}>{change.originalSentence}</Text>
      <Text style={ui.eyebrow}>교정된 예문 · 대안 표현</Text>
      <Text selectable style={ui.body}>{change.correctedSentence}</Text>
      <Text style={ui.eyebrow}>변경 이유</Text>
      <Text style={ui.body}>{change.explanation}</Text>
      {item && <SaveCorrectionItem item={item} result={result} />}
    </View>
  );
}

export function CorrectionLearningCard({ item, result }: { item: CorrectionLearningItem; result: CorrectionResult }) {
  return <View style={ui.card}>
    <Text style={ui.badge}>{learningTypeLabels[item.type]} · 학습 항목</Text>
    <Text style={ui.sectionTitle}>{item.expression}</Text><Text style={ui.body}>{item.meaning}</Text>
    <Text style={ui.eyebrow}>원래 문장</Text><Text selectable style={ui.body}>{item.originalSentence}</Text>
    <Text style={ui.eyebrow}>교정된 예문</Text><Text selectable style={ui.body}>{item.correctedExample}</Text>
    <SaveCorrectionItem item={item} result={result} />
  </View>;
}
