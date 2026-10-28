import type { DiaryStorage } from './diary-repository';
import { learningItemKey, type LearningItem, type LearningItemInput } from './learning-model';
import { isLearningLanguage } from './languages';

export const LEARNING_STORAGE_KEY = '@lingolog/learning-items/v1';
export interface LearningRepository {
  load(): Promise<LearningItem[]>;
  save(input: LearningItemInput): Promise<{ items: LearningItem[]; duplicate: boolean }>;
  remove(id: string): Promise<LearningItem[]>;
}

function validInput(value: unknown): value is LearningItemInput {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return ['word', 'expression', 'grammar'].includes(item.type as string) && isLearningLanguage(item.learningLanguage) &&
    (item.explanationLanguage === undefined || item.explanationLanguage === 'ko') &&
    ['expression', 'meaning', 'originalSentence', 'correctedExample', 'sourceDiaryId', 'sourceCorrectionId']
      .every((field) => typeof item[field] === 'string' && (item[field] as string).trim().length > 0);
}

function decode(raw: string): LearningItem[] {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('version' in value) || (value.version !== 1 && value.version !== 2) ||
      !('items' in value) || !Array.isArray(value.items)) throw new Error('저장된 단어장 형식을 읽을 수 없습니다.');
  const ids = new Set<string>();
  const keys = new Set<string>();
  return value.items.map((item: unknown) => {
    const migrated = item && typeof item === 'object'
      ? { ...item, learningLanguage: 'learningLanguage' in item ? item.learningLanguage : 'en', explanationLanguage: 'explanationLanguage' in item ? item.explanationLanguage : 'ko' }
      : item;
    if (!validInput(migrated) || !('id' in migrated) || typeof migrated.id !== 'string' || !migrated.id ||
        !('createdAt' in migrated) || typeof migrated.createdAt !== 'string' || !Number.isFinite(Date.parse(migrated.createdAt)) ||
        ids.has(migrated.id) || keys.has(learningItemKey(migrated))) throw new Error('저장된 학습 항목이 올바르지 않습니다.');
    ids.add(migrated.id);
    keys.add(learningItemKey(migrated));
    return { ...migrated, id: migrated.id, createdAt: migrated.createdAt, explanationLanguage: 'ko' };
  });
}

export function createLearningRepository(storage: DiaryStorage): LearningRepository {
  let items: LearningItem[] | null = null;
  let loading: Promise<LearningItem[]> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let sequence = 0;
  const snapshot = () => items!.map((item) => ({ ...item }));

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (!items) return Promise.reject(new Error('단어장을 먼저 불러와 주세요.'));
    const next = queue.then(operation);
    queue = next.catch(() => undefined);
    return next;
  }

  async function write(next: LearningItem[]) {
    await storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify({ version: 2, items: next }));
    items = next;
    return snapshot();
  }

  return {
    load() {
      if (items) return Promise.resolve(snapshot());
      if (loading) return loading;
      loading = (async () => {
        try {
          const raw = await storage.getItem(LEARNING_STORAGE_KEY);
          items = raw === null ? [] : decode(raw);
          return snapshot();
        } finally { loading = null; }
      })();
      return loading;
    },
    save(input) {
      // Capture a copy so queued operations don't retain mutable caller data.
      const captured = { ...input, explanationLanguage: input.explanationLanguage ?? 'ko' };
      return enqueue(async () => {
        if (!validInput(captured)) throw new Error('저장할 학습 항목이 올바르지 않습니다.');
        const current = snapshot();
        if (current.some((item) => learningItemKey(item) === learningItemKey(captured))) {
          return { items: current, duplicate: true };
        }
        let id: string;
        do { id = `learning-${Date.now()}-${++sequence}`; } while (current.some((item) => item.id === id));
        const next: LearningItem[] = [{ ...captured, explanationLanguage: 'ko', id, createdAt: new Date().toISOString() }, ...current];
        return { items: await write(next), duplicate: false };
      });
    },
    remove(id) {
      return enqueue(async () => {
        const current = snapshot();
        if (!current.some((item) => item.id === id)) throw new Error('학습 항목을 찾을 수 없습니다.');
        return write(current.filter((item) => item.id !== id));
      });
    },
  };
}
