import { fsrsScheduler } from "./fsrs-config.ts";
import { deserializeCard } from "./fsrs-adapter.ts";
import type { WordMemoryRecord } from "./types.ts";

export function currentRetrievability(
  memory: WordMemoryRecord | undefined,
  now = new Date(),
): number {
  if (!memory || memory.reviewCount === 0) return 0;
  if (!Number.isFinite(now.getTime())) return 0;
  try {
    const card = deserializeCard(memory.fsrsCard);
    if (!Number.isFinite(card.due.getTime()) || !Number.isFinite(card.stability) || card.stability <= 0) return 0;
    const value = fsrsScheduler.get_retrievability(card, now, false);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  } catch {
    return 0;
  }
}
