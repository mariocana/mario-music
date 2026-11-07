import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = 'mario-music:server-url';
export const DEFAULT_SERVER_URL = 'http://localhost:4000';

let cachedServerUrl = DEFAULT_SERVER_URL;
let isLoaded = false;
const listeners = new Set<(url: string) => void>();

export async function initConfig(): Promise<string> {
  if (isLoaded) return cachedServerUrl;
  try {
    const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
    if (saved) {
      cachedServerUrl = saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // fallback su default
  }
  isLoaded = true;
  return cachedServerUrl;
}

export function getServerUrlSync(): string {
  return cachedServerUrl;
}

export async function setServerUrl(newUrl: string): Promise<void> {
  const clean = newUrl.trim().replace(/\/+$/, '');
  cachedServerUrl = clean;
  await AsyncStorage.setItem(SERVER_URL_KEY, clean);
  listeners.forEach((fn) => fn(clean));
}

export function subscribeServerUrl(fn: (url: string) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
