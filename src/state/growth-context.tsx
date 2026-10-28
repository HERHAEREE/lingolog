import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createGrowthRepository } from '@/growth/growth-repository';
import { growthFor, type GrowthData } from '@/growth/growth-model';
import { useDiary } from './diary-context';
import type { LearningLanguage } from '@/data/languages';

type GrowthContextValue = {
  data: GrowthData; isLoading: boolean; error: string | null; retry: () => void;
  celebration: { language: LearningLanguage; message: string } | null; dismiss: () => void;
};
const GrowthContext = createContext<GrowthContextValue | null>(null);
export function GrowthProvider({ children }: PropsWithChildren) {
  const diary = useDiary();
  const [repository] = useState(() => createGrowthRepository(AsyncStorage));
  const [data, setData] = useState<GrowthData>({ migrated: false, days: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<GrowthContextValue['celebration']>(null);
  const [attempt, setAttempt] = useState(0);
  const initialized = useRef(false);
  const displayedDays = useRef<GrowthData['days']>([]);
  useEffect(() => {
    if (diary.isLoading || diary.loadError) return;
    let active = true;
    void repository.reconcile(diary.entries, diary.writingDays).then((result) => {
      if (!active) return;
      setData(result.data); setError(null); setIsLoading(false);
      // Startup/migration catches up silently; celebrate newly earned language stages.
      const advanced = (['en', 'ja'] as const).find((language) =>
        growthFor(result.data.days, language).index > growthFor(displayedDays.current, language).index);
      if (initialized.current && !result.migration && advanced) {
        setCelebration({ language: advanced, message: growthFor(result.data.days, advanced).stage.message });
      }
      initialized.current = true;
      displayedDays.current = result.data.days;
    }).catch(() => {
      if (active) {
        setIsLoading(false);
        setError('집 성장 기록을 저장하거나 불러오지 못했어요. 저장된 일기는 유지돼요. 작성일 보상은 다시 반영할 수 있어요.');
      }
    });
    return () => { active = false; };
  }, [repository, diary.entries, diary.writingDays, diary.isLoading, diary.loadError, attempt]);
  return <GrowthContext.Provider value={{ data, isLoading, error, celebration,
    retry: () => { setIsLoading(true); setAttempt((value) => value + 1); }, dismiss: () => setCelebration(null),
  }}>{children}</GrowthContext.Provider>;
}
export function useGrowth() {
  const context = useContext(GrowthContext);
  if (!context) throw new Error('GrowthProvider is required');
  return context;
}
