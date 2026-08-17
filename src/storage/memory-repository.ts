import type { MemoryRepositoryData, ReviewHistoryRecord, WordMemoryRecord } from "../spaced-repetition/types.ts";
import { emptyMemoryData, migrateMemoryData } from "./memory-migration.ts";
import { getMemoryKey } from "../spaced-repetition/types.ts";
import type { MemorySkill, VocabularyReviewEvent } from "../spaced-repetition/types.ts";
import { applyReviewCommit, isImportableMemoryData, upsertById } from "./memory-repository-utils.ts";

export interface MemoryRepository {
  getWordMemory(wordId: string, skill?: MemorySkill): Promise<WordMemoryRecord | null>;
  saveWordMemory(record: WordMemoryRecord): Promise<void>;
  commitReview(memory: WordMemoryRecord, history: ReviewHistoryRecord, event: VocabularyReviewEvent): Promise<void>;
  getUnitMemories(unitId: string): Promise<WordMemoryRecord[]>;
  getReviewHistory(unitId?: string): Promise<ReviewHistoryRecord[]>;
  appendReviewHistory(record: ReviewHistoryRecord): Promise<void>;
  getReviewEvents(unitId?: string): Promise<VocabularyReviewEvent[]>;
  appendReviewEvent(record: VocabularyReviewEvent): Promise<void>;
  migrate(): Promise<void>;
  exportData(): Promise<MemoryRepositoryData>;
  importData(value: unknown): Promise<void>;
  reset(): Promise<void>;
}

export const MEMORY_STORAGE_KEY = "jlpt-spaced-repetition-memory-v1";
const LEGACY_MEMORY_STORAGE_KEYS = [MEMORY_STORAGE_KEY, "jlpt-apkg-progress-v2", "n4-apkg-progress-v1"];

export class LocalStorageMemoryRepository implements MemoryRepository {
  private readonly storage: Storage | null;
  private data: MemoryRepositoryData = emptyMemoryData();

  constructor(storage?: Storage | null) {
    if (storage !== undefined) {
      this.storage = storage;
      return;
    }
    try {
      this.storage = typeof window === "undefined" ? null : window.localStorage;
    } catch {
      this.storage = null;
    }
  }

  async migrate() {
    if (!this.storage) return;
    let parsed: unknown = null;
    let foundRaw = false;
    for (const key of LEGACY_MEMORY_STORAGE_KEYS) {
      const raw = this.storage.getItem(key);
      if (raw === null) continue;
      foundRaw = true;
      try {
        parsed = JSON.parse(raw);
        break;
      } catch {
        // Try an older storage key before treating the data as corrupted.
      }
    }
    if (foundRaw && parsed === null) {
      throw new Error("學習資料格式無效");
    }
    const migrated = migrateMemoryData(parsed);
    this.persist(migrated);
    this.data = migrated;
  }

  async getWordMemory(wordId: string, skill: MemorySkill = "jp_to_meaning") {
    const record = this.data.memories[getMemoryKey(wordId, skill)] ?? this.data.memories[wordId] ?? null;
    return record ? structuredClone(record) : null;
  }

  async saveWordMemory(record: WordMemoryRecord) {
    const nextData = this.readLatestData();
    nextData.memories[getMemoryKey(record.wordId, record.skill)] = structuredClone(record);
    this.persist(nextData);
    this.data = nextData;
  }

  async commitReview(memory: WordMemoryRecord, history: ReviewHistoryRecord, event: VocabularyReviewEvent) {
    const nextData = this.readLatestData();
    applyReviewCommit(nextData, memory, history, event);
    this.persist(nextData);
    this.data = nextData;
  }

  async getUnitMemories(unitId: string) {
    return Object.values(this.data.memories)
      .filter((record) => record.unitId === unitId)
      .map((record) => structuredClone(record));
  }

  async getReviewHistory(unitId?: string) {
    const records = unitId ? this.data.history.filter((record) => record.unitId === unitId) : this.data.history;
    return structuredClone(records);
  }

  async appendReviewHistory(record: ReviewHistoryRecord) {
    const nextData = this.readLatestData();
    upsertById(nextData.history, record);
    this.persist(nextData);
    this.data = nextData;
  }

  async getReviewEvents(unitId?: string) {
    const records = unitId ? this.data.events.filter((record) => record.unitId === unitId) : this.data.events;
    return structuredClone(records);
  }

  async appendReviewEvent(record: VocabularyReviewEvent) {
    const nextData = this.readLatestData();
    upsertById(nextData.events, record);
    this.persist(nextData);
    this.data = nextData;
  }

  async exportData() {
    return structuredClone(this.data);
  }

  async importData(value: unknown) {
    if (!isImportableMemoryData(value)) {
      throw new Error("學習資料格式無效");
    }
    const migrated = migrateMemoryData(value);
    this.persist(migrated);
    this.data = migrated;
  }

  async reset() {
    for (const key of LEGACY_MEMORY_STORAGE_KEYS) this.storage?.removeItem(key);
    this.data = emptyMemoryData();
  }

  private persist(data: MemoryRepositoryData = this.data) {
    if (!this.storage) return;
    this.storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(data));
  }

  private readLatestData(): MemoryRepositoryData {
    if (!this.storage) return structuredClone(this.data);
    const raw = this.storage.getItem(MEMORY_STORAGE_KEY);
    if (raw === null) return structuredClone(this.data);
    try {
      return migrateMemoryData(JSON.parse(raw));
    } catch {
      throw new Error("學習資料格式無效");
    }
  }
}
