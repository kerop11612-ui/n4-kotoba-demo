import type { HintLevel, ReviewRating } from "./types.ts";

import { Rating } from "ts-fsrs";
import type { ReviewOutcome } from "./types.ts";
import { deriveReviewEvidence } from "./review-evidence.ts";

export function mapHintedRating(
  rawRating: ReviewRating,
  hintLevel: HintLevel,
  usedHint = hintLevel > 0,
): 1 | 2 | 3 | 4 {
  const decision = deriveReviewEvidence({
    rawUserRating: rawRating,
    correct: rawRating !== "again",
    usedHint,
    answerRevealedBeforeResponse: false,
    answerFeedbackShownAfterResponse: false,
    attemptKind: "scheduled",
    fsrsUpdateEligible: true,
    responseTimeMs: 0,
  });
  return (decision.effectiveFsrsRating ?? 1) as 1 | 2 | 3 | 4;
}

/**
 * A manually hinted answer is not an independent retrieval success, so it is
 * treated as a retrieval failure for FSRS. Simply revealing the answer is a
 * normal review step and keeps the learner's raw rating.
 */
export function mapOutcomeToFsrsRating(outcome: ReviewOutcome): Rating {
  if (!outcome.correct || outcome.usedHint) return Rating.Again;
  if (outcome.struggled) return Rating.Hard;
  return Rating.Good;
}

