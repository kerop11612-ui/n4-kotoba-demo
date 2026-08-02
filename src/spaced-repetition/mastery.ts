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

const DAY = 86_400_000;

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
  const currentRecall = currentRetrievability(memory, now);
  const futureDate = new Date(now.getTime() + safeHorizonDays * DAY);
  const futureRecall = Number.isFinite(futureDate.getTime())
    ? Math.min(currentRecall, currentRetrievability(memory, futureDate))
    : 0;

  return {
    currentRecallPercent: toPercent(currentRecall),
    masteryPercent: toPercent(futureRecall),
    independentRecallRatePercent: toPercent(independentCorrect / reviewCount),
    hintDependencyPercent: toPercent(hintedCorrect / reviewCount),
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
