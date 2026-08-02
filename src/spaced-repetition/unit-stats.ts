import { currentRetrievability } from "./retrievability.ts";
import { calculateMasterySnapshot } from "./mastery.ts";
import type { ReviewHistoryRecord, UnitStats, VocabularyReviewEvent, WordMemoryRecord } from "./types.ts";

const DAY = 86_400_000;
const HORIZON_DAYS = 30;

export function calculateUnitStats(
  memories: WordMemoryRecord[],
  totalWords: number,
  history: ReviewHistoryRecord[] = [],
  now = new Date(),
  events: VocabularyReviewEvent[] = [],
): UnitStats {
  const total = Math.max(0, totalWords);
  const reviewed = memories.filter((memory) => memory.reviewCount > 0);
  const snapshots = memories.map((memory) => calculateMasterySnapshot(memory, now, HORIZON_DAYS));
  const currentRecallPercent = total
    ? Math.round(snapshots.reduce((sum, value) => sum + value.currentRecallPercent, 0) / total)
    : 0;
  const masteryPercent = total
    ? Math.round(snapshots.reduce((sum, value) => sum + value.masteryPercent, 0) / total)
    : 0;
  const reviewCount = snapshots.reduce((sum, value) => sum + value.reviewCount, 0);
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
  const rescued = history.filter((item) => item.hintLevel > 0);
  const success = (item: ReviewHistoryRecord) => item.rawRating === "good" || item.rawRating === "easy";
  const eventIndependent = events.filter((item) => item.recalledWithoutHint);
  const eventCorrect = events.filter((item) => item.correct);
  const independentRecallRate = events.length
    ? (eventIndependent.length ? eventIndependent.filter((item) => item.correct).length / eventIndependent.length : 0)
    : independent.length
      ? independent.filter(success).length / independent.length
      : null;
  const hintDependencyRate = events.length
    ? eventCorrect.length ? events.filter((item) => item.hintLevel > 0 && item.correct).length / eventCorrect.length : 0
    : rescued.length ? rescued.filter(success).length / (history.filter((item) => item.rawRating === "good" || item.rawRating === "easy").length || 1) : null;

  return {
    masteryPercent,
    currentRecallPercent,
    independentRecallRatePercent: independentRecallRate === null ? null : Math.round(independentRecallRate * 100),
    hintDependencyPercent: hintDependencyRate === null ? null : Math.round(hintDependencyRate * 100),
    reviewCount,
    horizonDays: HORIZON_DAYS,
    coveragePercent,
    reviewedWords: reviewed.length,
    totalWords: total,
    stableWords,
    reviewRecommendedWords,
    priorityReviewWords,
    dueToday: due.length,
    overdue: overdue.length,
    independentRecallRate: independentRecallRate === null ? null : Math.round(independentRecallRate * 100) / 100,
    hintRescueRate: rescued.length ? Math.round((rescued.filter(success).length / rescued.length) * 100) / 100 : null,
  };
}
