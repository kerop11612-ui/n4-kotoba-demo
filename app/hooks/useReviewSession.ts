"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AudioStep, DemoWord } from "../components/vocabulary";
import { createClozeSentence, isClozeAnswerCorrect } from "../../src/spaced-repetition/cloze";
import { createWordMemory, reviewWordMemory } from "../../src/spaced-repetition/fsrs-adapter";
import { buildReviewQueue, type QueueMode } from "../../src/spaced-repetition/review-queue";
import { getMemoryKey, type HintLevel, type MemorySkill, type ReviewContext, type ReviewFormat, type ReviewHistoryRecord, type ReviewRating, type VocabularyReviewEvent, type WordMemoryRecord } from "../../src/spaced-repetition/types";
import type { MemoryRepository } from "../../src/storage/memory-repository";
import { getUnitId } from "../../src/vocabulary/catalog";
import { resolveReviewShortcut } from "../../src/spaced-repetition/study-session";

function skillForReviewFormat(format: ReviewFormat): MemorySkill {
  if (format === "zh-to-jp") return "meaning_to_jp";
  if (format === "cloze") return "context_to_word";
  return "jp_to_meaning";
}

export type ReviewSessionResult = {
  wordId: string;
  rawRating: ReviewRating;
  hintLevel: HintLevel;
  correct: boolean;
  dueAfter: string;
};

export type ReviewSessionSummary = {
  total: number;
  completed: number;
  correct: number;
  hinted: number;
  ratingCounts: Record<ReviewRating, number>;
  retryWordIds: string[];
  nextReviewAt: string | null;
};

type StoredReviewSession = {
  chapter: number;
  section: number;
  format: ReviewFormat;
  mode: QueueMode;
  wordIds: string[];
  index: number;
  results: ReviewSessionResult[];
};

const REVIEW_SESSION_KEY = "n4-kotoba-active-review-v1";

function isReviewFormat(value: unknown): value is ReviewFormat {
  return value === "jp-to-zh" || value === "zh-to-jp" || value === "cloze";
}

function isQueueMode(value: unknown): value is QueueMode {
  return value === "today" || value === "priority" || value === "unit" || value === "random";
}

function isReviewRating(value: unknown): value is ReviewRating {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
}

function isHintLevel(value: unknown): value is HintLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

function isReviewSessionResult(value: unknown): value is ReviewSessionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<ReviewSessionResult>;
  return (
    typeof result.wordId === "string" &&
    isReviewRating(result.rawRating) &&
    isHintLevel(result.hintLevel) &&
    typeof result.correct === "boolean" &&
    typeof result.dueAfter === "string"
  );
}

function readStoredReviewSession(): StoredReviewSession | null {
  try {
    const raw = window.sessionStorage.getItem(REVIEW_SESSION_KEY);
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
      !stored.results.every(isReviewSessionResult)
    ) return null;
    return stored as StoredReviewSession;
  } catch {
    return null;
  }
}

function clearStoredReviewSession() {
  try {
    window.sessionStorage.removeItem(REVIEW_SESSION_KEY);
  } catch {
    // Session recovery is optional; restricted storage should not block learning.
  }
}

type ReviewSessionOptions = {
  words: DemoWord[];
  visibleWords: DemoWord[];
  memoryRecords: Record<string, WordMemoryRecord>;
  setMemoryRecords: Dispatch<SetStateAction<Record<string, WordMemoryRecord>>>;
  repository: MemoryRepository | null;
  selectedChapter: number;
  selectedSection: number;
  setReviewHistory: Dispatch<SetStateAction<ReviewHistoryRecord[]>>;
  setReviewEvents: Dispatch<SetStateAction<VocabularyReviewEvent[]>>;
  playOne: (step: AudioStep) => void;
  stopAudio: () => void;
  onMessage: (message: string) => void;
};

export function useReviewSession({
  words,
  visibleWords,
  memoryRecords,
  setMemoryRecords,
  repository,
  selectedChapter,
  selectedSection,
  setReviewHistory,
  setReviewEvents,
  playOne,
  stopAudio,
  onMessage,
}: ReviewSessionOptions) {
  const [reviewing, setReviewing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [reviewHintLevel, setReviewHintLevel] = useState<HintLevel>(0);
  const [reviewFormat, setReviewFormat] = useState<ReviewFormat>("jp-to-zh");
  const [clozeAnswer, setClozeAnswer] = useState("");
  const [clozeAnswerAttempts, setClozeAnswerAttempts] = useState(0);
  const [clozeAnswerCorrect, setClozeAnswerCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewMode, setReviewMode] = useState<QueueMode>("unit");
  const [reviewWordIds, setReviewWordIds] = useState<string[]>([]);
  const [reviewResults, setReviewResults] = useState<ReviewSessionResult[]>([]);
  const isSubmittingRef = useRef(false);
  const reviewStartedAtRef = useRef<number | null>(null);
  const restoreAttemptedRef = useRef(false);

  const reviewWords = useMemo(
    () => (reviewWordIds.length ? reviewWordIds : visibleWords.map((word) => word.id))
      .map((id) => words.find((word) => word.id === id))
      .filter((word): word is DemoWord => Boolean(word)),
    [reviewWordIds, visibleWords, words],
  );

  const reviewPreviewCount = useMemo(() => {
    if (!visibleWords.length) return 0;
    const skill = skillForReviewFormat(reviewFormat);
    const candidates = visibleWords.map((word) =>
      memoryRecords[getMemoryKey(word.id, skill)] ?? createWordMemory(
        word.id,
        getUnitId(selectedChapter, selectedSection),
        new Date(),
        skill,
      ),
    );
    return buildReviewQueue(candidates, reviewMode).length;
  }, [memoryRecords, reviewFormat, reviewMode, selectedChapter, selectedSection, visibleWords]);

  const reviewSummary = useMemo<ReviewSessionSummary>(() => {
    const ratingCounts: Record<ReviewRating, number> = {
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    };
    for (const result of reviewResults) ratingCounts[result.rawRating] += 1;
    const nextReviewAt = reviewResults
      .map((result) => result.dueAfter)
      .filter((value) => Number.isFinite(Date.parse(value)))
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
    return {
      total: reviewWords.length,
      completed: reviewResults.length,
      correct: reviewResults.filter((result) => result.correct).length,
      hinted: reviewResults.filter((result) => result.hintLevel > 0).length,
      ratingCounts,
      retryWordIds: reviewResults
        .filter((result) => result.rawRating === "again" || result.hintLevel > 0)
        .map((result) => result.wordId),
      nextReviewAt,
    };
  }, [reviewResults, reviewWords.length]);

  const resetReviewCardState = useCallback(() => {
    setReviewRevealed(false);
    setReviewHintLevel(0);
    setClozeAnswer("");
    setClozeAnswerAttempts(0);
    setClozeAnswerCorrect(null);
    reviewStartedAtRef.current = Date.now();
  }, []);

  const stopReview = useCallback(() => {
    clearStoredReviewSession();
    stopAudio();
    setReviewing(false);
  }, [stopAudio]);

  const startReview = useCallback(() => {
    if (!visibleWords.length) return;
    const skill = skillForReviewFormat(reviewFormat);
    const candidates = visibleWords.map((word) =>
      memoryRecords[getMemoryKey(word.id, skill)] ?? createWordMemory(word.id, getUnitId(selectedChapter, selectedSection), new Date(), skill),
    );
    const queued = buildReviewQueue(candidates, reviewMode);
    if (!queued.length) {
      onMessage(reviewMode === "today" ? "目前沒有到期單字。" : "目前沒有符合此佇列的單字。");
      return;
    }
    setReviewWordIds(queued.map((record) => record.wordId));
    setReviewResults([]);
    setReviewing(true);
    setReviewIndex(0);
    resetReviewCardState();
    setReviewComplete(false);
    stopAudio();
  }, [memoryRecords, onMessage, resetReviewCardState, reviewFormat, reviewMode, selectedChapter, selectedSection, stopAudio, visibleWords]);

  useEffect(() => {
    if (restoreAttemptedRef.current || !words.length || !visibleWords.length) return;
    const stored = readStoredReviewSession();
    if (!stored || stored.chapter !== selectedChapter || stored.section !== selectedSection) {
      restoreAttemptedRef.current = true;
      return;
    }
    const availableIds = new Set(words.map((word) => word.id));
    const validWordIds = stored.wordIds.filter((wordId) => availableIds.has(wordId));
    if (!validWordIds.length || stored.index < 0 || stored.index >= validWordIds.length) {
      restoreAttemptedRef.current = true;
      clearStoredReviewSession();
      return;
    }
    const timer = window.setTimeout(() => {
      if (restoreAttemptedRef.current) return;
      restoreAttemptedRef.current = true;
      setReviewFormat(stored.format);
      setReviewMode(stored.mode);
      setReviewWordIds(validWordIds);
      setReviewResults(stored.results.filter((result) => validWordIds.includes(result.wordId)));
      setReviewIndex(Math.min(stored.index, validWordIds.length - 1));
      setReviewComplete(false);
      resetReviewCardState();
      setReviewing(true);
      onMessage("已恢復上次未完成的複習。");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onMessage, resetReviewCardState, selectedChapter, selectedSection, visibleWords.length, words]);

  useEffect(() => {
    if (!reviewing || reviewComplete || !reviewWordIds.length) return;
    const session: StoredReviewSession = {
      chapter: selectedChapter,
      section: selectedSection,
      format: reviewFormat,
      mode: reviewMode,
      wordIds: reviewWordIds,
      index: reviewIndex,
      results: reviewResults,
    };
    try {
      window.sessionStorage.setItem(REVIEW_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Session recovery is optional; restricted storage should not block learning.
    }
  }, [reviewComplete, reviewFormat, reviewIndex, reviewMode, reviewResults, reviewWordIds, reviewing, selectedChapter, selectedSection]);

  useEffect(() => {
    if (reviewComplete) clearStoredReviewSession();
  }, [reviewComplete]);

  const toggleReview = useCallback(() => {
    if (reviewing) stopReview();
    else startReview();
  }, [reviewing, startReview, stopReview]);

  const checkClozeAnswer = useCallback(() => {
    const reviewWord = reviewWords[reviewIndex];
    if (!reviewWord || reviewFormat !== "cloze" || clozeAnswerCorrect === true || clozeAnswerAttempts >= 2) return;
    const nextAttempt = clozeAnswerAttempts + 1;
    const correct = isClozeAnswerCorrect(clozeAnswer, reviewWord.word, reviewWord.reading);
    setClozeAnswerAttempts(nextAttempt);
    setClozeAnswerCorrect(correct);
    if (correct || nextAttempt >= 2) setReviewRevealed(true);
  }, [clozeAnswer, clozeAnswerAttempts, clozeAnswerCorrect, reviewFormat, reviewIndex, reviewWords]);

  const rateReview = useCallback(async (rawRating: ReviewRating) => {
    if (isSubmittingRef.current || !repository || reviewComplete) return;
    const reviewWord = reviewWords[reviewIndex];
    if (!reviewWord || (reviewFormat === "cloze" && clozeAnswerCorrect === null)) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const now = new Date();
    const skill = skillForReviewFormat(reviewFormat);
    const correct = reviewFormat === "cloze" ? clozeAnswerCorrect === true : rawRating !== "again";
    const previous = memoryRecords[getMemoryKey(reviewWord.id, skill)]
      ?? createWordMemory(reviewWord.id, getUnitId(selectedChapter, selectedSection), now, skill);
    const reviewStartedAt = reviewStartedAtRef.current ?? Date.now();
    const responseTimeMs = Math.max(0, Date.now() - reviewStartedAt);
    const reviewContext: ReviewContext = {
      reviewFormat,
      skill,
      correct,
      recalledWithoutHint: correct && reviewHintLevel === 0 && !(reviewFormat === "cloze" && clozeAnswerAttempts > 1),
      responseTimeMs,
      ...(reviewFormat === "cloze"
        ? { answerCorrect: clozeAnswerCorrect ?? false, answerAttempts: clozeAnswerAttempts }
        : {}),
    };
    try {
      const result = reviewWordMemory(previous, rawRating, reviewHintLevel, now, responseTimeMs, reviewContext);
      await repository.commitReview(result.memory, result.history, result.event);
      setReviewResults((results) => [...results, {
        wordId: result.history.wordId,
        rawRating,
        hintLevel: reviewHintLevel,
        correct,
        dueAfter: result.history.dueAfter ?? result.memory.fsrsCard.due,
      }]);
      setMemoryRecords((records) => ({ ...records, [getMemoryKey(result.memory.wordId, result.memory.skill)]: result.memory }));
      setReviewHistory((history) => [...history.filter((item) => item.id !== result.history.id), result.history]);
      setReviewEvents((events) => [...events.filter((item) => item.id !== result.event.id), result.event]);
      if (reviewIndex >= reviewWords.length - 1) {
        setReviewComplete(true);
      } else {
        setReviewIndex((index) => index + 1);
        resetReviewCardState();
      }
    } catch {
      onMessage("學習紀錄保存失敗，請再試一次。");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [clozeAnswerAttempts, clozeAnswerCorrect, memoryRecords, onMessage, repository, resetReviewCardState, reviewComplete, reviewFormat, reviewHintLevel, reviewIndex, reviewWords, selectedChapter, selectedSection, setMemoryRecords, setReviewEvents, setReviewHistory]);

  useEffect(() => {
    if (!reviewing || reviewComplete) return;
    if (reviewFormat !== "jp-to-zh" && !reviewRevealed) return;
    const reviewWord = reviewWords[reviewIndex];
    if (!reviewWord?.wordAudio) return;
    playOne({ id: `${reviewWord.id}-word`, label: `${reviewWord.word}・單字`, src: reviewWord.wordAudio });
  }, [playOne, reviewComplete, reviewFormat, reviewIndex, reviewRevealed, reviewing, reviewWords]);

  useEffect(() => {
    if (!reviewing || reviewComplete) return;
    function handleReviewShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
      const answerVisible = reviewFormat === "cloze"
        ? clozeAnswerCorrect === true || clozeAnswerAttempts >= 2
        : reviewRevealed || (reviewFormat === "zh-to-jp" ? reviewHintLevel === 4 : reviewHintLevel === 3);
      const shortcut = resolveReviewShortcut(event.code, { reviewFormat, answerVisible });
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "reveal") {
        setReviewRevealed(true);
        setReviewHintLevel(reviewFormat === "zh-to-jp" ? 4 : 3);
        return;
      }
      if (shortcut === "hint") {
        const reviewWord = reviewWords[reviewIndex];
        if (!reviewWord) return;
        const cloze = createClozeSentence(reviewWord.example, [reviewWord.word, reviewWord.reading]);
        setReviewHintLevel((level) => {
          const nextLevel: HintLevel = level === 0 ? (cloze.replaced ? 1 : 2) : level === 1 ? 2 : 3;
          if (nextLevel === 3) setReviewRevealed(true);
          return nextLevel;
        });
        return;
      }
      void rateReview(shortcut);
    }
    window.addEventListener("keydown", handleReviewShortcut);
    return () => window.removeEventListener("keydown", handleReviewShortcut);
  }, [clozeAnswerAttempts, clozeAnswerCorrect, rateReview, reviewComplete, reviewFormat, reviewHintLevel, reviewIndex, reviewRevealed, reviewWords, reviewing]);

  return {
    reviewing,
    reviewIndex,
    reviewComplete,
    reviewFormat,
    reviewRevealed,
    reviewHintLevel,
    clozeAnswer,
    clozeAnswerAttempts,
    clozeAnswerCorrect,
    isSubmitting,
    reviewMode,
    reviewWords,
    reviewPreviewCount,
    reviewSummary,
    setReviewFormat,
    setReviewMode,
    setReviewHintLevel,
    setReviewRevealed,
    setClozeAnswer,
    startReview,
    stopReview,
    toggleReview,
    checkClozeAnswer,
    rateReview,
    resetReviewCardState,
    setReviewing,
    setReviewWordIds,
    setReviewComplete,
  };
}
