import type { DiaryEntry } from '../data/diary-model';
import type { CorrectionMode, CorrectionResult, CorrectionService } from './correction-service';
import type { createCorrectionRepository } from './correction-repository';
import { matchesOriginal, validateForRequest } from './correction-validation';

export type RequestState = { status: 'waiting' | 'requesting' | 'completed' | 'failed'; message?: string; originalVersion?: number; original?: string };
export type CorrectionState = { results: CorrectionResult[]; requests: Record<string, RequestState>; isLoading: boolean; loadError: string | null };
export const requestKey = (diaryId: string, mode: CorrectionMode) => JSON.stringify([diaryId, mode]);
export function selectCorrection(results: CorrectionResult[], entry: DiaryEntry, mode: CorrectionMode) {
  const candidates = results.filter((result) => result.diaryId === entry.id && result.source === mode && result.learningLanguage === entry.learningLanguage && result.explanationLanguage === 'ko');
  return [...candidates].reverse().find((result) => matchesOriginal(result, entry)) ?? candidates.at(-1) ?? null;
}
export function createCorrectionController(repository: ReturnType<typeof createCorrectionRepository>, services: Record<CorrectionMode, CorrectionService>) {
  let state: CorrectionState = { results: [], requests: {}, isLoading: true, loadError: null };
  const listeners = new Set<() => void>();
  const active = new Map<string, Promise<void>>();
  const emit = (patch: Partial<CorrectionState>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  function setRequest(key: string, value: RequestState) { emit({ requests: { ...state.requests, [key]: value } }); }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      emit({ isLoading: true, loadError: null });
      try { emit({ results: await repository.load(), isLoading: false }); }
      catch { emit({ isLoading: false, loadError: '저장된 교정 결과를 불러오지 못했어요. 기존 데이터를 유지합니다. 다시 불러와 주세요.' }); }
    },
    request(entry: DiaryEntry, mode: CorrectionMode, force = false): Promise<void> {
      // One in-flight request per diary, even if mode/screen changes during the request.
      const pending = active.get(entry.id);
      if (pending) return pending;
      if (state.isLoading || state.loadError) return Promise.resolve();
      const key = requestKey(entry.id, mode);
      const cached = selectCorrection(state.results, entry, mode);
      if (!force && cached && matchesOriginal(cached, entry)) {
        setRequest(key, { status: 'completed', originalVersion: entry.revision ?? 0, original: entry.content });
        return Promise.resolve();
      }
      const snapshot = { ...entry }; // Bind this operation to exactly the submitted version, never a later edit.
      setRequest(key, { status: 'requesting', originalVersion: snapshot.revision ?? 0, original: snapshot.content });
      const operation = Promise.resolve().then(async () => {
        let saving = false;
        try {
          const outcome = await services[mode].correct(snapshot, 'ko');
          if (outcome.status === 'unsupported') {
            setRequest(key, { status: 'failed', message: outcome.message, originalVersion: snapshot.revision ?? 0, original: snapshot.content });
            return;
          }
          const result = validateForRequest(outcome.result, snapshot, mode);
          saving = true;
          emit({ results: await repository.save(result) });
          setRequest(key, { status: 'completed', originalVersion: snapshot.revision ?? 0, original: snapshot.content });
        } catch (error) {
          setRequest(key, { status: 'failed', message: saving ? '교정 결과를 기기에 저장하지 못했어요. 일기와 기존 결과는 유지됩니다. 다시 시도해 주세요.' :
            error instanceof Error ? error.message : '교정을 완료하지 못했어요. 다시 시도해 주세요.', originalVersion: snapshot.revision ?? 0, original: snapshot.content });
        }
      }).finally(() => { active.delete(entry.id); });
      active.set(entry.id, operation);
      return operation;
    },
  };
}
