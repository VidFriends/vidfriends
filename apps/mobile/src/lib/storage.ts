// FR-MOB-03: the session token lives only in the Keychain / Keystore-backed secure store. The
// paired instance is stored there too so it is applied on every launch (WF-PAIR-2, L-16).
import * as SecureStore from 'expo-secure-store';

const KEYS = { instance: 'vf.instance', token: 'vf.token' } as const;

export interface PairedInstance {
  baseUrl: string;
  name: string;
  insecure: boolean;
}

export async function loadInstance(): Promise<PairedInstance | null> {
  const raw = await SecureStore.getItemAsync(KEYS.instance);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as PairedInstance;
    return typeof v.baseUrl === 'string' ? v : null;
  } catch {
    return null;
  }
}

export const saveInstance = (i: PairedInstance) =>
  SecureStore.setItemAsync(KEYS.instance, JSON.stringify(i));
export const clearInstance = () => SecureStore.deleteItemAsync(KEYS.instance);
export const loadToken = () => SecureStore.getItemAsync(KEYS.token);
export const saveToken = (token: string) => SecureStore.setItemAsync(KEYS.token, token);
export const clearToken = () => SecureStore.deleteItemAsync(KEYS.token);
