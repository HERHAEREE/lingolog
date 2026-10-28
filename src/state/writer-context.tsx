import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import type { WriterDraft } from '@/data/writer-draft';

const Context = createContext<{ draft: WriterDraft | null; setDraft: (draft: WriterDraft | null) => void } | null>(null);
export function WriterProvider({ children }: PropsWithChildren) {
  const [draft, setDraft] = useState<WriterDraft | null>(null);
  return <Context.Provider value={{ draft, setDraft }}>{children}</Context.Provider>;
}
export function useWriterDraft() {
  const context = useContext(Context);
  if (!context) throw new Error('WriterProvider is required');
  return context;
}
