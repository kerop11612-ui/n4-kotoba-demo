import type { Card, Grade, State } from "ts-fsrs";

export type MemorySkill =
  | "jp_to_meaning"
  | "meaning_to_jp"
  | "kanji_to_reading"
  | "audio_to_meaning"
  | "context_to_word";

export type ReviewErrorType =
  | "meaning"
  | "reading"
  | "kanji"
  | "pronunciation"
  | "confused_word"
  | "context"
  | "slow_recall";

export type ReviewOutcome = {
  correct: boolean;
  usedHint: boolean;
  struggled: boolean;
};

export function getMemoryKey(wordId: string, skill: MemorySkill = "jp_to_meaning"): string {
  return `${wordId}:${skill}`;
}

export type ReviewRating = "again" | "hard" | "good" | "easy";
export type HintLevel = 0 | 1 | 2 | 3 | 4;
export type ReviewFormat = "jp-to-zh" | "zh-to-jp" | "cloze";

export interface ReviewContext {
  reviewFormat: ReviewFormat;
  skill?: MemorySkill;
  answerCorrect?: boolean;
  answerAttempts?: number;
  correct?: boolean;
  recalledWithoutHint?: boolean;
  responseTimeMs?: number;
  errorTypes?: ReviewErrorType[];
  confusedWordIds?: string[];
}

export type SerializedFsrsCard = Omit<Card, "due" | "last_review"> & {
  due: string;
  last_review?: string;
};

export interface WordMemoryRecord {
  wordId: string;
  unitId: string;
  skill: MemorySkill;
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
  skill?: MemorySkill;
  reviewedAt: string;
  rawRating: ReviewRating;
  hintLevel: HintLevel;
  fsrsRating: 1 | 2 | 3 | 4;
  reviewFormat?: ReviewFormat;
  answerCorrect?: boolean;
  answerAttempts?: number;
  responseTimeMs?: number;
  correct?: boolean;
  recalledWithoutHint?: boolean;
  errorTypes?: ReviewErrorType[];
  confusedWordIds?: string[];
  retrievabilityBefore?: number;
  retrievabilityAfter?: number;
  stabilityBefore?: number;
  stabilityAfter?: number;
  difficultyBefore?: number;
  difficultyAfter?: number;
  dueBefore?: string;
  dueAfter?: string;
}

export interface VocabularyReviewEvent {
  id: string;
  wordId: string;
  skill: MemorySkill;
  reviewedAt: string;
  correct: boolean;
  recalledWithoutHint: boolean;
  hintLevel: HintLevel;
  responseMs: number;
  errorTypes: ReviewErrorType[];
  confusedWordIds?: string[];
  predictedRecallBeforeReview: number;
  fsrsRating: 1 | 2 | 3 | 4;
  reviewCountBefore: number;
  unitId: string;
}

export interface MemoryRepositoryData {
  schemaVersion: number;
  memories: Record<string, WordMemoryRecord>;
  history: ReviewHistoryRecord[];
  events: VocabularyReviewEvent[];
}

export interface UnitStats {
  masteryPercent: number;
  currentRecallPercent: number;
  independentRecallRatePercent: number | null;
  hintDependencyPercent: number | null;
  reviewCount: number;
  horizonDays: number;
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
