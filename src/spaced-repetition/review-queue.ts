import { currentRetrievability } from "./retrievability.ts";
import type { WordMemoryRecord } from "./types.ts";

export type QueueMode = "today" | "priority" | "unit" | "random";

export function buildReviewQueue(
  memories: WordMemoryRecord[],
  mode: QueueMode,
  now = new Date(),
  random: () => number = Math.random,
): WordMemoryRecord[] {
  const learned = memories.filter((memory) => memory.reviewCount > 0);
  if (mode === "unit") return [...memories];
  if (mode === "priority") {
    return [...learned].filter((memory) => currentRetrievability(memory, now) < 0.7).sort((a, b) => currentRetrievability(a, now) - currentRetrievability(b, now));
  }
  if (mode === "today") {
    return [...learned].filter((memory) => new Date(memory.fsrsCard.due).getTime() <= now.getTime()).sort((a, b) => new Date(a.fsrsCard.due).getTime() - new Date(b.fsrsCard.due).getTime());
  }
  const result = [...memories];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

