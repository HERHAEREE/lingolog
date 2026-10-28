import type { DiaryEntry } from '../data/diary-model';
import type { DiaryStorage } from '../data/diary-repository';
import { decodeDays, growthFor, historicalDays, uniqueDays, type GrowthData, type WritingDay } from './growth-model';

export const GROWTH_KEY = '@lingolog/growth/v1';
export function createGrowthRepository(storage: DiaryStorage) {
  let data: GrowthData | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const snapshot = () => ({ migrated: data!.migrated, days: data!.days.map((day) => ({ ...day })) });
  return {
    reconcile(entries: DiaryEntry[], journal: WritingDay[]) {
      const operation = queue.then(async () => {
        if (!data) {
          const raw = await storage.getItem(GROWTH_KEY);
          if (raw === null) data = { migrated: false, days: [] };
          else {
            const parsed = JSON.parse(raw);
            if (parsed?.version !== 1 || typeof parsed.migrated !== 'boolean') throw new Error('보상 저장 형식을 읽을 수 없습니다.');
            data = { migrated: parsed.migrated, days: decodeDays(parsed.days) };
          }
        }
        const migration = !data.migrated;
        // Legacy timestamps are interpreted once. Time-zone changes after migration
        // must not reinterpret old diary dates as newly earned days.
        const candidates = decodeDays(journal).filter((day) => migration || day.source !== 'legacy');
        const days = uniqueDays([...data.days, ...candidates, ...(migration ? historicalDays(entries) : [])]);
        const advanced = (['en', 'ja'] as const).filter((language) => !migration &&
          growthFor(days, language).index > growthFor(data!.days, language).index);
        if (migration || JSON.stringify(days) !== JSON.stringify(data.days)) {
          const next = { migrated: true, days };
          await storage.setItem(GROWTH_KEY, JSON.stringify({ version: 1, ...next }));
          data = next;
        }
        return { data: snapshot(), advanced, migration };
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}
