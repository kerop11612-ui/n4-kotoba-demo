import { fsrsScheduler } from "./fsrs-config.ts";
import { deserializeCard } from "./fsrs-adapter.ts";
import type { WordMemoryRecord } from "./types.ts";

export function currentRetrievability(
  memory: WordMemoryRecord | undefined,
  now = new Date(),
): number {
  if (!memory || memory.reviewCount === 0) return 0;
  return Math.max(0, Math.min(1, fsrsScheduler.get_retrievability(deserializeCard(memory.fsrsCard), now, false)));
}

