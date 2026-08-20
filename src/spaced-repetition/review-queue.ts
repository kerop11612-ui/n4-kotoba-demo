import { currentRetrievability } from "./retrievability.ts";
import { isManualMasteryDue } from "./mastery.ts";
import type { MemorySkill, ReviewHistoryRecord, WordMemoryRecord } from "./types.ts";

export type QueueMode = "focused" | "today" | "priority" | "unit" | "random";

export const FOCUSED_QUEUE_LIMIT = 10;
export const RECENT_REVIEW_WINDOW = 5;
export const LEECH_AGAIN_STREAK = 3;
export const LEECH_QUEUE_LIMIT = 1;

export function buildReviewQueue(
  memories: WordMemoryRecord[],
  mode: QueueMode,
  now = new Date(),
  random: () => number = Math.random,
  avoidWordId?: string,
  recentWordIds: readonly string[] = [],
): WordMemoryRecord[] {
  const uniqueMemories = deduplicateMemories(memories);
  const learned = uniqueMemories.filter((memory) => memory.reviewCount > 0);
  const recentWordIdSet = new Set(recentWordIds.slice(0, RECENT_REVIEW_WINDOW));
  if (mode === "focused") {
    const focusedMemories = uniqueMemories.filter((memory) => !memory.manualMastered || isManualMasteryDue(memory, now));
    const focusedLearned = focusedMemories.filter((memory) => memory.reviewCount > 0);
    // 同一優先級內打散，避免每次「從第 1 題開始」都卡在同一張卡；
    // sort 仍保留到期時間／熟悉度的科學排序，只在相同排序值時使用打散結果。
    const due = shuffleForTieBreak(
      focusedLearned.filter((memory) => (isDue(memory, now) || isManualMasteryDue(memory, now)) && !isLeech(memory)),
      random,
    )
      .sort((a, b) => compareRecent(a, b, recentWordIdSet) || dueTime(a) - dueTime(b));
    const weak = shuffleForTieBreak(
      focusedLearned.filter((memory) => !isDue(memory, now) && !isLeech(memory) && currentRetrievability(memory, now) < 0.7),
      random,
    )
      .sort((a, b) => compareRecent(a, b, recentWordIdSet) || currentRetrievability(a, now) - currentRetrievability(b, now));
    const developing = shuffleForTieBreak(
      focusedLearned.filter((memory) => {
        const recall = currentRetrievability(memory, now);
        return !isDue(memory, now) && !isLeech(memory) && recall >= 0.7 && recall < 0.9;
      }),
      random,
    )
      .sort((a, b) => compareRecent(a, b, recentWordIdSet) || currentRetrievability(a, now) - currentRetrievability(b, now));
    const fresh = shuffleForTieBreak(
      focusedMemories.filter((memory) => memory.reviewCount <= 0),
      random,
    );
    const stable = shuffleForTieBreak(
      focusedLearned.filter((memory) => !isLeech(memory) && !due.includes(memory) && !weak.includes(memory) && !developing.includes(memory)),
      random,
    )
      .sort((a, b) => compareRecent(a, b, recentWordIdSet) || currentRetrievability(a, now) - currentRetrievability(b, now));
    const leeches = shuffleForTieBreak(focusedLearned.filter(isLeech), random).slice(0, LEECH_QUEUE_LIMIT);
    const activeReviewCount = due.length + weak.length + developing.length;
    const sessionLimit = activeReviewCount >= 12 ? 5 : activeReviewCount >= 6 ? 8 : FOCUSED_QUEUE_LIMIT;
    const newCardLimit = activeReviewCount >= 12 ? 0 : activeReviewCount >= 6 ? 2 : activeReviewCount > 0 ? 3 : 5;
    const focusedQueue = interleaveFocusedQueue(
      [...due, ...weak, ...developing, ...fresh.slice(0, newCardLimit), ...stable, ...leeches]
        .slice(0, sessionLimit),
      now,
    );
    return avoidFirstRepeatedCard(
      focusedQueue,
      mode,
      now,
      avoidWordId,
    );
  }
  if (mode === "unit") return avoidFirstRepeatedCard([...uniqueMemories], mode, now, avoidWordId);
  if (mode === "priority") {
    return avoidFirstRepeatedCard(
      [...learned].filter((memory) => currentRetrievability(memory, now) < 0.7).sort((a, b) => currentRetrievability(a, now) - currentRetrievability(b, now)),
      mode,
      now,
      avoidWordId,
    );
  }
  if (mode === "today") {
    return avoidFirstRepeatedCard(
      [...learned].filter((memory) => new Date(memory.fsrsCard.due).getTime() <= now.getTime()).sort((a, b) => new Date(a.fsrsCard.due).getTime() - new Date(b.fsrsCard.due).getTime()),
      mode,
      now,
      avoidWordId,
    );
  }
  const result = [...uniqueMemories];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return avoidFirstRepeatedCard(result, mode, now, avoidWordId);
}

export function interleaveFocusedQueue(
  queue: WordMemoryRecord[],
  now = new Date(),
): WordMemoryRecord[] {
  const buckets = new Map<number, WordMemoryRecord[]>();
  for (const memory of queue) {
    const priority = focusedPriority(memory, now);
    const bucket = buckets.get(priority) ?? [];
    bucket.push(memory);
    buckets.set(priority, bucket);
  }

  const result: WordMemoryRecord[] = [];
  let lastPriority: number | null = null;
  let consecutive = 0;
  while (result.length < queue.length) {
    const availablePriorities = [...buckets.keys()]
      .filter((priority) => (buckets.get(priority)?.length ?? 0) > 0)
      .sort((a, b) => a - b);
    if (!availablePriorities.length) break;
    const alternatePriority = availablePriorities.find((priority) => priority !== lastPriority);
    const priority: number = lastPriority !== null && consecutive >= 2 && alternatePriority !== undefined
      ? alternatePriority
      : availablePriorities[0];
    const bucket = buckets.get(priority);
    const memory = bucket?.shift();
    if (!memory) break;
    result.push(memory);
    if (priority === lastPriority) consecutive += 1;
    else {
      lastPriority = priority;
      consecutive = 1;
    }
  }
  return result;
}

export function getRecentReviewWordIds(
  history: ReviewHistoryRecord[],
  skill: MemorySkill,
  limit = RECENT_REVIEW_WINDOW,
): string[] {
  const seen = new Set<string>();
  return history
    .filter((record) => record.skill === skill || (!record.skill && skill === "jp_to_meaning"))
    .slice()
    .sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt))
    .map((record) => record.wordId)
    .filter((wordId) => {
      if (seen.has(wordId)) return false;
      seen.add(wordId);
      return true;
    })
    .slice(0, Math.max(0, Math.floor(limit)));
}

function isDue(memory: WordMemoryRecord, now: Date): boolean {
  const due = new Date(memory.fsrsCard.due).getTime();
  return Number.isFinite(due) && due <= now.getTime();
}

function dueTime(memory: WordMemoryRecord): number {
  const due = new Date(memory.fsrsCard.due).getTime();
  return Number.isFinite(due) ? due : Number.POSITIVE_INFINITY;
}

function compareRecent(
  a: WordMemoryRecord,
  b: WordMemoryRecord,
  recentWordIdSet: ReadonlySet<string>,
): number {
  return Number(recentWordIdSet.has(a.wordId)) - Number(recentWordIdSet.has(b.wordId));
}

function isLeech(memory: WordMemoryRecord): boolean {
  return memory.againStreak >= LEECH_AGAIN_STREAK;
}

function shuffleForTieBreak(memories: WordMemoryRecord[], random: () => number): WordMemoryRecord[] {
  const result = [...memories];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function avoidFirstRepeatedCard(
  queue: WordMemoryRecord[],
  mode: QueueMode,
  now: Date,
  avoidWordId?: string,
): WordMemoryRecord[] {
  if (!avoidWordId || queue.length < 2 || queue[0].wordId !== avoidWordId) return queue;

  const firstPriority = mode === "focused" ? focusedPriority(queue[0], now) : null;
  const swapIndex = queue.findIndex((memory, index) => {
    if (index === 0) return false;
    return mode === "focused" ? focusedPriority(memory, now) === firstPriority : true;
  });
  if (swapIndex < 0) return queue;

  const result = [...queue];
  [result[0], result[swapIndex]] = [result[swapIndex], result[0]];
  return result;
}

function focusedPriority(memory: WordMemoryRecord, now: Date): number {
  if (isLeech(memory)) return 5;
  if (memory.reviewCount <= 0) return 3;
  if (isManualMasteryDue(memory, now)) return 0;
  if (isDue(memory, now)) return 0;
  const recall = currentRetrievability(memory, now);
  if (recall < 0.7) return 1;
  if (recall < 0.9) return 2;
  return 4;
}

function deduplicateMemories(memories: WordMemoryRecord[]): WordMemoryRecord[] {
  const unique = new Map<string, WordMemoryRecord>();
  for (const memory of memories) {
    const existing = unique.get(memory.wordId);
    if (!existing || memory.reviewCount > existing.reviewCount || memory.updatedAt > existing.updatedAt) {
      unique.set(memory.wordId, memory);
    }
  }
  return [...unique.values()];
}

