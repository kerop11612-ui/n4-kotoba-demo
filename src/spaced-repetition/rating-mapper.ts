import type { HintLevel, ReviewRating } from "./types.ts";

import { Rating } from "ts-fsrs";
import type { ReviewOutcome } from "./types.ts";

export function mapHintedRating(
  rawRating: ReviewRating,
  hintLevel: HintLevel,
  usedHint = hintLevel > 0,
): 1 | 2 | 3 | 4 {
  if (rawRating === "again") return 1;
  if (usedHint) return 1;
  const map: Record<ReviewRating, 1 | 2 | 3 | 4> = {
    again: 1,
    hard: 2,
    good: 3,
    easy: 4,
  };
  return map[rawRating];
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
