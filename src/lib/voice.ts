import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';

const KEY = 'gemini_api_key';
const web = Platform.OS === 'web';

export const useApiKey = create<{ key: string | null; loaded: boolean }>()(() => ({ key: null, loaded: false }));

export async function loadApiKey() {
  const key = web ? (globalThis.localStorage?.getItem(KEY) ?? null) : await SecureStore.getItemAsync(KEY);
  useApiKey.setState({ key, loaded: true });
}

export async function saveApiKey(key: string | null) {
  if (web) {
    if (key) globalThis.localStorage?.setItem(KEY, key);
    else globalThis.localStorage?.removeItem(KEY);
  } else if (key) await SecureStore.setItemAsync(KEY, key);
  else await SecureStore.deleteItemAsync(KEY);
  useApiKey.setState({ key });
}

export const maskKey = (k: string) => `${k.slice(0, 6)}••••${k.slice(-4)}`;

const MIME: Record<string, string> = { m4a: 'audio/m4a', mp4: 'audio/m4a', aac: 'audio/aac', webm: 'audio/webm', ogg: 'audio/ogg', wav: 'audio/wav' };

export async function readAudio(uri: string) {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (web) {
    const blob = await (await fetch(uri)).blob();
    const data = await new Promise<string>((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1] ?? '');
      r.onerror = fail;
      r.readAsDataURL(blob);
    });
    return { data, mimeType: blob.type.split(';')[0] || MIME[ext] || 'audio/webm' };
  }
  const f = new File(uri);
  try {
    return { data: await f.base64(), mimeType: MIME[ext] ?? 'audio/m4a' };
  } finally {
    if (f.exists) f.delete();
  }
}
