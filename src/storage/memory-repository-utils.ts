import { isSerializedCard } from "../spaced-repetition/fsrs-adapter.ts";
import { getMemoryKey, type MemoryRepositoryData, type ReviewHistoryRecord, type VocabularyReviewEvent, type WordMemoryRecord } from "../spaced-repetition/types.ts";
import { MEMORY_SCHEMA_VERSION } from "./memory-migration.ts";

export type MemoryDataImportSummary = {
  format: "legacy" | "v1" | "v2" | "v3";
  memories: number;
  history: number;
  events: number;
};

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
  if ("schemaVersion" in candidate || "memories" in candidate || "history" in candidate || "events" in candidate) {
    if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2 && candidate.schemaVersion !== MEMORY_SCHEMA_VERSION) return false;
    if (!isRecord(candidate.memories)) return false;
    const memoryEntries = Object.entries(candidate.memories);
    if (memoryEntries.length === 0 || !memoryEntries.every(([key, item]) => isVersionedMemoryRecord(key, item))) return false;
    if (candidate.history !== undefined && (!Array.isArray(candidate.history) || !candidate.history.every(isImportableHistoryRecord))) return false;
    if (candidate.events !== undefined && (!Array.isArray(candidate.events) || !candidate.events.every(isImportableEventRecord))) return false;
    return true;
  }
  const legacyEntries = Object.entries(candidate);
  return legacyEntries.length > 0 && legacyEntries.every(([wordId, item]) => isLegacyMemoryRecord(wordId, item));
}

export function getMemoryDataImportSummary(value: unknown): MemoryDataImportSummary | null {
  if (!isImportableMemoryData(value) || !isRecord(value)) return null;
  if (value.schemaVersion === 1 || value.schemaVersion === 2 || value.schemaVersion === MEMORY_SCHEMA_VERSION) {
    return {
      format: `v${value.schemaVersion}`,
      memories: Object.keys(value.memories as object).length,
      history: Array.isArray(value.history) ? value.history.length : 0,
      events: Array.isArray(value.events) ? value.events.length : 0,
    };
  }
  return { format: "legacy", memories: Object.keys(value).length, history: 0, events: 0 };
}

function isVersionedMemoryRecord(key: string, value: unknown): boolean {
  if (!key || !isRecord(value)) return false;
  if (value.wordId !== undefined && (typeof value.wordId !== "string" || value.wordId.length === 0)) return false;
  if (typeof value.unitId !== "string" || value.unitId.length === 0) return false;
  if (!isSerializedCard(value.fsrsCard)) return false;
  if (value.skill !== undefined && !isMemorySkill(value.skill)) return false;
  return true;
}

function isLegacyMemoryRecord(wordId: string, value: unknown): boolean {
  if (!wordId || !isRecord(value)) return false;
  const hasDueAt = typeof value.dueAt === "string" && Number.isFinite(Date.parse(value.dueAt));
  const hasCard = isSerializedCard(value.card);
  const hasValidRating = value.lastRating === undefined || isReviewRating(value.lastRating);
  return (hasDueAt || hasCard) && hasValidRating;
}

function isImportableHistoryRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.wordId === "string" && value.wordId.length > 0
    && isIsoDate(value.reviewedAt)
    && isReviewRating(value.rawRating)
    && isHintLevel(value.hintLevel)
    && isFsrsRating(value.fsrsRating);
}

function isImportableEventRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.wordId === "string" && value.wordId.length > 0
    && isIsoDate(value.reviewedAt)
    && isMemorySkill(value.skill)
    && isHintLevel(value.hintLevel)
    && (isFsrsRating(value.fsrsRating) || value.fsrsRating === null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMemorySkill(value: unknown): boolean {
  return value === "jp_to_meaning" || value === "meaning_to_jp" || value === "kanji_to_reading"
    || value === "audio_to_meaning" || value === "context_to_word";
}

function isReviewRating(value: unknown): boolean {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
}

function isHintLevel(value: unknown): boolean {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

function isFsrsRating(value: unknown): boolean {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isIsoDate(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
