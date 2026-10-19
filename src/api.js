
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE_URL} from './config';

const TOKEN_KEY = 'fastfood_one_token';

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function saveToken(token) {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function clearToken() {
  return AsyncStorage.removeItem(TOKEN_KEY);
}
export async function api(path, options = {}) {
  const token = await getToken();
  const headers = {'Content-Type': 'application/json', ...(options.headers || {})};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {...options, headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
  return data;
}
