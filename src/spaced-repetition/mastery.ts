import { currentRetrievability } from "./retrievability.ts";
import type { WordMemoryRecord } from "./types.ts";

export interface MasterySnapshot {
  currentRecallPercent: number;
  masteryPercent: number;
  independentRecallRatePercent: number;
  hintDependencyPercent: number;
  reviewCount: number;
  horizonDays: number;
}

export type LearningStatus = "尚未練習" | "需要加強" | "學習中" | "已熟悉" | "手動已學會";

const DAY = 86_400_000;
export const MASTERY_MIN_REVIEWS = 3;
export const MANUAL_MASTERY_REVIEW_DAYS = 14;
export const MANUAL_MASTERY_MATURE_REVIEW_DAYS = 30;

export function getLearningStatus(
  memory: WordMemoryRecord | undefined,
  now = new Date(),
): LearningStatus {
  if (memory?.manualMastered) return "手動已學會";
  if (!memory || memory.reviewCount <= 0) return "尚未練習";
  if (isNeedsPractice(memory, now)) return "需要加強";
  if (memory.reviewCount < MASTERY_MIN_REVIEWS) return "學習中";
  return calculateMasterySnapshot(memory, now).masteryPercent >= 60 ? "已熟悉" : "學習中";
}

/** 統一判定已學單字是否應進入待加強／聚焦複習。 */
export function isNeedsPractice(
  memory: WordMemoryRecord | undefined,
  now = new Date(),
): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  if (!memory || !Number.isFinite(memory.reviewCount) || memory.reviewCount <= 0) return false;
  if (memory.manualMastered && !isManualMasteryDue(memory, now)) return false;
  if (memory.manualMastered && isManualMasteryDue(memory, now)) return true;

  const dueAt = Date.parse(memory.fsrsCard.due);
  return (
    (Number.isFinite(dueAt) && dueAt <= now.getTime())
    || currentRetrievability(memory, now) < 0.7
    || memory.lastRawRating === "again"
    || (memory.lastHintLevel ?? 0) > 0
    || memory.againStreak > 0
  );
}

export function setManualMastery(
  memory: WordMemoryRecord,
  mastered: boolean,
  now = new Date(),
): WordMemoryRecord {
  const reviewDays = memory.reviewCount >= MASTERY_MIN_REVIEWS
    ? MANUAL_MASTERY_MATURE_REVIEW_DAYS
    : MANUAL_MASTERY_REVIEW_DAYS;
  return {
    ...memory,
    manualMastered: mastered,
    manualMasteredAt: mastered ? now.toISOString() : null,
    manualNextReviewAt: mastered
      ? new Date(now.getTime() + reviewDays * DAY).toISOString()
      : null,
    updatedAt: now.toISOString(),
  };
}

/** 手動標記的單字只在抽查日重新回到聚焦佇列。 */
export function isManualMasteryDue(
  memory: WordMemoryRecord | undefined,
  now = new Date(),
): boolean {
  if (!memory?.manualMastered || !memory.manualNextReviewAt) return false;
  const dueAt = Date.parse(memory.manualNextReviewAt);
  return Number.isFinite(dueAt) && dueAt <= now.getTime();
}

export function calculateMasterySnapshot(
  memory: WordMemoryRecord | undefined,
  now = new Date(),
  horizonDays = 30,
): MasterySnapshot {
  const safeHorizonDays = finiteNonNegative(horizonDays, 0);
  const reviewCount = finiteNonNegative(memory?.reviewCount, 0);
  if (!memory || reviewCount <= 0) {
    return {
      currentRecallPercent: 0,
      masteryPercent: 0,
      independentRecallRatePercent: 0,
      hintDependencyPercent: 0,
      reviewCount: 0,
      horizonDays: safeHorizonDays,
    };
  }

  const independentCorrect = clamp(
    finiteNonNegative(memory.independentCorrectCount, 0),
    0,
    reviewCount,
  );
  const hintedCorrect = clamp(
    finiteNonNegative(memory.hintedCorrectCount, 0),
    0,
    reviewCount,
  );
  const correctEvidence = Math.min(reviewCount, independentCorrect + hintedCorrect);
  const currentRecall = currentRetrievability(memory, now);
  const futureDate = new Date(now.getTime() + safeHorizonDays * DAY);
  const futureRecall = Number.isFinite(futureDate.getTime())
    ? Math.min(currentRecall, currentRetrievability(memory, futureDate))
    : 0;

  return {
    currentRecallPercent: toPercent(currentRecall),
    masteryPercent: toPercent(futureRecall),
    independentRecallRatePercent: toPercent(independentCorrect / reviewCount),
    hintDependencyPercent: correctEvidence ? toPercent(hintedCorrect / correctEvidence) : 0,
    reviewCount,
    horizonDays: safeHorizonDays,
  };
}

/** Backward-compatible alias: mastery means the configured long-term horizon. */
export function calculateMasteryPercent(
  memory: WordMemoryRecord | undefined,
  now = new Date(),
  horizonDays = 30,
): number {
  return calculateMasterySnapshot(memory, now, horizonDays).masteryPercent;
}

export function getMasteryLabel(
  retention30d: number,
  reviewCount: number,
): "資料不足" | "初學" | "不穩定" | "熟悉" | "穩固" {
  if (reviewCount < 3) return "資料不足";
  if (retention30d < 30) return "初學";
  if (retention30d < 60) return "不穩定";
  if (retention30d < 80) return "熟悉";
  return "穩固";
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function toPercent(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100);
}
