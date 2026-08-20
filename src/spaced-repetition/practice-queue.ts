import { isManualMasteryDue, isNeedsPractice } from "./mastery.ts";
import { buildReviewQueue } from "./review-queue.ts";
import { currentRetrievability } from "./retrievability.ts";
import type { MemorySkill, ReviewFormat, WordMemoryRecord } from "./types.ts";

export type PracticeWordRef = {
  wordId: string;
  unitId: string;
};

export function skillForReviewFormat(format: ReviewFormat): MemorySkill {
  if (format === "zh-to-jp") return "meaning_to_jp";
  if (format === "cloze") return "context_to_word";
  return "jp_to_meaning";
}

export function buildPracticeQueue(
  memories: WordMemoryRecord[],
  format: ReviewFormat,
  now = new Date(),
  random: () => number = Math.random,
  recentWordIds: readonly string[] = [],
  includeWeakestEstablishedSkills = false,
): PracticeWordRef[] {
  if (!Number.isFinite(now.getTime())) return [];
  const selectedSkill = skillForReviewFormat(format);
  const byWord = new Map<string, WordMemoryRecord[]>();
  for (const memory of memories) {
    const records = byWord.get(memory.wordId) ?? [];
    records.push(memory);
    byWord.set(memory.wordId, records);
  }

  const candidates: WordMemoryRecord[] = [];
  for (const records of byWord.values()) {
    const primary = records.find((memory) => memory.skill === "jp_to_meaning");
    if (!primary || !hasLearnedReviewCount(primary)) continue;
    let selected: WordMemoryRecord;
    if (includeWeakestEstablishedSkills) {
      const eligibleRecords = records.filter((memory) => (
        hasLearnedReviewCount(memory)
        && (!memory.manualMastered || isManualMasteryDue(memory, now))
      ));
      if (!eligibleRecords.some((memory) => memory.skill === "jp_to_meaning")) continue;
      selected = chooseWeakestEstablishedMemory(eligibleRecords, now);
    } else {
      if (isDeferredManualMastery(primary, now)) continue;
      const requested = records.find((memory) => memory.skill === selectedSkill && hasLearnedReviewCount(memory));
      if (requested && isDeferredManualMastery(requested, now)) continue;
      selected = requested ?? primary;
    }
    candidates.push(selected);
  }

  return uniquePracticeRefs(
    buildReviewQueue(candidates, "focused", now, random, undefined, recentWordIds),
  );
}

function hasLearnedReviewCount(memory: WordMemoryRecord): boolean {
  return Number.isFinite(memory.reviewCount) && memory.reviewCount > 0;
}

function isDeferredManualMastery(memory: WordMemoryRecord, now: Date): boolean {
  return memory.manualMastered && !isManualMasteryDue(memory, now);
}

function chooseWeakestEstablishedMemory(
  records: readonly WordMemoryRecord[],
  now: Date,
): WordMemoryRecord {
  return records
    .filter((memory) => memory.reviewCount > 0)
    .slice()
    .sort((a, b) => {
      const priorityDifference = practicePriority(a, now) - practicePriority(b, now);
      if (priorityDifference !== 0) return priorityDifference;
      return currentRetrievability(a, now) - currentRetrievability(b, now);
    })[0]!;
}

function practicePriority(memory: WordMemoryRecord, now: Date): number {
  if (isNeedsPractice(memory, now)) return 0;
  const recall = currentRetrievability(memory, now);
  if (recall < 0.7) return 1;
  if (recall < 0.9) return 2;
  return 3;
}

function uniquePracticeRefs(memories: WordMemoryRecord[]): PracticeWordRef[] {
  const seen = new Set<string>();
  return memories
    .filter((memory) => {
      if (seen.has(memory.wordId)) return false;
      seen.add(memory.wordId);
      return true;
    })
    .map((memory) => ({ wordId: memory.wordId, unitId: memory.unitId }));
}
