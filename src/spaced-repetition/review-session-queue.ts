import type { PracticePlanItem } from "./practice-plan.ts";

export type ReviewRetryPlan = {
  wordIds: string[];
  retryWordIds: string[];
  scheduled: boolean;
};

export type PracticeRetryPlan = {
  items: PracticePlanItem[];
  retryItemIds: string[];
  scheduled: boolean;
};

export function schedulePracticeRetry(
  items: PracticePlanItem[],
  currentIndex: number,
  item: PracticePlanItem,
  shouldRetry: boolean,
  retryItemIds: readonly string[],
): PracticeRetryPlan {
  if (!shouldRetry || retryItemIds.includes(item.itemId)) {
    return { items, retryItemIds: [...retryItemIds], scheduled: false };
  }
  const insertAt = Math.min(items.length, Math.max(0, Math.floor(currentIndex) + 3));
  return {
    items: [...items.slice(0, insertAt), item, ...items.slice(insertAt)],
    retryItemIds: [...retryItemIds, item.itemId],
    scheduled: true,
  };
}

export function scheduleReviewRetry(
  wordIds: string[],
  currentIndex: number,
  wordId: string,
  shouldRetry: boolean,
  retryWordIds: readonly string[],
): ReviewRetryPlan {
  if (!shouldRetry || retryWordIds.includes(wordId)) {
    return { wordIds, retryWordIds: [...retryWordIds], scheduled: false };
  }

  const insertAt = Math.min(wordIds.length, Math.max(0, Math.floor(currentIndex) + 3));
  return {
    wordIds: [...wordIds.slice(0, insertAt), wordId, ...wordIds.slice(insertAt)],
    retryWordIds: [...retryWordIds, wordId],
    scheduled: true,
  };
}
