import { currentRetrievability } from "./retrievability.ts";
import type { ReviewHistoryRecord, UnitStats, WordMemoryRecord } from "./types.ts";

const DAY = 86_400_000;

export function calculateUnitStats(
  memories: WordMemoryRecord[],
  totalWords: number,
  history: ReviewHistoryRecord[] = [],
  now = new Date(),
): UnitStats {
  const total = Math.max(0, totalWords);
  const reviewed = memories.filter((memory) => memory.reviewCount > 0);
  const retrievals = memories.map((memory) => currentRetrievability(memory, now));
  const masteryPercent = total ? Math.round((retrievals.reduce((sum, value) => sum + value, 0) / total) * 100) : 0;
  const coveragePercent = total ? Math.round((reviewed.length / total) * 100) : 0;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = todayStart + DAY;
  const due = reviewed.filter((memory) => new Date(memory.fsrsCard.due).getTime() < tomorrowStart);
  const overdue = reviewed.filter((memory) => new Date(memory.fsrsCard.due).getTime() < todayStart);
  const stableWords = reviewed.filter((memory) => currentRetrievability(memory, now) >= 0.9).length;
  const reviewRecommendedWords = reviewed.filter((memory) => {
    const value = currentRetrievability(memory, now);
    return value >= 0.7 && value < 0.9;
  }).length;
  const priorityReviewWords = reviewed.filter((memory) => currentRetrievability(memory, now) < 0.7).length;
  const independent = history.filter((item) => item.hintLevel === 0);
  const rescued = history.filter((item) => item.hintLevel === 1 || item.hintLevel === 2);
  const success = (item: ReviewHistoryRecord) => item.rawRating === "good" || item.rawRating === "easy";
  return {
    masteryPercent,
    coveragePercent,
    reviewedWords: reviewed.length,
    totalWords: total,
    stableWords,
    reviewRecommendedWords,
    priorityReviewWords,
    dueToday: due.length,
    overdue: overdue.length,
    independentRecallRate: independent.length ? Math.round((independent.filter(success).length / independent.length) * 100) / 100 : null,
    hintRescueRate: rescued.length ? Math.round((rescued.filter(success).length / rescued.length) * 100) / 100 : null,
  };
}

