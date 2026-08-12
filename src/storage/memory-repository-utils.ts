import { getMemoryKey, type MemoryRepositoryData, type ReviewHistoryRecord, type VocabularyReviewEvent, type WordMemoryRecord } from "../spaced-repetition/types.ts";
import { MEMORY_SCHEMA_VERSION } from "./memory-migration.ts";

export function applyReviewCommit(
  data: MemoryRepositoryData,
  memory: WordMemoryRecord,
  history: ReviewHistoryRecord,
  event: VocabularyReviewEvent,
): void {
  data.memories[getMemoryKey(memory.wordId, memory.skill)] = structuredClone(memory);
  upsertById(data.history, history);
  upsertById(data.events, event);
}

export function upsertById<T extends { id: string }>(records: T[], record: T): void {
  const index = records.findIndex((item) => item.id === record.id);
  if (index === -1) records.push(structuredClone(record));
  else records[index] = structuredClone(record);
}

export function isImportableMemoryData(value: unknown): boolean {
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
