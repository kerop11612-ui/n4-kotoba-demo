import { isManualMasteryDue } from "./mastery.ts";
import { buildReviewQueue } from "./review-queue.ts";
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
): PracticeWordRef[] {
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
    if (!primary || primary.reviewCount <= 0) continue;
    const selected = records.find((memory) => memory.skill === selectedSkill && memory.reviewCount > 0) ?? primary;
    const masteredRecord = selected.manualMastered ? selected : primary;
    if (masteredRecord.manualMastered && !isManualMasteryDue(masteredRecord, now)) continue;
    candidates.push(selected);
  }

  return uniquePracticeRefs(
    buildReviewQueue(candidates, "focused", now, random, undefined, recentWordIds),
  );
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
