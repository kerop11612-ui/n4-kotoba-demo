import type { HintLevel, ReviewFormat, ReviewRating } from "./types.ts";

export type ReviewSummaryResult = {
  rawRating?: ReviewRating;
  hintLevel: HintLevel;
  reviewFormat?: ReviewFormat;
  usedHint?: boolean;
  answerRevealed?: boolean;
};

/**
 * Manual hints are different from the normal step of revealing the answer.
 * The optional boolean keeps the summary accurate when a learner used a hint
 * and then revealed the answer afterward.
 */
export function didUseManualHint(result: ReviewSummaryResult): boolean {
  if (typeof result.usedHint === "boolean") return result.usedHint;
  if (result.reviewFormat === "jp-to-zh") return result.hintLevel > 0 && result.hintLevel < 3;
  if (result.reviewFormat === "zh-to-jp") return result.hintLevel > 0 && result.hintLevel < 4;
  return result.hintLevel > 0;
}

/**
 * Answer reveals remain useful context in the completion summary, but are not
 * reported as a manual hint.
 */
export function didRevealAnswer(result: ReviewSummaryResult): boolean {
  if (typeof result.answerRevealed === "boolean") return result.answerRevealed;
  if (result.reviewFormat === "jp-to-zh") return result.hintLevel >= 3;
  if (result.reviewFormat === "zh-to-jp") return result.hintLevel >= 4;
  return false;
}

export function needsImmediateRetry(result: ReviewSummaryResult): boolean {
  return result.rawRating === "again" || didUseManualHint(result);
}
