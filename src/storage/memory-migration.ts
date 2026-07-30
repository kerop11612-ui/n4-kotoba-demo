import { createWordMemory, isSerializedCard } from "../spaced-repetition/fsrs-adapter.ts";
import type { MemoryRepositoryData, ReviewRating, WordMemoryRecord } from "../spaced-repetition/types.ts";

export const MEMORY_SCHEMA_VERSION = 1;

export function emptyMemoryData(): MemoryRepositoryData {
  return { schemaVersion: MEMORY_SCHEMA_VERSION, memories: {}, history: [] };
}

export function migrateMemoryData(value: unknown, now = new Date()): MemoryRepositoryData {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Partial<MemoryRepositoryData>;
    if (candidate.schemaVersion === MEMORY_SCHEMA_VERSION && candidate.memories && typeof candidate.memories === "object") {
      return {
        schemaVersion: MEMORY_SCHEMA_VERSION,
        memories: Object.fromEntries(
          Object.entries(candidate.memories).filter(([, item]) => isMemoryRecord(item)),
        ) as Record<string, WordMemoryRecord>,
        history: Array.isArray(candidate.history) ? candidate.history.filter(isHistoryRecord) : [],
      };
    }
  }
  return migrateLegacyReviewState(value, now);
}

export function migrateLegacyReviewState(value: unknown, now = new Date()): MemoryRepositoryData {
  const data = emptyMemoryData();
  if (!value || typeof value !== "object" || Array.isArray(value)) return data;
  for (const [wordId, item] of Object.entries(value)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const legacy = item as { dueAt?: unknown; lastRating?: unknown; card?: unknown };
    const memory = createWordMemory(wordId, "legacy", now);
    if (typeof legacy.dueAt === "string" && legacy.card && isSerializedCard(legacy.card)) {
      memory.fsrsCard = legacy.card;
      memory.reviewCount = 1;
      memory.lastRawRating = isReviewRating(legacy.lastRating) ? legacy.lastRating : null;
      memory.lastFsrsRating = memory.lastRawRating ? ratingNumber(memory.lastRawRating) : null;
      memory.updatedAt = now.toISOString();
    }
    data.memories[wordId] = memory;
  }
  return data;
}

function isReviewRating(value: unknown): value is ReviewRating {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
}

function ratingNumber(value: ReviewRating): 1 | 2 | 3 | 4 {
  const map: Record<ReviewRating, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };
  return map[value];
}

function isMemoryRecord(value: unknown): value is WordMemoryRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WordMemoryRecord>;
  return typeof candidate.wordId === "string"
    && typeof candidate.unitId === "string"
    && isSerializedCard(candidate.fsrsCard)
    && isNonNegativeNumber(candidate.reviewCount)
    && isNonNegativeNumber(candidate.independentCorrectCount)
    && isNonNegativeNumber(candidate.hintedCorrectCount)
    && isNonNegativeNumber(candidate.lapseCount)
    && isHintLevelOrNull(candidate.lastHintLevel)
    && isReviewRatingOrNull(candidate.lastRawRating)
    && isFsrsRatingOrNull(candidate.lastFsrsRating)
    && isIsoDate(candidate.createdAt)
    && isIsoDate(candidate.updatedAt);
}

function isHistoryRecord(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { wordId?: unknown; reviewedAt?: unknown; rawRating?: unknown; hintLevel?: unknown; fsrsRating?: unknown };
  return typeof candidate.wordId === "string"
    && isIsoDate(candidate.reviewedAt)
    && isReviewRating(candidate.rawRating)
    && isHintLevel(candidate.hintLevel)
    && isFsrsRating(candidate.fsrsRating);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isHintLevel(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isHintLevelOrNull(value: unknown): value is 0 | 1 | 2 | 3 | null {
  return value === null || isHintLevel(value);
}

function isFsrsRating(value: unknown): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isFsrsRatingOrNull(value: unknown): value is 1 | 2 | 3 | 4 | null {
  return value === null || isFsrsRating(value);
}

function isReviewRatingOrNull(value: unknown): value is ReviewRating | null {
  return value === null || isReviewRating(value);
}

