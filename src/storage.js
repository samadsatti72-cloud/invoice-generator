import { del, get, set } from 'idb-keyval';

let onSaveError = null;

export function setOnSaveError(handler) {
  onSaveError = typeof handler === 'function' ? handler : null;
}

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`Could not save ${key} to local storage`, err);
    onSaveError?.({
      key,
      error: err,
      message: `Could not save local data for "${key}". Check storage permissions and available space.`,
    });
    return false;
  }
}

export async function putBlob(key, blob) {
  await set(key, blob);
}

export async function getBlob(key) {
  return get(key);
}

export async function getLogo(key = 'logo-v1-default') {
  const logo = await getBlob(key);
  return typeof logo === 'string' ? logo : '';
}

export async function setLogo(dataUrl, key = 'logo-v1-default') {
  await putBlob(key, dataUrl);
  return key;
}

export async function removeLogo(key = 'logo-v1-default') {
  await del(key);
}
