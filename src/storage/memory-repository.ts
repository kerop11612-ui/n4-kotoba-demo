import type { MemoryRepositoryData, ReviewHistoryRecord, WordMemoryRecord } from "../spaced-repetition/types.ts";
import { emptyMemoryData, MEMORY_SCHEMA_VERSION, migrateMemoryData } from "./memory-migration.ts";
import { getMemoryKey } from "../spaced-repetition/types.ts";
import type { MemorySkill, VocabularyReviewEvent } from "../spaced-repetition/types.ts";

export interface MemoryRepository {
  getWordMemory(wordId: string, skill?: MemorySkill): Promise<WordMemoryRecord | null>;
  saveWordMemory(record: WordMemoryRecord): Promise<void>;
  getUnitMemories(unitId: string): Promise<WordMemoryRecord[]>;
  getReviewHistory(unitId?: string): Promise<ReviewHistoryRecord[]>;
  appendReviewHistory(record: ReviewHistoryRecord): Promise<void>;
  getReviewEvents(unitId?: string): Promise<VocabularyReviewEvent[]>;
  appendReviewEvent(record: VocabularyReviewEvent): Promise<void>;
  migrate(): Promise<void>;
  exportData(): Promise<MemoryRepositoryData>;
  importData(value: unknown): Promise<void>;
}

export const MEMORY_STORAGE_KEY = "jlpt-spaced-repetition-memory-v1";

export class LocalStorageMemoryRepository implements MemoryRepository {
  private readonly storage: Storage | null;
  private data: MemoryRepositoryData = emptyMemoryData();

  constructor(storage?: Storage | null) {
    this.storage = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  }

  async migrate() {
    if (!this.storage) return;
    try {
      const raw =
        this.storage.getItem(MEMORY_STORAGE_KEY) ??
        this.storage.getItem("jlpt-apkg-progress-v2") ??
        this.storage.getItem("n4-apkg-progress-v1");
      this.data = migrateMemoryData(raw ? JSON.parse(raw) : null);
      this.persist();
    } catch {
      this.data = emptyMemoryData();
    }
  }

  async getWordMemory(wordId: string, skill: MemorySkill = "jp_to_meaning") {
    return this.data.memories[getMemoryKey(wordId, skill)] ?? this.data.memories[wordId] ?? null;
  }

  async saveWordMemory(record: WordMemoryRecord) {
    this.data.memories[getMemoryKey(record.wordId, record.skill)] = record;
    this.persist();
  }

  async getUnitMemories(unitId: string) {
    return Object.values(this.data.memories).filter((record) => record.unitId === unitId);
  }

  async getReviewHistory(unitId?: string) {
    return unitId ? this.data.history.filter((record) => record.unitId === unitId) : [...this.data.history];
  }

  async appendReviewHistory(record: ReviewHistoryRecord) {
    this.data.history.push(record);
    this.persist();
  }

  async getReviewEvents(unitId?: string) {
    return unitId ? this.data.events.filter((record) => record.unitId === unitId) : [...this.data.events];
  }

  async appendReviewEvent(record: VocabularyReviewEvent) {
    this.data.events.push(record);
    this.persist();
  }

  async exportData() {
    return structuredClone(this.data);
  }

  async importData(value: unknown) {
    if (!isImportableMemoryData(value)) {
      throw new Error("學習資料格式無效");
    }
    const migrated = migrateMemoryData(value);
    this.data = migrated;
    this.persist();
  }

  private persist() {
    if (!this.storage) return;
    this.storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(this.data));
  }
}

function isImportableMemoryData(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if ("schemaVersion" in candidate || "memories" in candidate || "history" in candidate) {
    return (candidate.schemaVersion === 1 || candidate.schemaVersion === MEMORY_SCHEMA_VERSION)
      && Boolean(candidate.memories)
      && typeof candidate.memories === "object"
      && !Array.isArray(candidate.memories);
  }
  return Object.values(candidate).every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const legacy = item as Record<string, unknown>;
    return "dueAt" in legacy || "card" in legacy || "lastRating" in legacy;
  });
}
