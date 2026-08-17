export const FAVORITES_STORAGE_KEY = "kotoba-demo-favorites";

function getSafeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readFavoriteIds(storage: Storage | null = getSafeLocalStorage()): Set<string> {
  if (!storage) return new Set();
  try {
    const stored = JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeFavoriteIds(ids: Set<string>, storage: Storage | null = getSafeLocalStorage()): void {
  if (!storage) throw new Error("收藏資料儲存空間不可用");
  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...ids]));
}
