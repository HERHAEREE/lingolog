import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { supabase, getAnonymousAccessToken } from '@/auth/supabase-client';

const Context = createContext<{ status: 'unconfigured' | 'connecting' | 'ready' | 'failed'; error: string | null; userId: string | null; retry: () => void } | null>(null);
export function AnonymousAuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<'unconfigured' | 'connecting' | 'ready' | 'failed'>(supabase ? 'connecting' : 'unconfigured');
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void getAnonymousAccessToken().then(async () => { const session = await supabase!.auth.getSession(); if (active) { setUserId(session.data.session?.user.id ?? null); setStatus('ready'); setError(null); } })
      .catch(() => { if (active) { setStatus('failed'); setError('익명 인증을 확인하지 못했어요. 인터넷 연결과 Supabase 익명 로그인 설정을 확인해 주세요. 로컬 기록은 유지됩니다.'); } });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!supabase) return;
    const auth = supabase.auth;
    const refresh = (value: string) => { if (value === 'active') auth.startAutoRefresh(); else auth.stopAutoRefresh(); };
    refresh(AppState.currentState);
    const listener = AppState.addEventListener('change', refresh);
    const { data } = auth.onAuthStateChange((event, session) => {
      if (session) { setUserId(session.user.id); setStatus('ready'); setError(null); }
      else if (event === 'SIGNED_OUT') { setUserId(null); setStatus('failed'); setError('익명 세션이 종료됐어요. 로컬 기록은 유지되며 새 계정을 자동으로 만들지 않습니다.'); }
    });
    return () => { listener.remove(); data.subscription.unsubscribe(); auth.stopAutoRefresh(); };
  }, []);
  return <Context.Provider value={{ status, error, userId, retry: () => { setStatus('connecting'); setError(null); setAttempt((value) => value + 1); } }}>{children}</Context.Provider>;
}
export function useAnonymousAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('AnonymousAuthProvider가 필요합니다.');
  return context;
}
