import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPreferencesRepository, DEFAULT_PREFERENCES, type Preferences } from '@/data/preferences-repository';
import type { LearningLanguage } from '@/data/languages';

type PreferencesState = {
  preferences: Preferences; isLoading: boolean; isSaving: boolean; error: string | null;
  retryLoad: () => Promise<void>; selectLanguage: (language: LearningLanguage) => Promise<void>;
};
const Context = createContext<PreferencesState | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(() => createPreferencesRepository(AsyncStorage));
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const loadMessage = '언어 설정을 불러오지 못했어요. 다시 불러온 뒤 변경해 주세요.';
  useEffect(() => {
    let active = true;
    repository.load().then((value) => { if (active) { setPreferences(value); setIsLoading(false); } })
      .catch(() => { if (active) { setError(loadMessage); setIsLoading(false); } });
    return () => { active = false; };
  }, [repository]);
  async function retryLoad() {
    setIsLoading(true); setError(null);
    try { setPreferences(await repository.load()); }
    catch { setError(loadMessage); }
    finally { setIsLoading(false); }
  }
  async function selectLanguage(learningLanguage: LearningLanguage) {
    if (isLoading || error || busy.current) return;
    busy.current = true; setIsSaving(true);
    try { setPreferences(await repository.save({ ...preferences, learningLanguage })); }
    catch { setError('언어 설정을 저장하지 못했어요. 이전 설정을 유지합니다. 다시 불러온 뒤 시도해 주세요.'); }
    finally { busy.current = false; setIsSaving(false); }
  }
  return <Context.Provider value={{ preferences, isLoading, isSaving, error, retryLoad, selectLanguage }}>{children}</Context.Provider>;
}

export function usePreferences() {
  const context = useContext(Context);
  if (!context) throw new Error('PreferencesProvider가 필요합니다.');
  return context;
}
