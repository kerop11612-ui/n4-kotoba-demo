import {
  createEmptyCard,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";
import { fsrsScheduler } from "./fsrs-config.ts";
import { mapHintedRating } from "./rating-mapper.ts";
import type {
  HintLevel,
  ReviewHistoryRecord,
  ReviewRating,
  SerializedFsrsCard,
  WordMemoryRecord,
} from "./types.ts";

const gradeByNumber: Record<1 | 2 | 3 | 4, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

export function serializeCard(card: Card): SerializedFsrsCard {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString(),
  };
}

export function deserializeCard(card: SerializedFsrsCard): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

export function createWordMemory(
  wordId: string,
  unitId: string,
  now = new Date(),
): WordMemoryRecord {
  return {
    wordId,
    unitId,
    fsrsCard: serializeCard(createEmptyCard(now)),
    reviewCount: 0,
    independentCorrectCount: 0,
    hintedCorrectCount: 0,
    lapseCount: 0,
    lastHintLevel: null,
    lastRawRating: null,
    lastFsrsRating: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function reviewWordMemory(
  memory: WordMemoryRecord,
  rawRating: ReviewRating,
  hintLevel: HintLevel,
  now = new Date(),
  responseTimeMs?: number,
): { memory: WordMemoryRecord; history: ReviewHistoryRecord } {
  const fsrsRating = mapHintedRating(rawRating, hintLevel);
  const beforeCard = deserializeCard(memory.fsrsCard);
  const beforeRetrievability = memory.reviewCount
    ? fsrsScheduler.get_retrievability(beforeCard, now, false)
    : 0;
  const result = fsrsScheduler.next(beforeCard, now, gradeByNumber[fsrsRating]);
  const nextMemory: WordMemoryRecord = {
    ...memory,
    fsrsCard: serializeCard(result.card),
    reviewCount: memory.reviewCount + 1,
    independentCorrectCount:
      memory.independentCorrectCount +
      (hintLevel === 0 && (rawRating === "good" || rawRating === "easy") ? 1 : 0),
    hintedCorrectCount:
      memory.hintedCorrectCount +
      (hintLevel > 0 && hintLevel < 3 &&
      (rawRating === "good" || rawRating === "easy")
        ? 1
        : 0),
    lapseCount: memory.lapseCount + (fsrsRating === 1 ? 1 : 0),
    lastHintLevel: hintLevel,
    lastRawRating: rawRating,
    lastFsrsRating: fsrsRating,
    updatedAt: now.toISOString(),
  };
  const history: ReviewHistoryRecord = {
    id: `${memory.wordId}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    wordId: memory.wordId,
    unitId: memory.unitId,
    reviewedAt: now.toISOString(),
    rawRating,
    hintLevel,
    fsrsRating,
    responseTimeMs,
    retrievabilityBefore: beforeRetrievability,
    retrievabilityAfter: fsrsScheduler.get_retrievability(result.card, now, false),
    stabilityBefore: beforeCard.stability,
    stabilityAfter: result.card.stability,
    difficultyBefore: beforeCard.difficulty,
    difficultyAfter: result.card.difficulty,
    dueBefore: beforeCard.due.toISOString(),
    dueAfter: result.card.due.toISOString(),
  };
  return { memory: nextMemory, history };
}

export function isSerializedCard(value: unknown): value is SerializedFsrsCard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SerializedFsrsCard>;
  return (
    typeof candidate.due === "string" && Number.isFinite(Date.parse(candidate.due)) &&
    typeof candidate.stability === "number" &&
    typeof candidate.difficulty === "number" &&
    typeof candidate.state === "number" &&
    (candidate.last_review === undefined || (typeof candidate.last_review === "string" && Number.isFinite(Date.parse(candidate.last_review))))
  );
}

