import type { QueueMode } from "./review-queue.ts";
import type { HintLevel, ReviewFormat, ReviewRating } from "./types.ts";

export type StoredReviewSessionResult = {
  wordId: string;
  rawRating: ReviewRating;
  hintLevel: HintLevel;
  correct: boolean;
  dueAfter: string;
  reviewFormat?: ReviewFormat;
  usedHint?: boolean;
  answerRevealed?: boolean;
};

export type StoredReviewSession = {
  chapter: number;
  section: number;
  format: ReviewFormat;
  mode: QueueMode;
  wordIds: string[];
  index: number;
  results: StoredReviewSessionResult[];
  retryWordIds?: string[];
};

export type ReviewSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const REVIEW_SESSION_KEY = "n4-kotoba-active-review-v2";

export function readReviewSession(storage: ReviewSessionStorage): StoredReviewSession | null {
  try {
    const raw = storage.getItem(REVIEW_SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const stored = value as Partial<StoredReviewSession>;
    if (
      !Number.isInteger(stored.chapter) ||
      !Number.isInteger(stored.section) ||
      !isReviewFormat(stored.format) ||
      !isQueueMode(stored.mode) ||
      !Array.isArray(stored.wordIds) ||
      !stored.wordIds.every((wordId) => typeof wordId === "string") ||
      !Number.isInteger(stored.index) ||
      !Array.isArray(stored.results) ||
      !stored.results.every(isReviewSessionResult) ||
      (stored.retryWordIds !== undefined && (!Array.isArray(stored.retryWordIds) || !stored.retryWordIds.every((wordId) => typeof wordId === "string")))
    ) return null;
    return stored as StoredReviewSession;
  } catch {
    return null;
  }
}

export function writeReviewSession(storage: ReviewSessionStorage, session: StoredReviewSession): void {
  storage.setItem(REVIEW_SESSION_KEY, JSON.stringify(session));
}

export function clearReviewSession(storage: ReviewSessionStorage): void {
  storage.removeItem(REVIEW_SESSION_KEY);
}

function isReviewFormat(value: unknown): value is ReviewFormat {
  return value === "jp-to-zh" || value === "zh-to-jp" || value === "cloze";
}

function isQueueMode(value: unknown): value is QueueMode {
  return value === "focused" || value === "today" || value === "priority" || value === "unit" || value === "random";
}

function isReviewRating(value: unknown): value is ReviewRating {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
}

function isHintLevel(value: unknown): value is HintLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

function isReviewSessionResult(value: unknown): value is StoredReviewSessionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<StoredReviewSessionResult>;
  return (
    typeof result.wordId === "string" &&
    isReviewRating(result.rawRating) &&
    isHintLevel(result.hintLevel) &&
    typeof result.correct === "boolean" &&
    typeof result.dueAfter === "string" &&
    (result.reviewFormat === undefined || isReviewFormat(result.reviewFormat)) &&
    (result.usedHint === undefined || typeof result.usedHint === "boolean") &&
    (result.answerRevealed === undefined || typeof result.answerRevealed === "boolean")
  );
}
