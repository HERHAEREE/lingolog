import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { DiaryEntry } from '@/data/diary-model';
import type { LearningItem } from '@/data/learning-model';
import { useReuse } from '@/state/reuse-context';
import { useDiary } from '@/state/diary-context';
import { currentReuseRecords } from '@/reuse/reuse-model';
import { dateLabel, diaryDate } from '@/dates/local-date';
import { ui } from './lingolog-ui';

function ReuseStatus() {
  const reuse = useReuse();
  if (reuse.isLoading) return <Text style={ui.muted}>표현 포함 확인 기록을 불러오는 중이에요.</Text>;
  if (!reuse.error) return null;
  return <><Text accessibilityRole="alert" style={ui.error}>{reuse.error}</Text>
    <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={reuse.retry}><Text style={ui.link}>표현 포함 다시 확인</Text></Pressable>
  </>;
}
export function ReuseDiaryResult({ entry }: { entry: DiaryEntry }) {
  const reuse = useReuse();
  const { reuseSaved } = useLocalSearchParams<{ reuseSaved?: string }>();
  const targets = entry.reuseTargets ?? [];
  if (!targets.length) return null;
  const checked = reuse.records.filter((record) => record.diaryId === entry.id && !record.diaryDeleted &&
    record.diaryRevision === (entry.revision ?? 0) && record.diaryUpdatedAt === entry.updatedAt);
  const settled = targets.every((target) => checked.some((record) => record.itemId === target.itemId));
  const included = checked.filter((record) => record.included);
  return <View style={ui.card}>
    <Text style={ui.sectionTitle}>표현 포함 확인</Text><ReuseStatus />
    {!reuse.isLoading && !reuse.error && (settled ? <>
      {reuseSaved === '1' && entry.revision === 1 && <Text accessibilityRole="alert" style={ui.body}>{included.length ? `오늘 표현 ${included.length}개를 다시 써봤어요.` : '일기를 남겼어요. 표현은 다음 글에서 또 만나봐요.'}</Text>}
      {targets.map((target) => <Text key={target.itemId} style={ui.body}>{target.expression} · {included.some((record) => record.itemId === target.itemId) ? '원문에 포함' : '원문에서 확인하지 못했어요'}</Text>)}
    </> : <Text style={ui.muted}>현재 일기의 표현 포함을 확인하고 있어요.</Text>)}
    <Text style={ui.muted}>로컬 문자열 포함 확인이에요. 활용형·동의어를 정확하게 찾거나 문법적 사용·숙달 여부를 평가하지 않아요.</Text>
  </View>;
}
export function ReuseItemLinks({ item }: { item: LearningItem }) {
  const reuse = useReuse();
  const diary = useDiary();
  const current = currentReuseRecords(reuse.records, diary.entries, item.id, item.learningLanguage);
  const pending = diary.entries.some((entry) => entry.reuseTargets?.some((target) => target.itemId === item.id && target.learningLanguage === item.learningLanguage) &&
    !reuse.records.some((record) => record.diaryId === entry.id && record.itemId === item.id && record.diaryRevision === (entry.revision ?? 0) && record.diaryUpdatedAt === entry.updatedAt && !record.diaryDeleted));
  return <View style={ui.card}>
    <Text style={ui.sectionTitle}>이 표현을 다시 쓴 일기</Text><ReuseStatus />
    {!diary.isLoading && !diary.loadError && !reuse.isLoading && !reuse.error && <>
      <Text style={ui.muted}>{pending ? '수정한 일기의 포함 확인을 업데이트하고 있어요.' : `표현 포함 확인 · 현재 일기 ${current.length}편`}</Text>
      {current.map((record) => {
        const entry = diary.entries.find((candidate) => candidate.id === record.diaryId);
        if (!entry) return null;
        return <Link key={record.diaryId} href={{ pathname: '/diary/[id]', params: { id: record.diaryId } }} style={ui.link}>{dateLabel(diaryDate(entry))} · 일기 보기 →</Link>;
      })}
      {!pending && current.length === 0 && <Text style={ui.muted}>선택 미션으로 제안된 표현이 원문에 포함되면 여기에 연결돼요. 삭제한 일기는 제외해요.</Text>}
    </>}
    <Text style={ui.muted}>문법적 사용이나 숙달 정도를 나타내는 통계가 아니에요.</Text>
  </View>;
}
