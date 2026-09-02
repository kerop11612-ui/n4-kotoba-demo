import {
  createEmptyCard,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";
import { fsrsScheduler } from "./fsrs-config.ts";
import type {
  HintLevel,
  MemorySkill,
  ReviewHistoryRecord,
  ReviewContext,
  ReviewRating,
  SerializedFsrsCard,
  VocabularyReviewEvent,
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
  if (!isSerializedCard(card)) {
    throw new Error("FSRS 卡片資料無效");
  }
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
  skill: MemorySkill = "jp_to_meaning",
): WordMemoryRecord {
  return {
    wordId,
    unitId,
    skill,
    fsrsCard: serializeCard(createEmptyCard(now)),
    reviewCount: 0,
    independentCorrectCount: 0,
    hintedCorrectCount: 0,
    lapseCount: 0,
    againStreak: 0,
    manualMastered: false,
    manualMasteredAt: null,
    manualNextReviewAt: null,
    lastHintLevel: null,
    lastRawRating: null,
    lastFsrsRating: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

import { deriveReviewEvidence, type ReviewAttemptKind } from "./review-evidence.ts";
import { CURRENT_FSRS_PROFILE, getSchedulerProfile, createSchedulerForProfile } from "./scheduler-profile.ts";

export function createTelemetryOnlyReviewEvent(
  memory: WordMemoryRecord,
  rawRating: ReviewRating,
  hintLevel: HintLevel,
  now = new Date(),
  responseTimeMs?: number,
  reviewContext?: ReviewContext,
): VocabularyReviewEvent {
  const usedHint = reviewContext?.usedHint ?? hintLevel > 0;
  const answerRevealedBeforeResponse = reviewContext?.answerRevealedBeforeResponse
    ?? reviewContext?.answerRevealed
    ?? false;
  const answerFeedbackShownAfterResponse = reviewContext?.answerFeedbackShownAfterResponse ?? false;
  const answerRevealed = answerRevealedBeforeResponse || answerFeedbackShownAfterResponse;
  const attemptKind: ReviewAttemptKind = reviewContext?.attemptKind ?? "retry";
  const correct = reviewContext?.correct ?? rawRating !== "again";
  const safeResponseMs = Number.isFinite(responseTimeMs) && (responseTimeMs ?? 0) >= 0
    ? responseTimeMs ?? 0
    : 0;
  const skill = reviewContext?.skill ?? memory.skill ?? "jp_to_meaning";
  const reviewedAt = now.toISOString();
  const eventId = reviewContext?.eventId
    ?? `${memory.wordId}:${skill}:${memory.reviewCount + 1}:${memory.updatedAt}`;
  const errorTypes = reviewContext?.errorTypes ? [...new Set(reviewContext.errorTypes)] : [];

  const evidence = deriveReviewEvidence({
    rawUserRating: rawRating,
    correct,
    usedHint,
    answerRevealedBeforeResponse,
    answerFeedbackShownAfterResponse,
    attemptKind,
    fsrsUpdateEligible: false,
    responseTimeMs: safeResponseMs,
  });

  const beforeCard = deserializeCard(memory.fsrsCard);
  const beforeRetrievability = memory.reviewCount
    ? safeRetrievability(beforeCard, now)
    : 0;

  return {
    id: eventId,
    wordId: memory.wordId,
    unitId: memory.unitId,
    skill,
    reviewedAt,
    correct,
    recalledWithoutHint: evidence.recalledIndependently,
    hintLevel,
    usedHint,
    answerRevealed,
    answerRevealedBeforeResponse,
    answerFeedbackShownAfterResponse,
    responseMs: safeResponseMs,
    errorTypes,
    hintKinds: reviewContext?.hintKinds ? [...new Set(reviewContext.hintKinds)] : undefined,
    confusedWordIds: reviewContext?.confusedWordIds ?? [],
    predictedRecallBeforeReview: beforeRetrievability,
    fsrsRating: null,
    reviewCountBefore: memory.reviewCount,
    rawUserRating: rawRating,
    effectiveFsrsRating: null,
    ratingMappingReason: evidence.reason,
    attemptKind,
    scheduledAt: reviewContext?.scheduledAt ?? memory.fsrsCard.due,
    sessionId: reviewContext?.sessionId,
    schedulerProfileId: reviewContext?.schedulerProfileId ?? CURRENT_FSRS_PROFILE.id,
  };
}

export function reviewWordMemory(
  memory: WordMemoryRecord,
  rawRating: ReviewRating,
  hintLevel: HintLevel,
  now = new Date(),
  responseTimeMs?: number,
  reviewContext?: ReviewContext,
): { memory: WordMemoryRecord; history: ReviewHistoryRecord; event: VocabularyReviewEvent } {
  const usedHint = reviewContext?.usedHint ?? hintLevel > 0;
  const answerRevealedBeforeResponse = reviewContext?.answerRevealedBeforeResponse
    ?? (reviewContext?.answerRevealed && !reviewContext?.answerFeedbackShownAfterResponse)
    ?? false;
  const answerFeedbackShownAfterResponse = reviewContext?.answerFeedbackShownAfterResponse ?? false;
  const answerRevealed = answerRevealedBeforeResponse || answerFeedbackShownAfterResponse || (reviewContext?.answerRevealed ?? false);
  const attemptKind: ReviewAttemptKind = reviewContext?.attemptKind ?? "scheduled";
  const fsrsUpdateEligible = reviewContext?.fsrsUpdateEligible ?? (attemptKind === "scheduled" || attemptKind === "diagnostic");
  const correct = reviewContext?.correct ?? rawRating !== "again";
  const safeResponseMs = Number.isFinite(responseTimeMs) && (responseTimeMs ?? 0) >= 0
    ? responseTimeMs ?? 0
    : 0;

  const evidence = deriveReviewEvidence({
    rawUserRating: rawRating,
    correct,
    usedHint,
    answerRevealedBeforeResponse,
    answerFeedbackShownAfterResponse,
    attemptKind,
    fsrsUpdateEligible,
    responseTimeMs: safeResponseMs,
  });

  if (!evidence.updatesFsrs || evidence.effectiveFsrsRating === null) {
    throw new Error(`reviewWordMemory 被非 FSRS 測量呼叫 (${evidence.reason})，請改用 createTelemetryOnlyReviewEvent`);
  }

  const fsrsRating = evidence.effectiveFsrsRating;
  const scheduler = reviewContext?.schedulerProfileId
    ? createSchedulerForProfile(getSchedulerProfile(reviewContext.schedulerProfileId))
    : fsrsScheduler;

  const beforeCard = deserializeCard(memory.fsrsCard);
  const beforeRetrievability = memory.reviewCount
    ? safeRetrievability(beforeCard, now)
    : 0;
  const result = scheduler.next(beforeCard, now, gradeByNumber[fsrsRating]);
  const recalledWithoutHint = reviewContext?.recalledWithoutHint ?? evidence.recalledIndependently;
  const skill = reviewContext?.skill ?? memory.skill ?? "jp_to_meaning";
  const reviewedAt = now.toISOString();
  const eventId = reviewContext?.eventId
    ?? `${memory.wordId}:${skill}:${memory.reviewCount + 1}:${memory.updatedAt}`;
  const errorTypes = reviewContext?.errorTypes ? [...new Set(reviewContext.errorTypes)] : [];
  const profileId = reviewContext?.schedulerProfileId ?? CURRENT_FSRS_PROFILE.id;
  const scheduledAt = reviewContext?.scheduledAt ?? beforeCard.due.toISOString();

  const nextMemory: WordMemoryRecord = {
    ...memory,
    skill,
    fsrsCard: serializeCard(result.card),
    reviewCount: memory.reviewCount + 1,
    independentCorrectCount:
      memory.independentCorrectCount + (recalledWithoutHint && correct ? 1 : 0),
    hintedCorrectCount:
      memory.hintedCorrectCount + (usedHint && correct ? 1 : 0),
    lapseCount: memory.lapseCount + (fsrsRating === 1 ? 1 : 0),
    againStreak: fsrsRating === 1 ? memory.againStreak + 1 : 0,
    manualMastered: fsrsRating === 1 ? false : memory.manualMastered,
    manualMasteredAt: fsrsRating === 1 ? null : memory.manualMasteredAt ?? null,
    manualNextReviewAt: fsrsRating === 1 ? null : memory.manualNextReviewAt ?? null,
    lastHintLevel: hintLevel,
    lastRawRating: rawRating,
    lastFsrsRating: fsrsRating,
    updatedAt: reviewedAt,
  };
  const history: ReviewHistoryRecord = {
    id: eventId,
    wordId: memory.wordId,
    unitId: memory.unitId,
    skill,
    reviewedAt,
    rawRating,
    hintLevel,
    fsrsRating,
    reviewFormat: reviewContext?.reviewFormat,
    answerCorrect: reviewContext?.answerCorrect,
    answerAttempts: reviewContext?.answerAttempts,
    usedHint,
    answerRevealed,
    answerRevealedBeforeResponse,
    answerFeedbackShownAfterResponse,
    responseTimeMs: safeResponseMs,
    correct,
    recalledWithoutHint,
    errorTypes,
    hintKinds: reviewContext?.hintKinds ? [...new Set(reviewContext.hintKinds)] : undefined,
    confusedWordIds: reviewContext?.confusedWordIds ?? [],
    retrievabilityBefore: beforeRetrievability,
    retrievabilityAfter: safeRetrievability(result.card, now),
    stabilityBefore: beforeCard.stability,
    stabilityAfter: result.card.stability,
    difficultyBefore: beforeCard.difficulty,
    difficultyAfter: result.card.difficulty,
    dueBefore: beforeCard.due.toISOString(),
    dueAfter: result.card.due.toISOString(),
    rawUserRating: rawRating,
    effectiveFsrsRating: fsrsRating,
    ratingMappingReason: evidence.reason,
    attemptKind,
    scheduledAt,
    sessionId: reviewContext?.sessionId,
    schedulerProfileId: profileId,
  };
  const event: VocabularyReviewEvent = {
    id: eventId,
    wordId: memory.wordId,
    unitId: memory.unitId,
    skill,
    reviewedAt,
    correct,
    recalledWithoutHint,
    hintLevel,
    usedHint,
    answerRevealed,
    answerRevealedBeforeResponse,
    answerFeedbackShownAfterResponse,
    responseMs: safeResponseMs,
    errorTypes,
    hintKinds: reviewContext?.hintKinds ? [...new Set(reviewContext.hintKinds)] : undefined,
    confusedWordIds: reviewContext?.confusedWordIds ?? [],
    predictedRecallBeforeReview: beforeRetrievability,
    fsrsRating,
    reviewCountBefore: memory.reviewCount,
    rawUserRating: rawRating,
    effectiveFsrsRating: fsrsRating,
    ratingMappingReason: evidence.reason,
    attemptKind,
    scheduledAt,
    sessionId: reviewContext?.sessionId,
    schedulerProfileId: profileId,
  };
  return { memory: nextMemory, history, event };
}

function safeRetrievability(card: Card, now: Date): number {
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(card.stability) || card.stability <= 0) return 0;
  const value = fsrsScheduler.get_retrievability(card, now, false);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function isSerializedCard(value: unknown): value is SerializedFsrsCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<SerializedFsrsCard>;
  return (
    typeof candidate.due === "string" && Number.isFinite(Date.parse(candidate.due)) &&
    isNonNegativeFinite(candidate.stability) &&
    isNonNegativeFinite(candidate.difficulty) && candidate.difficulty <= 10 &&
    isNonNegativeInteger(candidate.elapsed_days) &&
    isNonNegativeInteger(candidate.scheduled_days) &&
    isNonNegativeInteger(candidate.reps) &&
    isNonNegativeInteger(candidate.lapses) &&
    isNonNegativeInteger(candidate.learning_steps) &&
    isNonNegativeInteger(candidate.state) && candidate.state <= 3 &&
    (candidate.last_review === undefined || (typeof candidate.last_review === "string" && Number.isFinite(Date.parse(candidate.last_review))))
  );
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFinite(value) && Number.isInteger(value);
}
