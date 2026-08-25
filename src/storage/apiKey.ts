import * as SecureStore from 'expo-secure-store';

const KEY = 'groq_api_key';

// Klucz trzymamy w Keychain/Keystore, nie w AsyncStorage - to jedyna rzecz,
// ktora ta aplikacja w ogole utrwala na urzadzeniu.
export async function loadApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveApiKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, value.trim());
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
