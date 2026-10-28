import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { createAnonymousSessionManager } from './anonymous-session';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
export const supabaseConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) && key.startsWith('sb_publishable_');
export const serverCorrectionEnabled = supabaseConfigured && process.env.EXPO_PUBLIC_SERVER_CORRECTION_ENABLED === 'true';
// This public setting selects UI/response validation only; server Secrets gate paid calls.
export const serverGenerationMode = process.env.EXPO_PUBLIC_SERVER_CORRECTION_MODE === 'model' ? 'model' : 'mock';
export const correctionEndpoint = supabaseConfigured ? `${url.replace(/\/$/, '')}/functions/v1/correct-diary` : undefined;
export const supabasePublishableKey = supabaseConfigured ? key : undefined;
const project = supabaseConfigured ? new URL(url).hostname.split('.')[0] : 'unconfigured';
export const AUTH_STORAGE_KEY = `@lingolog/supabase-auth/${project}/v1`;
// Refuse corrupted session bytes instead of letting hydration replace them with an empty session.
const storage = {
  async getItem(name: string) {
    const raw = await AsyncStorage.getItem(name);
    if (name === AUTH_STORAGE_KEY && raw !== null) {
      const session = JSON.parse(raw);
      if (!session?.access_token || !session?.refresh_token || !session?.user?.id) throw new Error('저장된 인증 세션을 읽을 수 없습니다.');
    }
    return raw;
  },
  setItem: (name: string, value: string) => AsyncStorage.setItem(name, value),
  removeItem: (name: string) => AsyncStorage.removeItem(name),
};
export const supabase = supabaseConfigured ? createClient(url, key, { auth: {
  storage, storageKey: AUTH_STORAGE_KEY, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock,
} }) : null;
const manager = supabase ? createAnonymousSessionManager(supabase.auth, AsyncStorage, `${AUTH_STORAGE_KEY}/identity`) : null;
export async function getAnonymousAccessToken() {
  if (!manager) throw new Error('Supabase 공개 URL과 publishable key를 설정해 주세요. 로컬 기능은 계속 사용할 수 있어요.');
  return manager.ensure();
}
