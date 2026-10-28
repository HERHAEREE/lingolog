import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createReuseRepository } from '@/reuse/reuse-repository';
import type { ReuseRecord } from '@/reuse/reuse-model';
import { useDiary } from './diary-context';

const Context = createContext<{ records: ReuseRecord[]; isLoading: boolean; error: string | null; retry: () => void } | null>(null);
export function ReuseProvider({ children }: PropsWithChildren) {
  const diary = useDiary();
  const [repository] = useState(() => createReuseRepository(AsyncStorage));
  const [records, setRecords] = useState<ReuseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (diary.isLoading || diary.loadError) return;
    let active = true;
    void repository.reconcile(diary.entries).then((next) => {
      if (active) { setRecords(next); setIsLoading(false); setError(null); }
    }).catch(() => {
      if (active) { setIsLoading(false); setError('표현 포함 확인 기록을 저장하거나 불러오지 못했어요. 일기는 유지됩니다. 다시 확인할 수 있어요.'); }
    });
    return () => { active = false; };
  }, [repository, diary.entries, diary.isLoading, diary.loadError, attempt]);
  return <Context.Provider value={{ records, isLoading, error, retry: () => { setIsLoading(true); setAttempt((value) => value + 1); } }}>{children}</Context.Provider>;
}
export function useReuse() {
  const context = useContext(Context);
  if (!context) throw new Error('ReuseProvider is required');
  return context;
}
