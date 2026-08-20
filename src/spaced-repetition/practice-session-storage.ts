import type { ReviewFormat, ReviewRating, HintLevel } from "./types.ts";
import type { ReviewSessionStorage, StoredReviewSessionResult } from "./review-session-storage.ts";
import type { PracticeWordRef } from "./practice-queue.ts";

export type StoredPracticeSession = {
  version: 1;
  format: ReviewFormat;
  wordRefs: PracticeWordRef[];
  index: number;
  results: StoredReviewSessionResult[];
  retryWordIds: string[];
};

export const PRACTICE_SESSION_KEY = "n4-kotoba-active-practice-v1";

export function readPracticeSession(storage: ReviewSessionStorage): StoredPracticeSession | null {
  try {
    const raw = storage.getItem(PRACTICE_SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isStoredPracticeSession(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function writePracticeSession(storage: ReviewSessionStorage, session: StoredPracticeSession): void {
  storage.setItem(PRACTICE_SESSION_KEY, JSON.stringify(session));
}

export function clearPracticeSession(storage: ReviewSessionStorage): void {
  storage.removeItem(PRACTICE_SESSION_KEY);
}

function isStoredPracticeSession(value: unknown): value is StoredPracticeSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Partial<StoredPracticeSession>;
  if (
    session.version !== 1 ||
    !isReviewFormat(session.format) ||
    !Array.isArray(session.wordRefs) ||
    !session.wordRefs.length ||
    !session.wordRefs.every(isPracticeWordRef) ||
    hasDuplicate(session.wordRefs.map((ref) => ref.wordId)) ||
    typeof session.index !== "number" ||
    !Number.isInteger(session.index) ||
    session.index < 0 ||
    session.index >= session.wordRefs.length ||
    !Array.isArray(session.results) ||
    !session.results.every(isReviewSessionResult) ||
    !Array.isArray(session.retryWordIds) ||
    !session.retryWordIds.every(isNonEmptyString) ||
    hasDuplicate(session.retryWordIds)
  ) return false;

  const wordIds = new Set(session.wordRefs.map((ref) => ref.wordId));
  return session.results.every((result) => wordIds.has(result.wordId)) && session.retryWordIds.every((wordId) => wordIds.has(wordId));
}

function isPracticeWordRef(value: unknown): value is PracticeWordRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as Partial<PracticeWordRef>;
  return isNonEmptyString(ref.wordId) && isNonEmptyString(ref.unitId);
}

function isReviewSessionResult(value: unknown): value is StoredReviewSessionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<StoredReviewSessionResult>;
  return (
    isNonEmptyString(result.wordId) &&
    isReviewRating(result.rawRating) &&
    isHintLevel(result.hintLevel) &&
    typeof result.correct === "boolean" &&
    typeof result.dueAfter === "string" &&
    (result.reviewFormat === undefined || isReviewFormat(result.reviewFormat)) &&
    (result.usedHint === undefined || typeof result.usedHint === "boolean") &&
    (result.answerRevealed === undefined || typeof result.answerRevealed === "boolean")
  );
}

function isReviewFormat(value: unknown): value is ReviewFormat {
  return value === "jp-to-zh" || value === "zh-to-jp" || value === "cloze";
}

function isReviewRating(value: unknown): value is ReviewRating {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
}

function isHintLevel(value: unknown): value is HintLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDuplicate(values: string[]): boolean {
  return new Set(values).size !== values.length;
}
