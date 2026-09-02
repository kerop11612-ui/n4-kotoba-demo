import {
  calculateSkillMastery,
  MASTERY_POLICY_V1,
  type EvidenceConfidence,
  type MasteryBand,
  type MasteryPolicy,
  type SkillMasterySnapshot,
} from "./skill-mastery.ts";
import { getMemoryKey, type VocabularyReviewEvent, type WordMemoryRecord } from "./types.ts";

export type WeaknessRisk = "unknown" | "low" | "medium" | "high";

export interface VocabularyMastery {
  wordId: string;
  receptive: SkillMasterySnapshot;
  productive: SkillMasterySnapshot;
  contextual: SkillMasterySnapshot;
  crossSkillDisagreement: boolean;
  unfamiliarityBand: MasteryBand;
  weaknessRisk: WeaknessRisk;
  confidence: EvidenceConfidence;
  reasons: string[];
}

/**
 * Evaluates holistic vocabulary mastery across receptive (jp_to_meaning),
 * productive (meaning_to_jp), and contextual (context_to_word) skills.
 */
export function calculateVocabularyMastery(
  wordId: string,
  memoriesByKeyOrArray: WordMemoryRecord[] | ReadonlyMap<string, WordMemoryRecord> | Record<string, WordMemoryRecord>,
  events: VocabularyReviewEvent[] = [],
  now = new Date(),
  policy: MasteryPolicy = MASTERY_POLICY_V1,
): VocabularyMastery {
  const getMemory = (skill: "jp_to_meaning" | "meaning_to_jp" | "context_to_word"): WordMemoryRecord | undefined => {
    const key = getMemoryKey(wordId, skill);
    if (Array.isArray(memoriesByKeyOrArray)) {
      return memoriesByKeyOrArray.find((m) => m.wordId === wordId && m.skill === skill);
    }
    if (memoriesByKeyOrArray instanceof Map) {
      return memoriesByKeyOrArray.get(key);
    }
    return (memoriesByKeyOrArray as Record<string, WordMemoryRecord>)[key];
  };

  const receptive = calculateSkillMastery(getMemory("jp_to_meaning"), events, now, policy, "jp_to_meaning");
  const productive = calculateSkillMastery(getMemory("meaning_to_jp"), events, now, policy, "meaning_to_jp");
  const contextual = calculateSkillMastery(getMemory("context_to_word"), events, now, policy, "context_to_word");

  const activeSkills = [receptive, productive, contextual].filter((s) => s.band !== "unknown");

  // Confidence is highest confidence among active skills, or low if none
  let confidence: EvidenceConfidence = "low";
  if (activeSkills.some((s) => s.confidence === "high")) {
    confidence = "high";
  } else if (activeSkills.some((s) => s.confidence === "medium")) {
    confidence = "medium";
  }

  // Cross skill disagreement: requires one likely_familiar and one established weak/uncertain skill
  const hasFamiliar = activeSkills.some((s) => s.band === "likely_familiar");
  const hasUnfamiliarOrUncertain = activeSkills.some((s) => s.band === "likely_unfamiliar" || s.band === "uncertain");
  const crossSkillDisagreement = hasFamiliar && hasUnfamiliarOrUncertain;

  // Unfamiliarity band: weakest established active skill band; all unknown remains unknown
  let unfamiliarityBand: MasteryBand = "unknown";
  if (activeSkills.length > 0) {
    if (activeSkills.some((s) => s.band === "likely_unfamiliar")) {
      unfamiliarityBand = "likely_unfamiliar";
    } else if (activeSkills.some((s) => s.band === "uncertain")) {
      unfamiliarityBand = "uncertain";
    } else {
      unfamiliarityBand = "likely_familiar";
    }
  }

  // Weakness risk evaluation
  // High risk requires at least 2 distinct signal families AND medium/high confidence
  const reasons: string[] = [];
  const signalFamilies = new Set<string>();

  // Signal Family 1: Low future retrievability (horizon R < 0.6) on an established skill
  for (const skill of activeSkills) {
    if (skill.retrievabilityAtHorizon !== null && skill.retrievabilityAtHorizon < 0.6) {
      signalFamilies.add("future_retrievability_drop");
      reasons.push(`${skill.skill} 保持率預測在 ${policy.horizonDays} 天後明顯下降 (${Math.round(skill.retrievabilityAtHorizon * 100)}%)`);
      break;
    }
  }

  // Signal Family 2: Slower response trend on independent correct attempts
  for (const skill of activeSkills) {
    if (skill.responseTrend === "slower") {
      signalFamilies.add("response_slowing");
      reasons.push(`${skill.skill} 獨立作答反應時間近期持續變慢`);
      break;
    }
  }

  // Signal Family 3: Cross skill disagreement
  if (crossSkillDisagreement) {
    signalFamilies.add("cross_skill_disagreement");
    reasons.push("技能掌握度存在落差（例：被動辨識熟悉但主動產出尚未穩固）");
  }

  // Signal Family 4: High lapse or recent independent failures on any active skill
  for (const skill of activeSkills) {
    if (skill.recentIndependentFailures > 0) {
      signalFamilies.add("recent_independent_failure");
      reasons.push(`${skill.skill} 近期出現獨立回想失誤`);
      break;
    }
  }

  let weaknessRisk: WeaknessRisk = "unknown";
  if (activeSkills.length === 0) {
    weaknessRisk = "unknown";
  } else if (confidence === "low") {
    weaknessRisk = signalFamilies.size > 0 ? "low" : "unknown";
  } else if (signalFamilies.size >= policy.highRiskSignalFamilies) {
    weaknessRisk = "high";
  } else if (signalFamilies.size === 1) {
    weaknessRisk = "medium";
  } else {
    weaknessRisk = "low";
  }

  return {
    wordId,
    receptive,
    productive,
    contextual,
    crossSkillDisagreement,
    unfamiliarityBand,
    weaknessRisk,
    confidence,
    reasons,
  };
}
