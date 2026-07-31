import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * RN equivalent of the raw `localStorage.getItem`/`setItem` calls inline in web's context files —
 * AsyncStorage is the same string key/value store, just async. JSON-encodes non-string values so
 * callers can store numbers/objects the way web's contexts do via `JSON.stringify`/`JSON.parse`.
 */
export async function getItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
