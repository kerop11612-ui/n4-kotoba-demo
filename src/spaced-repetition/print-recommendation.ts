import { createWordMemory } from "./fsrs-adapter.ts";
import { currentRetrievability } from "./retrievability.ts";
import { buildReviewQueue, FOCUSED_QUEUE_LIMIT } from "./review-queue.ts";
import { getMemoryKey, type MemorySkill, type WordMemoryRecord } from "./types.ts";
import type { VocabularyWord } from "../vocabulary/types.ts";

const PRINT_SKILLS: MemorySkill[] = ["jp_to_meaning", "meaning_to_jp", "context_to_word"];

function weakestMemory(
  word: VocabularyWord,
  memoriesByKey: ReadonlyMap<string, WordMemoryRecord>,
  now: Date,
): WordMemoryRecord {
  const memories = PRINT_SKILLS
    .map((skill) => memoriesByKey.get(getMemoryKey(word.id, skill)))
    .filter((memory): memory is WordMemoryRecord => Boolean(memory));
  if (!memories.length) return createWordMemory(word.id, `${word.chapterNumber}-${word.sectionNumber}`, now, "jp_to_meaning");
  return memories.sort((a, b) => currentRetrievability(a, now) - currentRetrievability(b, now))[0];
}

export function selectFocusedPrintWords(
  words: VocabularyWord[],
  memories: WordMemoryRecord[],
  now = new Date(),
  random: () => number = Math.random,
  recentWordIds: readonly string[] = [],
): VocabularyWord[] {
  const memoriesByKey = new Map(memories.map((memory) => [getMemoryKey(memory.wordId, memory.skill), memory]));
  const candidates = words.map((word) => weakestMemory(word, memoriesByKey, now));
  const queuedIds = buildReviewQueue(candidates, "focused", now, random, undefined, recentWordIds)
    .slice(0, FOCUSED_QUEUE_LIMIT)
    .map((memory) => memory.wordId);
  const wordsById = new Map(words.map((word) => [word.id, word]));
  return queuedIds
    .map((wordId) => wordsById.get(wordId))
    .filter((word): word is VocabularyWord => Boolean(word));
}
