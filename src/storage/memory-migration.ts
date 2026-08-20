import { createWordMemory, isSerializedCard } from "../spaced-repetition/fsrs-adapter.ts";
import type {
  MemoryRepositoryData,
  MemorySkill,
  ReviewErrorType,
  ReviewFormat,
  ReviewHistoryRecord,
  ReviewRating,
  VocabularyReviewEvent,
  WordMemoryRecord,
} from "../spaced-repetition/types.ts";
import { getMemoryKey } from "../spaced-repetition/types.ts";
import { MANUAL_MASTERY_MATURE_REVIEW_DAYS, MANUAL_MASTERY_REVIEW_DAYS } from "../spaced-repetition/mastery.ts";

export const MEMORY_SCHEMA_VERSION = 2;

export class UnsupportedMemorySchemaError extends Error {
  constructor(version: unknown) {
    super(`不支援的學習資料版本: ${String(version)}`);
    this.name = "UnsupportedMemorySchemaError";
  }
}

export function emptyMemoryData(): MemoryRepositoryData {
  return { schemaVersion: MEMORY_SCHEMA_VERSION, memories: {}, history: [], events: [] };
}

export function migrateWordMemoryRecord(
  input: unknown,
  now = new Date(),
): WordMemoryRecord {
  const candidate = isRecord(input) ? input : {};
  const wordId = stringOr(candidate.wordId, "unknown");
  const unitId = stringOr(candidate.unitId, "legacy");
  const skill = isMemorySkill(candidate.skill) ? candidate.skill : "jp_to_meaning";
  const createdAt = isoOr(candidate.createdAt, now.toISOString());
  const updatedAt = isoOr(candidate.updatedAt, createdAt);
  const base = createWordMemory(wordId, unitId, new Date(createdAt), skill);
  const reviewCount = nonNegative(candidate.reviewCount);
  const fsrsCard = isSerializedCard(candidate.fsrsCard) ? candidate.fsrsCard : base.fsrsCard;
  const lastRawRating = isReviewRatingOrNull(candidate.lastRawRating) ? candidate.lastRawRating : null;
  const lastFsrsRating = isFsrsRatingOrNull(candidate.lastFsrsRating) ? candidate.lastFsrsRating : null;
  const againStreak = candidate.againStreak === undefined
    ? (lastFsrsRating === 1 || lastRawRating === "again" ? 1 : 0)
    : Math.min(nonNegative(candidate.againStreak), reviewCount);
  const manualMastered = candidate.manualMastered === true;
  const manualMasteredAt = manualMastered
    ? isoOr(candidate.manualMasteredAt, updatedAt)
    : null;
  const manualReviewDays = reviewCount >= 3
    ? MANUAL_MASTERY_MATURE_REVIEW_DAYS
    : MANUAL_MASTERY_REVIEW_DAYS;
  const fallbackManualNextReviewAt = manualMasteredAt
    ? new Date(Date.parse(manualMasteredAt) + manualReviewDays * 86_400_000).toISOString()
    : null;
  const manualNextReviewAt = manualMastered
    ? isoOr(candidate.manualNextReviewAt, fallbackManualNextReviewAt ?? updatedAt)
    : null;

  return {
    ...candidate,
    ...base,
    wordId,
    unitId,
    skill,
    fsrsCard,
    reviewCount,
    independentCorrectCount: Math.min(nonNegative(candidate.independentCorrectCount), reviewCount),
    hintedCorrectCount: Math.min(nonNegative(candidate.hintedCorrectCount), reviewCount),
    lapseCount: Math.min(nonNegative(candidate.lapseCount), reviewCount),
    againStreak,
    manualMastered,
    manualMasteredAt,
    manualNextReviewAt,
    lastHintLevel: isHintLevelOrNull(candidate.lastHintLevel) ? candidate.lastHintLevel : null,
    lastRawRating,
    lastFsrsRating,
    createdAt,
    updatedAt,
  } as WordMemoryRecord;
}

export function migrateMemoryData(value: unknown, now = new Date()): MemoryRepositoryData {
  if (isRecord(value) && "schemaVersion" in value && value.schemaVersion !== 1 && value.schemaVersion !== MEMORY_SCHEMA_VERSION) {
    throw new UnsupportedMemorySchemaError(value.schemaVersion);
  }
  if (isRecord(value) && (value.schemaVersion === 1 || value.schemaVersion === MEMORY_SCHEMA_VERSION)) {
    const memories: Record<string, WordMemoryRecord> = {};
    if (isRecord(value.memories)) {
      for (const [key, item] of Object.entries(value.memories)) {
        const candidate = isRecord(item) ? item : {};
        const normalized = migrateWordMemoryRecord(
          {
            ...candidate,
            wordId: stringOr(candidate.wordId, key.split(":")[0]),
            skill: isMemorySkill(candidate.skill) ? candidate.skill : skillFromKey(key),
          },
          now,
        );
        memories[getMemoryKey(normalized.wordId, normalized.skill)] = normalized;
      }
    }
    return {
      schemaVersion: MEMORY_SCHEMA_VERSION,
      memories,
      history: Array.isArray(value.history)
        ? value.history.map((item) => migrateHistoryRecord(item)).filter(isHistoryRecord)
        : [],
      events: Array.isArray(value.events)
        ? value.events.map((item) => migrateReviewEvent(item)).filter(isReviewEvent)
        : [],
    };
  }
  return migrateLegacyReviewState(value, now);
}

export function migrateLegacyReviewState(value: unknown, now = new Date()): MemoryRepositoryData {
  const data = emptyMemoryData();
  if (!isRecord(value)) return data;
  for (const [wordId, item] of Object.entries(value)) {
    if (!isRecord(item)) continue;
    const memory = createWordMemory(wordId, "legacy", now, "jp_to_meaning");
    if (item.card && isSerializedCard(item.card)) {
      memory.fsrsCard = item.card;
      memory.reviewCount = 1;
      memory.lastRawRating = isReviewRating(item.lastRating) ? item.lastRating : null;
      memory.lastFsrsRating = memory.lastRawRating ? ratingNumber(memory.lastRawRating) : null;
      memory.againStreak = memory.lastFsrsRating === 1 ? 1 : 0;
      memory.updatedAt = now.toISOString();
    }
    data.memories[getMemoryKey(memory.wordId, memory.skill)] = memory;
  }
  return data;
}

function migrateHistoryRecord(input: unknown): ReviewHistoryRecord | null {
  if (!isRecord(input) || typeof input.wordId !== "string" || !isIsoDate(input.reviewedAt)) return null;
  if (!isReviewRating(input.rawRating) || !isHintLevel(input.hintLevel) || !isFsrsRating(input.fsrsRating)) return null;
  return {
    ...input,
    id: stringOr(input.id, `${input.wordId}-${input.reviewedAt}`),
    wordId: input.wordId,
    unitId: stringOr(input.unitId, "legacy"),
    skill: isMemorySkill(input.skill) ? input.skill : "jp_to_meaning",
    reviewedAt: input.reviewedAt,
    rawRating: input.rawRating,
    hintLevel: input.hintLevel,
    fsrsRating: input.fsrsRating,
    reviewFormat: isReviewFormat(input.reviewFormat) ? input.reviewFormat : undefined,
    responseTimeMs: finiteNonNegativeOrUndefined(input.responseTimeMs),
    correct: typeof input.correct === "boolean" ? input.correct : undefined,
    recalledWithoutHint: typeof input.recalledWithoutHint === "boolean"
      ? input.recalledWithoutHint
      : input.correct === true && input.hintLevel === 0,
    errorTypes: Array.isArray(input.errorTypes) ? input.errorTypes.filter(isReviewErrorType) : [],
    confusedWordIds: Array.isArray(input.confusedWordIds) ? input.confusedWordIds.filter((item): item is string => typeof item === "string").slice(0, 3) : [],
  } as ReviewHistoryRecord;
}

function migrateReviewEvent(input: unknown): VocabularyReviewEvent | null {
  if (!isRecord(input) || typeof input.wordId !== "string" || !isIsoDate(input.reviewedAt)) return null;
  if (!isMemorySkill(input.skill) || !isHintLevel(input.hintLevel) || !isFsrsRating(input.fsrsRating)) return null;
  return {
    ...input,
    id: stringOr(input.id, `${input.wordId}-${input.reviewedAt}`),
    wordId: input.wordId,
    unitId: stringOr(input.unitId, "legacy"),
    skill: input.skill,
    reviewedAt: input.reviewedAt,
    correct: input.correct === true,
    recalledWithoutHint: typeof input.recalledWithoutHint === "boolean"
      ? input.recalledWithoutHint
      : input.correct === true && input.hintLevel === 0,
    hintLevel: input.hintLevel,
    responseMs: finiteNonNegative(input.responseMs),
    errorTypes: Array.isArray(input.errorTypes) ? input.errorTypes.filter(isReviewErrorType) : [],
    confusedWordIds: Array.isArray(input.confusedWordIds) ? input.confusedWordIds.filter((item): item is string => typeof item === "string").slice(0, 3) : [],
    predictedRecallBeforeReview: clamp(finiteNumber(input.predictedRecallBeforeReview), 0, 1),
    fsrsRating: input.fsrsRating,
    reviewCountBefore: finiteNonNegative(input.reviewCountBefore),
  } as VocabularyReviewEvent;
}

function isHistoryRecord(value: ReviewHistoryRecord | null): value is ReviewHistoryRecord {
  return value !== null;
}

function isReviewEvent(value: VocabularyReviewEvent | null): value is VocabularyReviewEvent {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMemorySkill(value: unknown): value is MemorySkill {
  return value === "jp_to_meaning" || value === "meaning_to_jp" || value === "kanji_to_reading"
    || value === "audio_to_meaning" || value === "context_to_word";
}

function skillFromKey(value: string): MemorySkill {
  const skill = value.split(":").at(-1);
  return isMemorySkill(skill) ? skill : "jp_to_meaning";
}

function isReviewRating(value: unknown): value is ReviewRating {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
}

function isReviewRatingOrNull(value: unknown): value is ReviewRating | null {
  return value === null || isReviewRating(value);
}

function ratingNumber(value: ReviewRating): 1 | 2 | 3 | 4 {
  if (value === "again") return 1;
  if (value === "hard") return 2;
  if (value === "good") return 3;
  return 4;
}

function isReviewFormat(value: unknown): value is ReviewFormat {
  return value === "jp-to-zh" || value === "zh-to-jp" || value === "cloze";
}

function isReviewErrorType(value: unknown): value is ReviewErrorType {
  return value === "meaning" || value === "reading" || value === "kanji" || value === "pronunciation"
    || value === "confused_word" || value === "context" || value === "slow_recall";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isoOr(value: unknown, fallback: string): string {
  return isIsoDate(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function finiteNonNegative(value: unknown): number {
  return Math.max(0, finiteNumber(value));
}

function finiteNonNegativeOrUndefined(value: unknown): number | undefined {
  return value === undefined ? undefined : finiteNonNegative(value);
}

function nonNegative(value: unknown): number {
  return finiteNonNegative(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isHintLevel(value: unknown): value is 0 | 1 | 2 | 3 | 4 {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

function isHintLevelOrNull(value: unknown): value is 0 | 1 | 2 | 3 | 4 | null {
  return value === null || isHintLevel(value);
}

function isFsrsRating(value: unknown): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isFsrsRatingOrNull(value: unknown): value is 1 | 2 | 3 | 4 | null {
  return value === null || isFsrsRating(value);
}
