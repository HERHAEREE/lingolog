import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { correctionServices } from '@/correction';
import { createCorrectionController } from '@/correction/correction-controller';
import { createCorrectionRepository } from '@/correction/correction-repository';

type Controller = ReturnType<typeof createCorrectionController>;
const Context = createContext<(ReturnType<Controller['snapshot']> & { controller: Controller }) | null>(null);
export function CorrectionProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() => createCorrectionController(createCorrectionRepository(AsyncStorage), correctionServices));
  const [state, setState] = useState(controller.snapshot);
  useEffect(() => {
    const unsubscribe = controller.subscribe(() => setState(controller.snapshot()));
    void controller.load();
    return unsubscribe;
  }, [controller]);
  return <Context.Provider value={{ ...state, controller }}>{children}</Context.Provider>;
}
export function useCorrection() {
  const context = useContext(Context);
  if (!context) throw new Error('CorrectionProvider가 필요합니다.');
  return context;
}
