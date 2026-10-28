import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createLocalDiaryRepository } from '@/data/local-diary-repository';
import type { DiaryEntry } from '@/data/diary-model';
import type { DiaryRepository } from '@/data/diary-repository';
import type { LearningLanguage } from '@/data/languages';
import type { WritingDay } from '@/growth/growth-model';
import type { ReuseTarget } from '@/reuse/reuse-model';

export type { DiaryEntry } from '@/data/diary-model';
export const writingPrompt = { english: 'What made you smile today?', korean: '오늘 당신을 미소 짓게 한 일은 무엇인가요?' };

type DiaryState = {
  entries: DiaryEntry[];
  writingDays: WritingDay[];
  isLoading: boolean;
  isSaving: boolean;
  loadError: string | null;
  retryLoad: () => Promise<void>;
  addEntry: (content: string, learningLanguage?: LearningLanguage, diaryDate?: string, reuseTargets?: ReuseTarget[]) => Promise<string>;
  updateEntry: (id: string, content: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  addSampleEntries: () => Promise<void>;
};
const DiaryContext = createContext<DiaryState | null>(null);
const LOAD_ERROR = '저장된 일기를 불러오지 못했어요. 기존 데이터는 유지됩니다. 다시 시도해 주세요.';

export function DiaryProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(createLocalDiaryRepository);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [writingDays, setWritingDays] = useState<WritingDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    repository.load().then((loaded) => {
      if (active) {
        setEntries(loaded);
        setWritingDays(repository.writingDays());
        setIsLoading(false);
      }
    }).catch(() => {
      if (active) {
        setLoadError(LOAD_ERROR);
        setIsLoading(false);
      }
    });
    return () => { active = false; };
  }, [repository]);

  async function retryLoad() {
    setIsLoading(true);
    setLoadError(null);
    try {
      setEntries(await repository.load());
      setWritingDays(repository.writingDays());
    } catch {
      setLoadError(LOAD_ERROR);
    } finally {
      setIsLoading(false);
    }
  }

  async function commit(operation: (repo: DiaryRepository) => Promise<DiaryEntry[]>) {
    if (isLoading || loadError) throw new Error('저장된 일기를 먼저 불러와 주세요.');
    if (busy.current) throw new Error('저장 중입니다. 잠시 기다려 주세요.');
    busy.current = true;
    setIsSaving(true);
    try {
      const next = await operation(repository);
      setEntries(next);
      setWritingDays(repository.writingDays());
      return next;
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }

  async function addEntry(content: string, learningLanguage: LearningLanguage = 'en', diaryDate?: string, reuseTargets?: ReuseTarget[]) {
    const next = await commit((repo) => repo.create(content, learningLanguage, diaryDate, reuseTargets));
    return next[0].id;
  }

  return (
    <DiaryContext.Provider value={{ entries, writingDays, isLoading, isSaving, loadError, retryLoad, addEntry,
      updateEntry: async (id, content) => { await commit((repo) => repo.update(id, content)); },
      deleteEntry: async (id) => { await commit((repo) => repo.remove(id)); },
      addSampleEntries: async () => { await commit((repo) => repo.addSamples()); },
    }}>{children}</DiaryContext.Provider>
  );
}

export function useDiary() {
  const context = useContext(DiaryContext);
  if (!context) throw new Error('DiaryProvider가 필요합니다.');
  return context;
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
