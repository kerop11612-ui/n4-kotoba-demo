import { currentRetrievability } from "./retrievability.ts";
import type {
  MemorySkill,
  ReviewAttemptKind,
  ReviewFormat,
  VocabularyMastery,
  VocabularyReviewEvent,
  WordMemoryRecord,
} from "./types.ts";

export type MetaScheduleReason =
  | "fsrs_due"
  | "weakness_diagnostic"
  | "unfamiliar_skill"
  | "cross_skill_diagnostic"
  | "new_skill"
  | "leech_scaffold";

export interface MetaScheduleCandidate {
  itemId: string;
  wordId: string;
  unitId: string;
  skill: MemorySkill;
  format: ReviewFormat;
  attemptKind: ReviewAttemptKind;
  reason: MetaScheduleReason;
  dueAt: string | null;
  retrievability: number | null;
}

const REASON_RANKS: Record<MetaScheduleReason, number> = {
  fsrs_due: 1,
  weakness_diagnostic: 2,
  unfamiliar_skill: 3,
  cross_skill_diagnostic: 4,
  leech_scaffold: 5,
  new_skill: 6,
};

function formatForSkill(skill: MemorySkill): ReviewFormat {
  if (skill === "meaning_to_jp") return "zh-to-jp";
  if (skill === "context_to_word") return "cloze";
  return "jp-to-zh";
}

function skillForFormat(format: ReviewFormat): MemorySkill {
  if (format === "zh-to-jp") return "meaning_to_jp";
  if (format === "cloze") return "context_to_word";
  return "jp_to_meaning";
}

export function buildMetaSchedule(input: {
  memories: readonly WordMemoryRecord[];
  masteries: readonly VocabularyMastery[];
  attempts: readonly VocabularyReviewEvent[];
  limit: number;
  now: Date;
  random?: () => number;
}): MetaScheduleCandidate[] {
  const { memories, masteries, limit, now, random = Math.random } = input;
  const nowMs = now.getTime();

  // Index masteries by wordId
  const masteriesByWord = new Map<string, VocabularyMastery>();
  for (const m of masteries) {
    masteriesByWord.set(m.wordId, m);
  }

  // Index memories by wordId:skill
  const memoryMap = new Map<string, WordMemoryRecord>();
  for (const m of memories) {
    memoryMap.set(`${m.wordId}:${m.skill}`, m);
  }

  // Find all unique words in memories
  const wordIds = [...new Set(memories.map((m) => m.wordId))];
  const candidates: MetaScheduleCandidate[] = [];

  for (const wordId of wordIds) {
    const mastery = masteriesByWord.get(wordId);
    const wordMemories = memories.filter((m) => m.wordId === wordId);
    const unitId = wordMemories[0]?.unitId ?? "unknown";

    // 1. Check due cards across skills
    for (const mem of wordMemories) {
      if (mem.reviewCount > 0) {
        const dueMs = Date.parse(mem.fsrsCard.due);
        if (Number.isFinite(dueMs) && dueMs <= nowMs) {
          candidates.push({
            itemId: `${wordId}::${formatForSkill(mem.skill)}`,
            wordId,
            unitId,
            skill: mem.skill,
            format: formatForSkill(mem.skill),
            attemptKind: "scheduled",
            reason: "fsrs_due",
            dueAt: mem.fsrsCard.due,
            retrievability: currentRetrievability(mem, now),
          });
        }
      }
    }

    if (!mastery) continue;

    // 2. Weakness diagnostic (if weaknessRisk is high or medium, arrange diagnostic for vulnerable skill)
    if (mastery.weaknessRisk === "high" || mastery.weaknessRisk === "medium") {
      const vulnerableSkill: MemorySkill = (mastery.productive.band === "likely_unfamiliar" || mastery.productive.band === "uncertain")
        ? "meaning_to_jp"
        : (mastery.contextual.band === "likely_unfamiliar" || mastery.contextual.band === "uncertain")
          ? "context_to_word"
          : "jp_to_meaning";
      const mem = memoryMap.get(`${wordId}:${vulnerableSkill}`);
      const format = formatForSkill(vulnerableSkill);
      const isAlreadyDue = candidates.some((c) => c.wordId === wordId && c.skill === vulnerableSkill);
      if (!isAlreadyDue) {
        candidates.push({
          itemId: `${wordId}::${format}`,
          wordId,
          unitId,
          skill: vulnerableSkill,
          format,
          attemptKind: "diagnostic",
          reason: "weakness_diagnostic",
          dueAt: mem?.fsrsCard.due ?? null,
          retrievability: mem ? currentRetrievability(mem, now) : null,
        });
      }
    }

    // 3. Unfamiliar skill
    if (mastery.unfamiliarityBand === "likely_unfamiliar") {
      const targetSkill: MemorySkill = mastery.productive.band === "likely_unfamiliar"
        ? "meaning_to_jp"
        : mastery.receptive.band === "likely_unfamiliar"
          ? "jp_to_meaning"
          : "context_to_word";
      const mem = memoryMap.get(`${wordId}:${targetSkill}`);
      const format = formatForSkill(targetSkill);
      const exists = candidates.some((c) => c.wordId === wordId && c.skill === targetSkill);
      if (!exists) {
        candidates.push({
          itemId: `${wordId}::${format}`,
          wordId,
          unitId,
          skill: targetSkill,
          format,
          attemptKind: "scheduled",
          reason: "unfamiliar_skill",
          dueAt: mem?.fsrsCard.due ?? null,
          retrievability: mem ? currentRetrievability(mem, now) : null,
        });
      }
    }

    // 4. Cross-skill diagnostic
    if (mastery.crossSkillDisagreement) {
      const targetSkill: MemorySkill = mastery.productive.band !== "likely_familiar"
        ? "meaning_to_jp"
        : "context_to_word";
      const mem = memoryMap.get(`${wordId}:${targetSkill}`);
      const format = formatForSkill(targetSkill);
      const exists = candidates.some((c) => c.wordId === wordId && c.skill === targetSkill);
      if (!exists) {
        candidates.push({
          itemId: `${wordId}::${format}`,
          wordId,
          unitId,
          skill: targetSkill,
          format,
          attemptKind: "diagnostic",
          reason: "cross_skill_diagnostic",
          dueAt: mem?.fsrsCard.due ?? null,
          retrievability: mem ? currentRetrievability(mem, now) : null,
        });
      }
    }

    // 5. New skill acquisition (receptive familiar, but productive/contextual unseen)
    if (mastery.receptive.band === "likely_familiar") {
      if (mastery.productive.band === "unknown") {
        const mem = memoryMap.get(`${wordId}:meaning_to_jp`);
        const exists = candidates.some((c) => c.wordId === wordId && c.skill === "meaning_to_jp");
        if (!exists) {
          candidates.push({
            itemId: `${wordId}::zh-to-jp`,
            wordId,
            unitId,
            skill: "meaning_to_jp",
            format: "zh-to-jp",
            attemptKind: "scheduled",
            reason: "new_skill",
            dueAt: mem?.fsrsCard.due ?? null,
            retrievability: mem ? currentRetrievability(mem, now) : null,
          });
        }
      }
    }
  }

  // Deduplicate candidates by itemId
  const uniqueMap = new Map<string, MetaScheduleCandidate>();
  for (const c of candidates) {
    if (!uniqueMap.has(c.itemId)) {
      uniqueMap.set(c.itemId, c);
    }
  }
  const uniqueCandidates = [...uniqueMap.values()];

  // Lexicographic sorting:
  // 1. reasonRank
  // 2. dueTime (due cards first, null goes to infinity)
  // 3. retrievability (lowest first)
  // 4. deterministic tieBreak
  uniqueCandidates.sort((a, b) => {
    const rankA = REASON_RANKS[a.reason];
    const rankB = REASON_RANKS[b.reason];
    if (rankA !== rankB) return rankA - rankB;

    const dueTimeA = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const dueTimeB = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    if (dueTimeA !== dueTimeB) return dueTimeA - dueTimeB;

    const rA = a.retrievability ?? 1;
    const rB = b.retrievability ?? 1;
    if (Math.abs(rA - rB) > 0.001) return rA - rB;

    return a.itemId.localeCompare(b.itemId);
  });

  return uniqueCandidates.slice(0, Math.max(0, limit));
}
