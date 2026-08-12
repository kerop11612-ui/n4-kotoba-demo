import type { MemoryRepository } from "./memory-repository.ts";
import { IndexedDbMemoryRepository } from "./indexeddb-memory-repository.ts";
import { LocalStorageMemoryRepository } from "./memory-repository.ts";

/**
 * 建立學習紀錄儲存層的唯一入口。
 *
 * UI 與複習流程不應直接依賴某一種儲存實作。瀏覽器支援 IndexedDB 時
 * 優先使用 transaction backend；測試、SSR 或受限環境則回退 localStorage。
 */
export function createMemoryRepository(
  storage?: Storage | null,
  indexedDB?: IDBFactory | null,
): MemoryRepository {
  const browserIndexedDb = indexedDB !== undefined ? indexedDB : getBrowserIndexedDb();
  if (browserIndexedDb) {
    return new IndexedDbMemoryRepository({ indexedDB: browserIndexedDb, storage });
  }
  return new LocalStorageMemoryRepository(storage);
}

function getBrowserIndexedDb(): IDBFactory | null {
  if (typeof window === "undefined") return null;
  try {
    return window.indexedDB ?? null;
  } catch {
    return null;
  }
}
