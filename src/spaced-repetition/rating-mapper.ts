import type { HintLevel, ReviewRating } from "./types.ts";

export function mapHintedRating(
  rawRating: ReviewRating,
  hintLevel: HintLevel,
): 1 | 2 | 3 | 4 {
  if (rawRating === "again") return 1;
  if (hintLevel === 3) return 1;
  if (hintLevel === 2) return 2;
  if (hintLevel === 1) return rawRating === "easy" ? 3 : 2;
  const map: Record<ReviewRating, 1 | 2 | 3 | 4> = {
    again: 1,
    hard: 2,
    good: 3,
    easy: 4,
  };
  return map[rawRating];
}

