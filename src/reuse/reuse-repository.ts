import type { DiaryEntry } from '../data/diary-model';
import type { DiaryStorage } from '../data/diary-repository';
import { isLearningLanguage } from '../data/languages';
import { decodeTargets, includesExpression, reuseKey, type ReuseRecord } from './reuse-model';

export const REUSE_KEY = '@lingolog/expression-reuse/v1';
function decode(raw: string): ReuseRecord[] {
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1 || !Array.isArray(parsed.records)) throw new Error('재사용 기록 형식을 읽을 수 없습니다.');
  const keys = new Set<string>();
  return parsed.records.map((record: ReuseRecord) => {
    if (!record || typeof record.itemId !== 'string' || !record.itemId || typeof record.diaryId !== 'string' || !record.diaryId ||
      !isLearningLanguage(record.learningLanguage) || typeof record.expression !== 'string' || !record.expression.trim() ||
      typeof record.checkedAt !== 'string' || !Number.isFinite(Date.parse(record.checkedAt)) ||
      typeof record.diaryUpdatedAt !== 'string' || !Number.isFinite(Date.parse(record.diaryUpdatedAt)) ||
      !Number.isSafeInteger(record.diaryRevision) || record.diaryRevision < 0 || typeof record.included !== 'boolean' || typeof record.diaryDeleted !== 'boolean' ||
      keys.has(reuseKey(record, record.diaryId))) throw new Error('재사용 기록이 올바르지 않습니다.');
    keys.add(reuseKey(record, record.diaryId)); return { ...record };
  });
}
export function createReuseRepository(storage: DiaryStorage, clock = () => new Date()) {
  let records: ReuseRecord[] | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    reconcile(entries: DiaryEntry[]) {
      const operation = queue.then(async () => {
        if (!records) { const raw = await storage.getItem(REUSE_KEY); records = raw === null ? [] : decode(raw); }
        const next = new Map(records.map((record) => [reuseKey(record, record.diaryId), { ...record }]));
        const diaries = new Map(entries.map((entry) => [entry.id, entry]));
        for (const entry of entries) {
          const targets = decodeTargets(entry.reuseTargets ?? [], entry.learningLanguage);
          for (const target of targets) {
            const key = reuseKey(target, entry.id), previous = next.get(key);
            if (previous && !previous.diaryDeleted && previous.diaryRevision === (entry.revision ?? 0) && previous.diaryUpdatedAt === entry.updatedAt && previous.expression === target.expression) continue;
            next.set(key, { ...target, diaryId: entry.id, checkedAt: clock().toISOString(), diaryRevision: entry.revision ?? 0,
              diaryUpdatedAt: entry.updatedAt, included: includesExpression(entry.content, target.expression, entry.learningLanguage), diaryDeleted: false });
          }
        }
        // Retain historical identity, but never count/link a deleted diary as current use.
        for (const [key, record] of next) {
          const entry = diaries.get(record.diaryId);
          if (!entry && !record.diaryDeleted) next.set(key, { ...record, included: false, diaryDeleted: true, checkedAt: clock().toISOString() });
          else if (entry && !entry.reuseTargets?.some((target) => target.itemId === record.itemId && target.learningLanguage === record.learningLanguage) &&
            (record.included || record.diaryRevision !== (entry.revision ?? 0) || record.diaryUpdatedAt !== entry.updatedAt)) {
            next.set(key, { ...record, included: false, diaryDeleted: false, diaryRevision: entry.revision ?? 0, diaryUpdatedAt: entry.updatedAt, checkedAt: clock().toISOString() });
          }
        }
        const value = [...next.values()];
        if (JSON.stringify(value) !== JSON.stringify(records)) {
          await storage.setItem(REUSE_KEY, JSON.stringify({ version: 1, records: value })); records = value;
        }
        return records.map((record) => ({ ...record }));
      });
      queue = operation.catch(() => undefined); return operation;
    },
  };
}
