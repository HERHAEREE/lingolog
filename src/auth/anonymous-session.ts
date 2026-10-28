type Session = { access_token: string; expires_at?: number; user: { id: string } };
type AuthError = { status?: number } | null;
type SessionResponse = { data: { session: Session | null }; error: AuthError };
export type AnonymousAuth = {
  getSession: () => Promise<SessionResponse>;
  refreshSession: () => Promise<SessionResponse>;
  signInAnonymously: () => Promise<SessionResponse>;
};
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
export function createAnonymousSessionManager(auth: AnonymousAuth, storage: Storage, identityKey: string, now = () => Date.now()) {
  let pending: Promise<string> | null = null;
  async function ensure() {
    const identity = await storage.getItem(identityKey);
    const loaded = await auth.getSession();
    if (loaded.error) throw new Error('익명 인증 세션을 확인하지 못했어요. 로컬 기록은 유지됩니다.');
    let session = loaded.data.session;
    if (!session) {
      // A missing/failed refresh must never silently create another anonymous account.
      if (identity !== null) throw new Error('기존 익명 세션을 복구하지 못했어요. 새 계정을 자동 생성하지 않습니다. 로컬 기능은 계속 이용할 수 있어요.');
      await storage.setItem(identityKey, JSON.stringify({ state: 'creating' }));
      const signed = await auth.signInAnonymously();
      if (signed.error || !signed.data.session) {
        // A definitive Auth API rejection is safe to retry after Dashboard settings change.
        if (signed.error?.status && signed.error.status >= 400 && signed.error.status < 500) await storage.removeItem(identityKey);
        throw new Error('익명 인증을 연결하지 못했어요. 익명 로그인 설정과 인터넷 연결을 확인해 주세요. 로컬 기록은 유지됩니다.');
      }
      session = signed.data.session;
    }
    if (session.expires_at && session.expires_at * 1000 <= now() + 60000) {
      const refreshed = await auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) throw new Error('인증 토큰을 갱신하지 못했어요. 새 계정을 만들지 않고 다시 시도할 수 있어요.');
      session = refreshed.data.session;
    }
    if (!session.access_token || !session.user.id) throw new Error('익명 세션 정보가 올바르지 않아요.');
    await storage.setItem(identityKey, JSON.stringify({ state: 'ready', userId: session.user.id }));
    return session.access_token;
  }
  return {
    ensure(): Promise<string> {
      if (!pending) pending = ensure().finally(() => { pending = null; });
      return pending;
    },
  };
}
