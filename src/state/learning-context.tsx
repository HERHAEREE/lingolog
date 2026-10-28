import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createLocalLearningRepository } from '@/data/local-learning-repository';
import type { LearningItem, LearningItemInput } from '@/data/learning-model';

type LearningState = {
  items: LearningItem[];
  isLoading: boolean;
  isSaving: boolean;
  loadError: string | null;
  retryLoad: () => Promise<void>;
  saveItem: (input: LearningItemInput) => Promise<boolean>;
  deleteItem: (id: string) => Promise<void>;
};
const LearningContext = createContext<LearningState | null>(null);
const LOAD_ERROR = '단어장을 불러오지 못했어요. 기존 데이터는 유지됩니다. 다시 시도해 주세요.';

export function LearningProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(createLocalLearningRepository);
  const [items, setItems] = useState<LearningItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    repository.load().then((loaded) => {
      if (active) { setItems(loaded); setIsLoading(false); }
    }).catch(() => {
      if (active) { setLoadError(LOAD_ERROR); setIsLoading(false); }
    });
    return () => { active = false; };
  }, [repository]);

  async function retryLoad() {
    setIsLoading(true);
    setLoadError(null);
    try { setItems(await repository.load()); }
    catch { setLoadError(LOAD_ERROR); }
    finally { setIsLoading(false); }
  }

  async function commit<T>(operation: () => Promise<T>) {
    if (isLoading || loadError) throw new Error('단어장을 먼저 불러와 주세요.');
    if (busy.current) throw new Error('저장 중입니다. 잠시 기다려 주세요.');
    busy.current = true;
    setIsSaving(true);
    try { return await operation(); }
    finally { busy.current = false; setIsSaving(false); }
  }

  async function saveItem(input: LearningItemInput) {
    return commit(async () => {
      const result = await repository.save(input);
      setItems(result.items);
      return result.duplicate;
    });
  }

  async function deleteItem(id: string) {
    await commit(async () => { setItems(await repository.remove(id)); });
  }

  return <LearningContext.Provider value={{ items, isLoading, isSaving, loadError, retryLoad, saveItem, deleteItem }}>{children}</LearningContext.Provider>;
}

export function useLearning() {
  const state = useContext(LearningContext);
  if (!state) throw new Error('LearningProvider가 필요합니다.');
  return state;
}
