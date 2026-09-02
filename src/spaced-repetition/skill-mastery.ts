import { deserializeCard } from "./fsrs-adapter.ts";
import { fsrsScheduler } from "./fsrs-config.ts";
import type { VocabularyReviewEvent, WordMemoryRecord } from "./types.ts";

export type MasteryBand = "unknown" | "likely_unfamiliar" | "uncertain" | "likely_familiar";
export type EvidenceConfidence = "low" | "medium" | "high";
export type ResponseTrend = "unknown" | "stable" | "slower" | "faster";

export type CoreMasterySkill = "jp_to_meaning" | "meaning_to_jp" | "context_to_word";

export interface SkillMasterySnapshot {
  skill: CoreMasterySkill;
  band: MasteryBand;
  confidence: EvidenceConfidence;
  retrievabilityNow: number | null;
  retrievabilityAtHorizon: number | null;
  independentAttempts: number;
  independentSuccesses: number;
  assistedSuccesses: number;
  recentIndependentFailures: number;
  responseTrend: ResponseTrend;
  reasons: string[];
}

export const MASTERY_POLICY_V1 = Object.freeze({
  horizonDays: 30,
  mediumEvidenceAttempts: 3,
  highEvidenceAttempts: 8,
  recentWindow: 5,
  minimumTrendSamples: 3,
  highRiskSignalFamilies: 2,
});

export type MasteryPolicy = typeof MASTERY_POLICY_V1;

/**
 * Calculates a pure snapshot of mastery for a single skill of a word.
 */
export function calculateSkillMastery(
  memory: WordMemoryRecord | undefined,
  events: VocabularyReviewEvent[] = [],
  now = new Date(),
  policy: MasteryPolicy = MASTERY_POLICY_V1,
  skill: CoreMasterySkill = "jp_to_meaning",
): SkillMasterySnapshot {
  // If memory is missing or has 0 reviews, return unknown/low
  if (!memory || memory.reviewCount <= 0) {
    return {
      skill,
      band: "unknown",
      confidence: "low",
      retrievabilityNow: null,
      retrievabilityAtHorizon: null,
      independentAttempts: 0,
      independentSuccesses: 0,
      assistedSuccesses: 0,
      recentIndependentFailures: 0,
      responseTrend: "unknown",
      reasons: ["尚無此技能的學習記錄"],
    };
  }

  // Filter events belonging to this exact word and skill
  const relevantEvents = events
    .filter((e) => e.wordId === memory.wordId && e.skill === skill)
    .sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt));

  // Compute attempts metrics
  let independentAttempts = 0;
  let independentSuccesses = 0;
  let assistedSuccesses = 0;

  for (const ev of relevantEvents) {
    const isAssisted = Boolean(ev.usedHint || ev.hintLevel > 0 || ev.answerRevealedBeforeResponse);
    if (isAssisted) {
      if (ev.correct) assistedSuccesses++;
    } else {
      independentAttempts++;
      if (ev.correct) independentSuccesses++;
    }
  }

  // If there are no stored events but memory has reviewCount, fallback to memory record stats
  if (relevantEvents.length === 0 && memory.reviewCount > 0) {
    independentAttempts = memory.independentCorrectCount + memory.lapseCount;
    independentSuccesses = memory.independentCorrectCount;
    assistedSuccesses = memory.hintedCorrectCount;
  }

  const totalAttempts = independentAttempts + assistedSuccesses;
  const confidence: EvidenceConfidence = totalAttempts >= policy.highEvidenceAttempts
    ? "high"
    : totalAttempts >= policy.mediumEvidenceAttempts
      ? "medium"
      : "low";

  // Retrievability now and at horizon
  let retrievabilityNow: number | null = null;
  let retrievabilityAtHorizon: number | null = null;
  try {
    const card = deserializeCard(memory.fsrsCard);
    if (Number.isFinite(card.due.getTime()) && Number.isFinite(card.stability) && card.stability > 0) {
      const rNow = fsrsScheduler.get_retrievability(card, now, false);
      if (Number.isFinite(rNow)) {
        retrievabilityNow = Math.max(0, Math.min(1, rNow));
      }
      const horizonDate = new Date(now.getTime() + policy.horizonDays * 86_400_000);
      const rHorizon = fsrsScheduler.get_retrievability(card, horizonDate, false);
      if (Number.isFinite(rHorizon)) {
        retrievabilityAtHorizon = Math.max(0, Math.min(1, rHorizon));
      }
    }
  } catch {
    // fallback null
  }

  // Recent independent window
  const recentEvents = relevantEvents.slice(-policy.recentWindow);
  const recentIndependent = recentEvents.filter((ev) => !ev.usedHint && ev.hintLevel === 0 && !ev.answerRevealedBeforeResponse);
  const recentIndependentFailures = recentIndependent.filter((ev) => !ev.correct).length;

  // Response trend on independent valid attempts
  const validTrendAttempts = relevantEvents.filter((ev) =>
    !ev.usedHint && ev.hintLevel === 0 && !ev.answerRevealedBeforeResponse && ev.correct && ev.responseMs > 0
  );

  let responseTrend: ResponseTrend = "unknown";
  if (validTrendAttempts.length >= policy.minimumTrendSamples) {
    const recent = validTrendAttempts.slice(-policy.minimumTrendSamples);
    const times = recent.map((a) => a.responseMs);
    const first = times[0];
    const last = times[times.length - 1];
    if (last > first * 1.2) {
      responseTrend = "slower";
    } else if (last < first * 0.8) {
      responseTrend = "faster";
    } else {
      responseTrend = "stable";
    }
  }

  // Band determination
  const reasons: string[] = [];
  let band: MasteryBand = "unknown";

  if (confidence === "low") {
    band = "uncertain";
    reasons.push("學習次數不足，證據信心度偏低");
  } else {
    const independentAccuracy = independentAttempts > 0 ? independentSuccesses / independentAttempts : 0;
    const rCurrent = retrievabilityNow ?? 0;

    if (recentIndependentFailures > 0 || independentAccuracy < 0.6 || rCurrent < 0.6) {
      band = "likely_unfamiliar";
      if (recentIndependentFailures > 0) reasons.push(`近期有 ${recentIndependentFailures} 次獨立回想失敗`);
      if (independentAccuracy < 0.6) reasons.push(`獨立答對率偏低 (${Math.round(independentAccuracy * 100)}%)`);
      if (rCurrent < 0.6) reasons.push(`即時可提取率偏低 (${Math.round(rCurrent * 100)}%)`);
    } else if (independentAccuracy >= 0.8 && rCurrent >= 0.8 && (retrievabilityAtHorizon ?? 0) >= 0.5) {
      band = "likely_familiar";
      reasons.push("獨立回想表現穩定且保持率良好");
    } else {
      band = "uncertain";
      reasons.push("回想表現介於熟悉與不熟之間");
    }
  }

  return {
    skill,
    band,
    confidence,
    retrievabilityNow,
    retrievabilityAtHorizon,
    independentAttempts,
    independentSuccesses,
    assistedSuccesses,
    recentIndependentFailures,
    responseTrend,
    reasons,
  };
}
