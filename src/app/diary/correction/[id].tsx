import { useEffect, useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Screen, ui } from '@/components/lingolog-ui';
import { SpeechControls } from '@/components/speech-controls';
import { DiaryStorageStatus } from '@/components/diary-storage-status';
import { LearningStorageStatus } from '@/components/learning-storage-status';
import { CorrectionChangeCard, CorrectionLearningCard } from '@/components/correction-change-card';
import { useCorrection } from '@/state/correction-context';
import { requestKey, selectCorrection } from '@/correction/correction-controller';
import { matchesOriginal } from '@/correction/correction-validation';
import { supportsSampleCorrection } from '@/correction/sample-correction-service';
import type { CorrectionMode } from '@/correction/correction-service';
import { useDiary, type DiaryEntry } from '@/state/diary-context';
import { useAnonymousAuth } from '@/state/auth-context';
import { serverCorrectionEnabled, serverGenerationMode } from '@/auth/supabase-client';

export default function CorrectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entries, isLoading, loadError } = useDiary();
  const entry = entries.find((item) => item.id === id);
  if (isLoading || loadError) return <Screen><DiaryStorageStatus /></Screen>;
  if (!entry) return <Screen><Text style={ui.title}>일기를 찾을 수 없어요</Text><Link href="/diary" style={ui.link}>일기 달력 보기 →</Link></Screen>;
  return <CorrectionView key={entry.id} entry={entry} />;
}
const statusLabels = { waiting: '대기', requesting: '요청 중', completed: '완료', failed: '실패' };
function CorrectionView({ entry }: { entry: DiaryEntry }) {
  const correction = useCorrection();
  const auth = useAnonymousAuth();
  const [mode, setMode] = useState<CorrectionMode>('sample');
  const request = correction.requests[requestKey(entry.id, mode)];
  const result = selectCorrection(correction.results, entry, mode);
  const stale = !!result && !matchesOriginal(result, entry);
  const busy = (['sample', 'server'] as const).some((value) => correction.requests[requestKey(entry.id, value)]?.status === 'requesting');
  const currentRequest = request?.originalVersion === (entry.revision ?? 0) && request.original === entry.content;
  const status = busy ? 'requesting' : currentRequest ? request!.status : result && !stale ? 'completed' : 'waiting';
  // Preserve automatic sample preview, but never automatically initiate a server request.
  useEffect(() => {
    if (mode === 'sample' && !correction.isLoading && !correction.loadError && !result && !request && supportsSampleCorrection(entry)) {
      void correction.controller.request(entry, 'sample');
    }
  }, [mode, correction.isLoading, correction.loadError, correction.controller, entry, result, request]);
  const disabled = busy || correction.isLoading || !!correction.loadError;
  const grammar = result?.changes.filter((change) => change.kind === 'grammar') ?? [];
  const natural = result?.changes.filter((change) => change.kind === 'natural') ?? [];
  return <Screen>
    <Text style={ui.title}>일기 교정</Text>
    <View style={ui.row}>{(['sample', 'server'] as const).map((value) => <Pressable key={value} accessibilityRole="button"
      accessibilityState={{ selected: mode === value, disabled: busy }} disabled={busy} style={ui.secondaryButton} onPress={() => setMode(value)}>
      <Text style={ui.link}>{mode === value ? '✓ ' : ''}{value === 'sample' ? '샘플 모드' : serverGenerationMode === 'model' ? '서버 모드 · AI 교정' : '서버 모드 · 연결 테스트'}</Text>
    </Pressable>)}</View>
    <Text style={ui.badge}>{mode === 'sample' ? '샘플 교정 · 실제 AI 결과가 아닙니다' : !serverCorrectionEnabled ? '서버 교정 · 비활성' : serverGenerationMode === 'model' ? '실제 AI 교정 · 테스트 허용 사용자 전용' : '서버 모의 교정 · 실제 AI가 아닙니다'}</Text>
    <Text accessibilityLiveRegion="polite" style={ui.sectionTitle}>교정 상태 · {statusLabels[status]}</Text>
    {busy && <><ActivityIndicator color="#326B55" /><Text style={ui.muted}>요청한 원문 버전의 결과를 기다리고 있어요.</Text></>}
    {correction.isLoading && <Text style={ui.muted}>저장된 교정을 불러오는 중이에요.</Text>}
    {correction.loadError && <><Text accessibilityRole="alert" style={ui.error}>{correction.loadError}</Text>
      <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => { void correction.controller.load(); }}><Text style={ui.link}>교정 결과 다시 불러오기</Text></Pressable></>}
    {request?.status === 'failed' && <Text accessibilityRole="alert" style={ui.error}>{request.message}</Text>}
    {mode === 'server' && <>
      <Text style={ui.muted}>{!serverCorrectionEnabled ? '서버 요청은 비활성 상태예요. 일기와 학습 데이터를 자동 전송하지 않습니다.' : serverGenerationMode === 'model' ? '교정 요청을 누른 원문만 서버를 거쳐 OpenAI로 전송합니다. AI 제안은 틀릴 수 있으니 확인해 주세요.' : '교정 요청을 누른 글만 테스트 서버로 전송해요. 정해진 테스트 문장만 모의 교정을 지원합니다.'}</Text>
      <Text style={ui.muted}>익명 인증 · {auth.status === 'ready' ? '연결됨' : auth.status === 'connecting' ? '연결 중' : auth.status === 'unconfigured' ? '설정 필요' : '연결 실패'}</Text>
      {auth.userId && <Text selectable style={ui.muted}>테스트 허용 설정용 사용자 ID: {auth.userId}</Text>}
      {auth.error && <Text accessibilityRole="alert" style={ui.error}>{auth.error}</Text>}
      {auth.status === 'failed' && <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={auth.retry}><Text style={ui.link}>익명 인증 다시 확인</Text></Pressable>}
    </>}
    {mode === 'sample' && !supportsSampleCorrection(entry) && <Text style={ui.muted}>{entry.learningLanguage === 'ja' ? '일본어 샘플 교정은 아직 지원하지 않아요. 저장과 일본어 듣기는 이용할 수 있어요.' : '원문이 그대로인 교정용 샘플 일기에서만 예시를 제공합니다. 사용자 일기에 임의의 교정 결과를 붙이지 않아요.'}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} style={[ui.button, { opacity: disabled ? 0.45 : 1 }]}
      onPress={() => { void correction.controller.request(entry, mode, true); }}>
      <Text style={ui.buttonText}>{busy ? '요청 중…' : status === 'failed' ? '다시 시도' : result && !stale ? '다시 교정하기' : '교정 요청'}</Text>
    </Pressable>
    <Text style={ui.muted}>원문은 그대로 보존합니다. 문법 오류만 필요한 만큼 고치고, 올바른 문장의 표현 개선은 선택 제안으로 구분합니다.</Text>
    {result && <>
      {result.generationMode === 'mock' && <Text style={ui.badge}>모의 교정 결과 · 서버 인증 테스트용 · 실제 AI가 아닙니다</Text>}
      {result.generationMode === 'model' && <Text style={ui.badge}>AI 교정 결과 · 설명 언어 한국어</Text>}
      {stale && <Text accessibilityRole="alert" style={ui.badge}>수정 전 교정 · 현재 원문과 다른 버전이에요</Text>}
      <Text style={ui.muted}>원문 버전 {result.originalVersion} · {new Date(result.correctedAt).toLocaleString('ko-KR')} · 설명 언어 한국어</Text>
      <View style={ui.card}><Text style={ui.sectionTitle}>{stale ? '교정 당시 원문' : '원문'}</Text><Text selectable style={ui.body}>{result.original}</Text>
        <SpeechControls text={result.original} language={result.learningLanguage} label="원문 전체" sentenceControls /></View>
      <View style={[ui.card, ui.prompt]}><Text style={ui.sectionTitle}>교정문 · 선택 대안 포함</Text><Text selectable style={ui.body}>{result.corrected}</Text>
        <SpeechControls text={result.corrected} language={result.learningLanguage} label="교정문 전체" sentenceControls /></View>
      <LearningStorageStatus />
      <Text style={ui.sectionTitle}>문법 오류 수정 · {grammar.length}</Text>
      {grammar.length === 0 && <Text style={ui.body}>수정할 문법 오류가 없어요. 선택적인 표현 제안은 아래에서 따로 확인하세요.</Text>}
      {grammar.map((change) => <CorrectionChangeCard key={`${result.correctedAt}:${change.id}`} change={change} result={result} />)}
      <Text style={ui.sectionTitle}>자연스러운 표현 제안 · {natural.length}</Text>
      {natural.map((change) => <CorrectionChangeCard key={`${result.correctedAt}:${change.id}`} change={change} result={result} />)}
      {result.learningItems.filter((item) => !result.changes.some((change) => change.id === item.id)).map((item) =>
        <CorrectionLearningCard key={`${result.correctedAt}:${item.id}`} item={item} result={result} />)}
      <Link href="/vocabulary" style={ui.link}>저장한 단어장 보기 →</Link>
    </>}
    <Link href={{ pathname: '/diary/[id]', params: { id: entry.id } }} style={ui.link}>일기 상세로 돌아가기 →</Link>
  </Screen>;
}
