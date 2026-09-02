import type { ReviewRating } from "./types.ts";

export type ReviewAttemptKind = "scheduled" | "diagnostic" | "retry" | "scaffold";

export type RatingMappingReason =
  | "independent_rating"
  | "incorrect"
  | "manual_hint"
  | "answer_revealed"
  | "instruction_only"
  | "legacy_unknown";

export interface ReviewEvidenceInput {
  rawUserRating: ReviewRating;
  correct: boolean;
  usedHint: boolean;
  answerRevealedBeforeResponse: boolean;
  answerFeedbackShownAfterResponse: boolean;
  attemptKind: ReviewAttemptKind;
  fsrsUpdateEligible: boolean;
  responseTimeMs: number;
}

export interface ReviewEvidenceDecision {
  updatesFsrs: boolean;
  effectiveFsrsRating: 1 | 2 | 3 | 4 | null;
  reason: RatingMappingReason;
  recalledIndependently: boolean;
}

const RATING_NUMBERS: Record<ReviewRating, 1 | 2 | 3 | 4> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

/**
 * Pure decision table for review evidence mapping.
 *
 * Decision order:
 * 1. fsrsUpdateEligible = false -> telemetry only (no FSRS update)
 * 2. incorrect                  -> Again (1)
 * 3. revealed before response   -> Again (1)
 * 4. manual hint                -> Again (1)
 * 5. otherwise                  -> preserve raw rating
 */
export function deriveReviewEvidence(input: ReviewEvidenceInput): ReviewEvidenceDecision {
  if (!input.fsrsUpdateEligible) {
    return {
      updatesFsrs: false,
      effectiveFsrsRating: null,
      reason: input.attemptKind === "scaffold" ? "instruction_only" : (
        !input.correct
          ? "incorrect"
          : input.answerRevealedBeforeResponse
            ? "answer_revealed"
            : input.usedHint
              ? "manual_hint"
              : "independent_rating"
      ),
      recalledIndependently: input.correct && !input.usedHint && !input.answerRevealedBeforeResponse,
    };
  }

  if (!input.correct) {
    return {
      updatesFsrs: true,
      effectiveFsrsRating: 1,
      reason: "incorrect",
      recalledIndependently: false,
    };
  }

  if (input.answerRevealedBeforeResponse) {
    return {
      updatesFsrs: true,
      effectiveFsrsRating: 1,
      reason: "answer_revealed",
      recalledIndependently: false,
    };
  }

  if (input.usedHint) {
    return {
      updatesFsrs: true,
      effectiveFsrsRating: 1,
      reason: "manual_hint",
      recalledIndependently: false,
    };
  }

  return {
    updatesFsrs: true,
    effectiveFsrsRating: RATING_NUMBERS[input.rawUserRating],
    reason: "independent_rating",
    recalledIndependently: true,
  };
}
