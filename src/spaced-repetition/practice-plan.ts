import { buildPracticeQueue, skillForReviewFormat } from "./practice-queue.ts";
import { isManualMasteryDue, isNeedsPractice } from "./mastery.ts";
import { currentRetrievability } from "./retrievability.ts";
import type { MemorySkill, ReviewFormat, WordMemoryRecord } from "./types.ts";

export type PracticeMode = "recommended" | ReviewFormat;

export type PracticePlanWord = {
  wordId: string;
  unitId: string;
  clozeEligible: boolean;
};

export type PracticePlanItem = {
  itemId: string;
  wordId: string;
  unitId: string;
  format: ReviewFormat;
  skill: MemorySkill;
};

export function makePracticeItemId(wordId: string, format: ReviewFormat): string {
  return `${wordId}::${format}`;
}

export function buildPracticePlan(
  memories: WordMemoryRecord[],
  words: readonly PracticePlanWord[],
  mode: PracticeMode,
  now = new Date(),
  random: () => number = Math.random,
  recentWordIds: readonly string[] = [],
): PracticePlanItem[] {
  const wordById = new Map(words.map((word) => [word.wordId, word]));
  const baseFormat: ReviewFormat = mode === "recommended" ? "jp-to-zh" : mode;
  const refs = buildPracticeQueue(memories, baseFormat, now, random, recentWordIds, mode === "recommended");
  const memoryByKey = new Map(memories.map((memory) => [`${memory.wordId}:${memory.skill}`, memory]));
  const newSkillLimit = Math.ceil(refs.length * 0.3);
  const newSkillSlots = new Set(
    Array.from({ length: newSkillLimit }, (_, index) => Math.min(Math.max(0, refs.length - 1), 2 + index * 3)),
  );
  let newSkillCount = 0;

  return refs.flatMap((ref, index) => {
    const word = wordById.get(ref.wordId);
    if (!word) return [];
    let format: ReviewFormat = baseFormat;
    if (mode === "recommended") {
      const weakestEstablished = chooseWeakestEstablishedFormat(ref.wordId, word.clozeEligible, memoryByKey, now);
      if (weakestEstablished !== "jp-to-zh") {
        format = weakestEstablished;
      } else if (newSkillSlots.has(index) && !hasAlternateFormatEvidence(ref.wordId, word.clozeEligible, memoryByKey)) {
        const choices: ReviewFormat[] = word.clozeEligible ? ["zh-to-jp", "cloze"] : ["zh-to-jp"];
        format = choices[newSkillCount % choices.length];
        newSkillCount += 1;
      }
    }
    if (format === "cloze" && !word.clozeEligible) format = "zh-to-jp";
    return [{
      itemId: makePracticeItemId(ref.wordId, format),
      wordId: ref.wordId,
      unitId: ref.unitId,
      format,
      skill: skillForReviewFormat(format),
    }];
  });
}

function hasAlternateFormatEvidence(
  wordId: string,
  clozeEligible: boolean,
  memoryByKey: ReadonlyMap<string, WordMemoryRecord>,
): boolean {
  const formats: ReviewFormat[] = clozeEligible ? ["zh-to-jp", "cloze"] : ["zh-to-jp"];
  return formats.some((format) => {
    const memory = memoryByKey.get(`${wordId}:${skillForReviewFormat(format)}`);
    return Boolean(memory && Number.isFinite(memory.reviewCount) && memory.reviewCount > 0);
  });
}

function chooseWeakestEstablishedFormat(
  wordId: string,
  clozeEligible: boolean,
  memoryByKey: ReadonlyMap<string, WordMemoryRecord>,
  now: Date,
): ReviewFormat {
  const formats: ReviewFormat[] = clozeEligible
    ? ["jp-to-zh", "zh-to-jp", "cloze"]
    : ["jp-to-zh", "zh-to-jp"];
  return formats
    .map((format) => ({ format, memory: memoryByKey.get(`${wordId}:${skillForReviewFormat(format)}`) }))
    .filter((candidate) => (
      candidate.memory
      && Number.isFinite(candidate.memory.reviewCount)
      && candidate.memory.reviewCount > 0
      && (!candidate.memory.manualMastered || isManualMasteryDue(candidate.memory, now))
    ))
    .sort((a, b) => {
      const needsDifference = Number(isNeedsPractice(b.memory, now)) - Number(isNeedsPractice(a.memory, now));
      if (needsDifference !== 0) return needsDifference;
      const recallDifference = currentRetrievability(a.memory!, now) - currentRetrievability(b.memory!, now);
      if (recallDifference !== 0) return recallDifference;
      return a.memory!.reviewCount - b.memory!.reviewCount;
    })[0]?.format ?? "jp-to-zh";
}
