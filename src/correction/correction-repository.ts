import type { DiaryStorage } from '../data/diary-repository';
import type { CorrectionResult } from './correction-service';
import { validateCorrection } from './correction-validation';

export const CORRECTION_STORAGE_KEY = '@lingolog/corrections/v1';
export function resultKey(result: CorrectionResult) {
  return JSON.stringify([result.diaryId, result.originalVersion, result.originalUpdatedAt, result.original, result.learningLanguage, result.explanationLanguage, result.source]);
}
const clone = (records: CorrectionResult[]) => records.map((record) => validateCorrection(record));
export function createCorrectionRepository(storage: DiaryStorage) {
  let records: CorrectionResult[] | null = null;
  let loading: Promise<CorrectionResult[]> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async load(): Promise<CorrectionResult[]> {
      if (records) return clone(records);
      if (loading) return loading;
      loading = (async () => {
        const raw = await storage.getItem(CORRECTION_STORAGE_KEY);
        let next: CorrectionResult[] = [];
        if (raw !== null) {
          const payload = JSON.parse(raw);
          if (payload?.version !== 1 || !Array.isArray(payload.results)) throw new Error('저장된 교정 데이터를 읽을 수 없어요.');
          next = payload.results.map(validateCorrection);
          if (new Set(next.map(resultKey)).size !== next.length) throw new Error('저장된 교정 결과가 중복돼요.');
        }
        records = next;
        return clone(next);
      })();
      try { return await loading; } finally { loading = null; }
    },
    save(value: CorrectionResult): Promise<CorrectionResult[]> {
      if (!records) return Promise.reject(new Error('저장된 교정을 먼저 불러와 주세요.'));
      const result = validateCorrection(value);
      const operation = queue.then(async () => {
        const next = [...records!.filter((record) => resultKey(record) !== resultKey(result)), result];
        await storage.setItem(CORRECTION_STORAGE_KEY, JSON.stringify({ version: 1, results: next }));
        records = next;
        return clone(next);
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}
