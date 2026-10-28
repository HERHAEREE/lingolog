import { sampleEntries, type DiaryEntry } from './diary-model';
import { isLearningLanguage, type LearningLanguage } from './languages';
import { decodeDays, historicalDays, isSample, uniqueDays, type WritingDay } from '../growth/growth-model';
import { canWriteOn, isDateKey, localDate } from '../dates/local-date';
import { decodeTargets, type ReuseTarget } from '../reuse/reuse-model';

export const DIARY_STORAGE_KEY = '@lingolog/diaries/v1';

export interface DiaryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

// Screens depend on this contract; a future sync repository can implement it.
export interface DiaryRepository {
  load(): Promise<DiaryEntry[]>;
  create(content: string, learningLanguage?: LearningLanguage, diaryDate?: string, reuseTargets?: ReuseTarget[]): Promise<DiaryEntry[]>;
  update(id: string, content: string): Promise<DiaryEntry[]>;
  remove(id: string): Promise<DiaryEntry[]>;
  addSamples(): Promise<DiaryEntry[]>;
  writingDays(): WritingDay[];
}

function decode(raw: string): DiaryEntry[] {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('version' in data) || (data.version !== 1 && data.version !== 2) ||
      !('entries' in data) || !Array.isArray(data.entries)) {
    throw new Error('저장된 일기 형식을 읽을 수 없습니다.');
  }
  const ids = new Set<string>();
  return data.entries.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' ||
        !('id' in entry) || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) ||
        !('learningLanguage' in entry) || !isLearningLanguage(entry.learningLanguage) ||
        !('content' in entry) || typeof entry.content !== 'string' || !entry.content.trim() ||
        !('createdAt' in entry) || typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt)) ||
        !('updatedAt' in entry) || typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt)) ||
        ('sample' in entry && typeof entry.sample !== 'boolean') ||
        ('diaryDate' in entry && !isDateKey(entry.diaryDate)) ||
        ('revision' in entry && (typeof entry.revision !== 'number' || !Number.isSafeInteger(entry.revision) || entry.revision < 0)) ||
        (data.version === 2 && !('diaryDate' in entry)) ||
        ('sampleTemplateId' in entry && typeof entry.sampleTemplateId !== 'string')) {
      throw new Error('저장된 일기 데이터가 올바르지 않습니다.');
    }
    ids.add(entry.id);
    return {
      id: entry.id, learningLanguage: entry.learningLanguage, content: entry.content,
      createdAt: entry.createdAt, updatedAt: entry.updatedAt,
      diaryDate: 'diaryDate' in entry ? entry.diaryDate as string : localDate(new Date(entry.createdAt)),
      ...('revision' in entry ? { revision: entry.revision as number } : {}),
      ...('reuseTargets' in entry ? { reuseTargets: decodeTargets(entry.reuseTargets, entry.learningLanguage) } : {}),
      ...('sample' in entry ? { sample: entry.sample as boolean } : {}),
      ...('sampleTemplateId' in entry ? { sampleTemplateId: entry.sampleTemplateId as string } : {}),
    };
  });
}

export function createDiaryRepository(storage: DiaryStorage): DiaryRepository {
  let entries: DiaryEntry[] | null = null;
  let writingDays: WritingDay[] = [];
  let loading: Promise<DiaryEntry[]> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let sequence = 0;
  const snapshot = () => entries!.map((entry) => ({ ...entry, ...(entry.reuseTargets ? { reuseTargets: entry.reuseTargets.map((target) => ({ ...target })) } : {}) }));

  function mutate(transform: (current: DiaryEntry[]) => DiaryEntry[]) {
    // No write is possible until a successful load. Failed loads keep data intact.
    if (!entries) return Promise.reject(new Error('일기를 먼저 불러와 주세요.'));
    const operation = queue.then(async () => {
      const next = transform(snapshot());
      const existingIds = new Set(entries!.map((entry) => entry.id));
      const nextDays = uniqueDays([...writingDays, ...next.filter((entry) => !existingIds.has(entry.id) && !isSample(entry)).map((entry) => ({
        learningLanguage: entry.learningLanguage, date: localDate(new Date(entry.createdAt)),
      }))]);
      // Durable delivery journal: committed atomically with the diary, retained on deletion.
      await storage.setItem(DIARY_STORAGE_KEY, JSON.stringify({ version: 2, entries: next, writingDays: nextDays }));
      entries = next;
      writingDays = nextDays;
      return snapshot();
    });
    // Serialize writes without allowing one rejection to poison future retries.
    queue = operation.catch(() => undefined);
    return operation;
  }

  function text(content: string) {
    if (!content.trim()) throw new Error('일기 내용을 입력해 주세요.');
    return content.trim();
  }

  return {
    writingDays() {
      if (!entries) throw new Error('일기를 먼저 불러와 주세요.');
      return writingDays.map((day) => ({ ...day }));
    },
    load() {
      if (entries) return Promise.resolve(snapshot());
      if (loading) return loading;
      loading = (async () => {
        try {
          const raw = await storage.getItem(DIARY_STORAGE_KEY);
          const loaded = raw === null ? sampleEntries.map((entry) => ({ ...entry, diaryDate: localDate(new Date(entry.createdAt)) })) : decode(raw);
          const savedJournal: unknown = raw === null ? undefined : JSON.parse(raw).writingDays;
          const loadedDays = savedJournal === undefined ? historicalDays(loaded) : decodeDays(savedJournal);
          // Fix legacy calendar dates exactly once before exposing migrated data.
          // Failed migration keeps the original bytes and prevents subsequent writes.
          if (raw !== null && JSON.parse(raw).version === 1) {
            await storage.setItem(DIARY_STORAGE_KEY, JSON.stringify({ version: 2, entries: loaded, writingDays: loadedDays }));
          }
          entries = loaded;
          writingDays = loadedDays;
          return snapshot();
        } finally {
          loading = null;
        }
      })();
      return loading;
    },
    create(content, learningLanguage = 'en', selectedDate, reuseTargets = []) {
      return mutate((current) => {
        const now = new Date().toISOString();
        const today = localDate(new Date(now));
        const day = selectedDate ?? today;
        if (!canWriteOn(day, today)) throw new Error('오늘 또는 과거의 올바른 일기 날짜를 선택해 주세요.');
        let id: string;
        do { id = `entry-${Date.now()}-${++sequence}`; } while (current.some((entry) => entry.id === id));
        if (!isLearningLanguage(learningLanguage)) throw new Error('지원하지 않는 학습 언어입니다.');
        return [{ id, learningLanguage, content: text(content), createdAt: now, updatedAt: now, diaryDate: day, revision: 1,
          ...(reuseTargets.length ? { reuseTargets: decodeTargets(reuseTargets, learningLanguage) } : {}) }, ...current];
      });
    },
    update(id, content) {
      return mutate((current) => {
        if (!current.some((entry) => entry.id === id)) throw new Error('일기를 찾을 수 없습니다.');
        return current.map((entry) => entry.id === id
          ? { ...entry, content: text(content), updatedAt: new Date().toISOString(), revision: (entry.revision ?? 0) + 1, sample: false,
            ...(entry.sample ? { sampleTemplateId: entry.sampleTemplateId ?? entry.id } : {}) }
          : entry);
      });
    },
    remove(id) {
      return mutate((current) => {
        if (!current.some((entry) => entry.id === id)) throw new Error('일기를 찾을 수 없습니다.');
        return current.filter((entry) => entry.id !== id);
      });
    },
    addSamples() {
      return mutate((current) => {
        const added: DiaryEntry[] = [];
        for (const sample of sampleEntries) {
          const exists = current.some((entry) => entry.sample === true &&
            (entry.sampleTemplateId ?? entry.id) === sample.id &&
            entry.learningLanguage === sample.learningLanguage && entry.content === sample.content);
          if (exists) continue;
          let id = sample.id;
          while ([...current, ...added].some((entry) => entry.id === id)) {
            id = `${sample.id}-copy-${Date.now()}-${++sequence}`;
          }
          const now = new Date().toISOString();
          added.push({ ...sample, id, sampleTemplateId: sample.id, createdAt: now, updatedAt: now, diaryDate: localDate(new Date(now)) });
        }
        return [...added, ...current];
      });
    },
  };
}
