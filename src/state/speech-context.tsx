import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import * as Speech from 'expo-speech';
import { createSpeechController, type SpeechState, type SpeechSpeed } from '@/speech/speech-controller';
import type { LearningLanguage } from '@/data/languages';

type Context = SpeechState & ReturnType<typeof createSpeechController> & {
  speeds: Record<LearningLanguage, SpeechSpeed>;
  setSpeed: (language: LearningLanguage, speed: SpeechSpeed) => void;
};
const SpeechContext = createContext<Context | null>(null);
export function SpeechProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SpeechState>({ owner: null, error: null });
  const [speeds, setSpeeds] = useState<Record<LearningLanguage, SpeechSpeed>>({ en: 'normal', ja: 'normal' });
  const [controller] = useState(() => createSpeechController(Speech, setState));
  const pathname = usePathname();
  useEffect(() => { void controller.stop(); }, [controller, pathname]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => { if (next !== 'active') void controller.stop(); });
    return () => { listener.remove(); void controller.stop(); };
  }, [controller]);
  return <SpeechContext.Provider value={{ ...state, ...controller, speeds, setSpeed: (language, speed) => {
    void controller.stop(); setSpeeds((previous) => ({ ...previous, [language]: speed }));
  } }}>{children}</SpeechContext.Provider>;
}
export function useSpeech() {
  const context = useContext(SpeechContext);
  if (!context) throw new Error('SpeechProvider is required');
  return context;
}
