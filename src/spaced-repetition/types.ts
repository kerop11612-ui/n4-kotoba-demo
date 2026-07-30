import type { Card, Grade, State } from "ts-fsrs";

export type ReviewRating = "again" | "hard" | "good" | "easy";
export type HintLevel = 0 | 1 | 2 | 3;

export type SerializedFsrsCard = Omit<Card, "due" | "last_review"> & {
  due: string;
  last_review?: string;
};

export interface WordMemoryRecord {
  wordId: string;
  unitId: string;
  fsrsCard: SerializedFsrsCard;
  reviewCount: number;
  independentCorrectCount: number;
  hintedCorrectCount: number;
  lapseCount: number;
  lastHintLevel: HintLevel | null;
  lastRawRating: ReviewRating | null;
  lastFsrsRating: 1 | 2 | 3 | 4 | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewHistoryRecord {
  id: string;
  wordId: string;
  unitId: string;
  reviewedAt: string;
  rawRating: ReviewRating;
  hintLevel: HintLevel;
  fsrsRating: 1 | 2 | 3 | 4;
  responseTimeMs?: number;
  retrievabilityBefore?: number;
  retrievabilityAfter?: number;
  stabilityBefore?: number;
  stabilityAfter?: number;
  difficultyBefore?: number;
  difficultyAfter?: number;
  dueBefore?: string;
  dueAfter?: string;
}

export interface MemoryRepositoryData {
  schemaVersion: number;
  memories: Record<string, WordMemoryRecord>;
  history: ReviewHistoryRecord[];
}

export interface UnitStats {
  masteryPercent: number;
  coveragePercent: number;
  reviewedWords: number;
  totalWords: number;
  stableWords: number;
  reviewRecommendedWords: number;
  priorityReviewWords: number;
  dueToday: number;
  overdue: number;
  independentRecallRate: number | null;
  hintRescueRate: number | null;
}

export type FsrsGrade = Grade;
export type FsrsState = State;

