import { currentRetrievability } from "./retrievability.ts";
import { calculateMasterySnapshot, getLearningStatus, MASTERY_MIN_REVIEWS } from "./mastery.ts";
import type { ReviewHistoryRecord, UnitStats, VocabularyReviewEvent, WordMemoryRecord } from "./types.ts";

const DAY = 86_400_000;
const HORIZON_DAYS = 30;

export function filterUnitEvidence<T extends { wordId: string }>(
  items: T[],
  wordIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => wordIds.has(item.wordId));
}

export function calculateUnitStats(
  memories: WordMemoryRecord[],
  totalWords: number,
  history: ReviewHistoryRecord[] = [],
  now = new Date(),
  events: VocabularyReviewEvent[] = [],
): UnitStats {
  const total = Math.max(0, totalWords);
  const uniqueMemories = deduplicateMemories(memories);
  const learningStatusCounts = {
    "尚未練習": 0,
    "需要加強": 0,
    "學習中": 0,
    "已熟悉": 0,
    "手動已學會": 0,
  };
  for (const memory of uniqueMemories) learningStatusCounts[getLearningStatus(memory, now)] += 1;
  learningStatusCounts["尚未練習"] += Math.max(0, total - uniqueMemories.length);
  const reviewed = uniqueMemories.filter((memory) => memory.reviewCount > 0);
  const snapshots = reviewed.map((memory) => calculateMasterySnapshot(memory, now, HORIZON_DAYS));
  const currentRecallPercent = reviewed.length
    ? Math.round(snapshots.reduce((sum, value) => sum + value.currentRecallPercent, 0) / reviewed.length)
    : 0;
  const masteryPercent = reviewed.length
    ? Math.round(snapshots.reduce((sum, value) => sum + value.masteryPercent, 0) / reviewed.length)
    : 0;
  const reviewCount = snapshots.reduce((sum, value) => sum + value.reviewCount, 0);
  const masteryReadyWords = reviewed.filter((memory) => memory.reviewCount >= MASTERY_MIN_REVIEWS).length;
  const masteryDataReady = reviewed.length > 0 && masteryReadyWords >= Math.min(MASTERY_MIN_REVIEWS, reviewed.length);
  const coveragePercent = total ? Math.min(100, Math.round((reviewed.length / total) * 100)) : 0;
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
  const independent = history.filter(isIndependentAttempt);
  const rescued = history.filter(isManualHint);
  const success = (item: ReviewHistoryRecord) => item.rawRating === "good" || item.rawRating === "easy";
  const historyIndependentCorrect = independent.filter((item) => {
    const correct = item.correct ?? success(item);
    if (!correct) return false;
    if (item.recalledWithoutHint !== false) return true;
    return item.reviewFormat !== "cloze" || (item.answerAttempts ?? 0) <= 1;
  });
  const eventIndependent = events.filter(isIndependentAttempt);
  const eventIndependentCorrect = eventIndependent.filter((item) => item.correct && item.recalledWithoutHint !== false);
  const eventCorrect = events.filter((item) => item.correct);
  const independentRecallRate = history.length
    ? (independent.length ? historyIndependentCorrect.length / independent.length : 0)
    : events.length
      ? (eventIndependent.length ? eventIndependentCorrect.length / eventIndependent.length : 0)
      : null;
  const hintDependencyRate = events.length
    ? eventCorrect.length ? events.filter((item) => isManualHint(item) && item.correct).length / eventCorrect.length : 0
    : rescued.length ? rescued.filter(success).length / (history.filter((item) => item.rawRating === "good" || item.rawRating === "easy").length || 1) : null;

  return {
    masteryPercent,
    masteryReadyWords,
    masteryDataReady,
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
    learningStatusCounts,
  };
}

function deduplicateMemories(memories: WordMemoryRecord[]): WordMemoryRecord[] {
  const unique = new Map<string, WordMemoryRecord>();
  for (const memory of memories) {
    const existing = unique.get(memory.wordId);
    if (!existing || memory.reviewCount > existing.reviewCount || memory.updatedAt > existing.updatedAt) {
      unique.set(memory.wordId, memory);
    }
  }
  return [...unique.values()];
}

function isManualHint(item: { hintLevel: number; usedHint?: boolean }): boolean {
  return item.usedHint ?? item.hintLevel > 0;
}

function isIndependentAttempt(item: { hintLevel: number; usedHint?: boolean; answerRevealed?: boolean }): boolean {
  return !isManualHint(item) && item.answerRevealed !== true && item.hintLevel === 0;
}
