import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { createReviewRepository } from '@/review/review-repository';
import { localDate, type ReviewData, type ReviewState, type SelfRating } from '@/review/review-model';
import type { LearningItem } from '@/data/learning-model';
import { useLearning } from './learning-context';

type ReviewContextValue = {
  data: ReviewData; today: string; isLoading: boolean; isSaving: boolean; error: string | null;
  retryLoad: () => Promise<void>;
  record: (item: LearningItem, rating: SelfRating, sessionId: string, attemptId: string) => Promise<ReviewState>;
};
const Context = createContext<ReviewContextValue | null>(null);
const LOAD_ERROR = '복습 기록을 불러오지 못했어요. 기존 기록을 유지합니다. 다시 시도해 주세요.';

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(() => createReviewRepository(AsyncStorage));
  const [data, setData] = useState<ReviewData>({ states: [], history: [] });
  const [today, setToday] = useState(() => localDate());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const learning = useLearning();
  useEffect(() => {
    let active = true;
    repository.load().then((value) => { if (active) { setData(value); setIsLoading(false); } })
      .catch(() => { if (active) { setError(LOAD_ERROR); setIsLoading(false); } });
    return () => { active = false; };
  }, [repository]);
  useEffect(() => {
    const refresh = () => setToday(localDate());
    const timer = setInterval(refresh, 60000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  async function retryLoad() {
    setIsLoading(true); setError(null);
    try { setData(await repository.load()); }
    catch { setError(LOAD_ERROR); }
    finally { setIsLoading(false); }
  }
  async function record(item: LearningItem, rating: SelfRating, sessionId: string, attemptId: string) {
    if (isLoading || error || learning.isLoading || learning.loadError || learning.isSaving || busy.current) throw new Error('복습 기록을 저장할 수 없습니다.');
    if (!learning.items.some((entry) => entry.id === item.id && entry.learningLanguage === item.learningLanguage)) throw new Error('학습 항목이 삭제되었습니다.');
    busy.current = true; setIsSaving(true);
    try {
      const next = await repository.record({ itemId: item.id, learningLanguage: item.learningLanguage, rating, sessionId, attemptId });
      setData(next);
      setToday(localDate());
      return next.states.find((state) => state.itemId === item.id && state.learningLanguage === item.learningLanguage)!;
    } finally { busy.current = false; setIsSaving(false); }
  }
  return <Context.Provider value={{ data, today, isLoading, isSaving, error, retryLoad, record }}>{children}</Context.Provider>;
}
export function useReview() {
  const context = useContext(Context);
  if (!context) throw new Error('ReviewProvider가 필요합니다.');
  return context;
}
