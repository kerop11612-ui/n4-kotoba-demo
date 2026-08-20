import type { MemoryRepository } from "./memory-repository.ts";
import { LocalStorageMemoryRepository } from "./memory-repository.ts";
import { emptyMemoryData, migrateMemoryData } from "./memory-migration.ts";
import { applyReviewCommit, isImportableMemoryData, upsertById } from "./memory-repository-utils.ts";
import { getMemoryKey, type MemoryRepositoryData, type MemorySkill, type ReviewHistoryRecord, type VocabularyReviewEvent, type WordMemoryRecord } from "../spaced-repetition/types.ts";
import type { RepositoryNamespace } from "../sync/local-sync-state.ts";

const DATABASE_NAME = "n4-kotoba-memory";
const DATABASE_VERSION = 1;
const STORE_NAME = "memory";
const STATE_KEY = "state";

type StoredMemoryState = {
  data: MemoryRepositoryData;
};

export type IndexedDbMemoryRepositoryOptions = {
  indexedDB?: IDBFactory | null;
  storage?: Storage | null;
  namespace?: RepositoryNamespace;
};

/**
 * IndexedDB backend with one object-store record for the current memory data.
 * Read-modify-write operations happen inside one readwrite transaction so a
 * second tab cannot overwrite a completed review with an older snapshot.
 */
export class IndexedDbMemoryRepository implements MemoryRepository {
  private readonly indexedDB: IDBFactory;
  private readonly legacyStorage: Storage | null;
  private readonly stateKey: string;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private data: MemoryRepositoryData = emptyMemoryData();

  constructor(options: IndexedDbMemoryRepositoryOptions = {}) {
    const indexedDB = options.indexedDB ?? getBrowserIndexedDb();
    if (!indexedDB) throw new Error("IndexedDB 無法使用");
    this.indexedDB = indexedDB;
    this.legacyStorage = options.storage !== undefined ? options.storage : getBrowserStorage();
    const namespace = options.namespace ?? "guest";
    this.stateKey = namespace === "guest" ? STATE_KEY : `state:${namespace}`;
  }

  async migrate(): Promise<void> {
    const stored = await this.readStoredData();
    if (stored) {
      const migrated = migrateMemoryData(stored);
      await this.replaceStoredData(migrated);
      return;
    }

    // Preserve existing localStorage data on the first IndexedDB open. The
    // old key is intentionally not deleted, so users can still recover it.
    const migrated = this.stateKey === STATE_KEY
      ? await readLegacyMemoryData(this.legacyStorage)
      : emptyMemoryData();
    await this.replaceStoredData(migrateMemoryData(migrated));
  }

  async getWordMemory(wordId: string, skill: MemorySkill = "jp_to_meaning") {
    const record = this.data.memories[getMemoryKey(wordId, skill)] ?? this.data.memories[wordId] ?? null;
    return record ? structuredClone(record) : null;
  }

  async saveWordMemory(record: WordMemoryRecord): Promise<void> {
    await this.updateStoredData((data) => {
      data.memories[getMemoryKey(record.wordId, record.skill)] = structuredClone(record);
    });
  }

  async commitReview(
    memory: WordMemoryRecord,
    history: ReviewHistoryRecord,
    event: VocabularyReviewEvent,
  ): Promise<void> {
    await this.updateStoredData((data) => applyReviewCommit(data, memory, history, event));
  }

  async getUnitMemories(unitId: string): Promise<WordMemoryRecord[]> {
    return Object.values(this.data.memories)
      .filter((record) => record.unitId === unitId)
      .map((record) => structuredClone(record));
  }

  async getReviewHistory(unitId?: string): Promise<ReviewHistoryRecord[]> {
    const records = unitId ? this.data.history.filter((record) => record.unitId === unitId) : this.data.history;
    return structuredClone(records);
  }

  async appendReviewHistory(record: ReviewHistoryRecord): Promise<void> {
    await this.updateStoredData((data) => upsertById(data.history, record));
  }

  async getReviewEvents(unitId?: string): Promise<VocabularyReviewEvent[]> {
    const records = unitId ? this.data.events.filter((record) => record.unitId === unitId) : this.data.events;
    return structuredClone(records);
  }

  async appendReviewEvent(record: VocabularyReviewEvent): Promise<void> {
    await this.updateStoredData((data) => upsertById(data.events, record));
  }

  async exportData(): Promise<MemoryRepositoryData> {
    return structuredClone(this.data);
  }

  async importData(value: unknown): Promise<void> {
    if (!isImportableMemoryData(value)) throw new Error("學習資料格式無效");
    await this.replaceStoredData(migrateMemoryData(value));
  }

  async reset(): Promise<void> {
    await this.replaceStoredData(emptyMemoryData());
  }

  private async updateStoredData(mutator: (data: MemoryRepositoryData) => void): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(this.stateKey) as IDBRequest<StoredMemoryState | undefined>;
      let nextData: MemoryRepositoryData | null = null;
      let settled = false;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error("IndexedDB 儲存失敗"));
      };

      request.onerror = () => fail(request.error ?? new Error("IndexedDB 讀取失敗"));
      request.onsuccess = () => {
        try {
          nextData = migrateMemoryData(request.result?.data ?? emptyMemoryData());
          mutator(nextData);
          store.put({ data: nextData }, this.stateKey);
        } catch (error) {
          try { transaction.abort(); } catch { /* transaction already closed */ }
          fail(error);
        }
      };
      transaction.onerror = () => fail(transaction.error ?? new Error("IndexedDB 儲存失敗"));
      transaction.onabort = () => fail(transaction.error ?? new Error("IndexedDB transaction 已中止"));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        this.data = nextData ?? emptyMemoryData();
        resolve();
      };
    });
  }

  private async replaceStoredData(data: MemoryRepositoryData): Promise<void> {
    const database = await this.openDatabase();
    const normalized = migrateMemoryData(data);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).put({ data: normalized }, this.stateKey);
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error("IndexedDB 儲存失敗"));
      };

      request.onerror = () => fail(request.error ?? new Error("IndexedDB 儲存失敗"));
      transaction.onerror = () => fail(transaction.error ?? new Error("IndexedDB 儲存失敗"));
      transaction.onabort = () => fail(transaction.error ?? new Error("IndexedDB transaction 已中止"));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        this.data = structuredClone(normalized);
        resolve();
      };
    });
  }

  private async readStoredData(): Promise<MemoryRepositoryData | null> {
    const database = await this.openDatabase();
    return new Promise<MemoryRepositoryData | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(this.stateKey) as IDBRequest<StoredMemoryState | undefined>;
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 讀取失敗"));
      request.onsuccess = () => resolve(request.result?.data ?? null);
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 讀取失敗"));
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 開啟失敗"));
      request.onblocked = () => reject(new Error("IndexedDB 開啟被其他分頁阻擋"));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
    return this.dbPromise;
  }
}

function getBrowserIndexedDb(): IDBFactory | null {
  if (typeof window === "undefined") return null;
  try {
    return window.indexedDB ?? null;
  } catch {
    return null;
  }
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function readLegacyMemoryData(storage: Storage | null): Promise<MemoryRepositoryData> {
  const legacyRepository = new LocalStorageMemoryRepository(storage);
  await legacyRepository.migrate();
  return legacyRepository.exportData();
}
