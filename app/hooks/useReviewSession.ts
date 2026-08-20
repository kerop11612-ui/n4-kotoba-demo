"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AudioStep, DemoWord } from "../components/vocabulary";
import { createClozeSentence, isClozeAnswerCorrect } from "../../src/spaced-repetition/cloze";
import { createWordMemory, reviewWordMemory } from "../../src/spaced-repetition/fsrs-adapter";
import { buildReviewQueue, getRecentReviewWordIds, type QueueMode } from "../../src/spaced-repetition/review-queue";
import { getMemoryKey, type HintLevel, type MemorySkill, type ReviewContext, type ReviewFormat, type ReviewHistoryRecord, type ReviewRating, type VocabularyReviewEvent, type WordMemoryRecord } from "../../src/spaced-repetition/types";
import { clearReviewSession, readReviewSession, writeReviewSession, type ReviewSessionStorage, type StoredReviewSession, type StoredReviewSessionResult } from "../../src/spaced-repetition/review-session-storage";
import { scheduleReviewRetry } from "../../src/spaced-repetition/review-session-queue";
import type { MemoryRepository } from "../../src/storage/memory-repository";
import { getUnitId } from "../../src/vocabulary/catalog";
import { resolveReviewShortcut } from "../../src/spaced-repetition/study-session";
import { didRevealAnswer, didUseManualHint, needsImmediateRetry } from "../../src/spaced-repetition/review-summary";
import { createLearningEventId } from "../../src/sync/learning-events";

function skillForReviewFormat(format: ReviewFormat): MemorySkill {
  if (format === "zh-to-jp") return "meaning_to_jp";
  if (format === "cloze") return "context_to_word";
  return "jp_to_meaning";
}

export type ReviewSessionResult = StoredReviewSessionResult;

export type ReviewSessionSummary = {
  total: number;
  completed: number;
  correct: number;
  hinted: number;
  revealed: number;
  ratingCounts: Record<ReviewRating, number>;
  retryWordIds: string[];
  nextReviewAt: string | null;
};

function getReviewSessionStorage(): ReviewSessionStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clearStoredReviewSession() {
  const storage = getReviewSessionStorage();
  if (!storage) return;
  try {
    clearReviewSession(storage);
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
  reviewHistory: ReviewHistoryRecord[];
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
  reviewHistory,
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
  const [reviewHintUsed, setReviewHintUsed] = useState(false);
  const [reviewFormat, setReviewFormat] = useState<ReviewFormat>("jp-to-zh");
  const [clozeAnswer, setClozeAnswer] = useState("");
  const [clozeAnswerAttempts, setClozeAnswerAttempts] = useState(0);
  const [clozeAnswerCorrect, setClozeAnswerCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewMode, setReviewMode] = useState<QueueMode>("focused");
  const [reviewWordIds, setReviewWordIds] = useState<string[]>([]);
  const [reviewResults, setReviewResults] = useState<ReviewSessionResult[]>([]);
  const [scheduledRetryWordIds, setScheduledRetryWordIds] = useState<string[]>([]);
  const [savedReview, setSavedReview] = useState<StoredReviewSession | null>(null);
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
    const recentWordIds = getRecentReviewWordIds(reviewHistory, skill);
    return buildReviewQueue(candidates, reviewMode, new Date(), Math.random, undefined, recentWordIds).length;
  }, [memoryRecords, reviewFormat, reviewHistory, reviewMode, selectedChapter, selectedSection, visibleWords]);

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
      hinted: reviewResults.filter(didUseManualHint).length,
      revealed: reviewResults.filter(didRevealAnswer).length,
      ratingCounts,
      retryWordIds: reviewResults
        .filter(needsImmediateRetry)
        .map((result) => result.wordId),
      nextReviewAt,
    };
  }, [reviewResults, reviewWords.length]);

  const resetReviewCardState = useCallback(() => {
    setReviewRevealed(false);
    setReviewHintLevel(0);
    setReviewHintUsed(false);
    setClozeAnswer("");
    setClozeAnswerAttempts(0);
    setClozeAnswerCorrect(null);
    reviewStartedAtRef.current = Date.now();
  }, []);

  const setReviewHintLevelForCard = useCallback((nextLevel: HintLevel | ((level: HintLevel) => HintLevel)) => {
    setReviewHintLevel((currentLevel) => {
      const level = typeof nextLevel === "function" ? nextLevel(currentLevel) : nextLevel;
      const fullAnswerLevel = reviewFormat === "zh-to-jp" ? 4 : reviewFormat === "jp-to-zh" ? 3 : 0;
      if (level > 0 && (reviewFormat === "cloze" || level < fullAnswerLevel)) {
        setReviewHintUsed(true);
      }
      return level;
    });
  }, [reviewFormat]);

  function normalizeReviewResult(result: StoredReviewSessionResult, format: ReviewFormat): ReviewSessionResult {
    const reviewFormatForResult = result.reviewFormat ?? format;
    return {
      ...result,
      reviewFormat: reviewFormatForResult,
      usedHint: result.usedHint ?? didUseManualHint({ ...result, reviewFormat: reviewFormatForResult }),
      answerRevealed: result.answerRevealed ?? didRevealAnswer({ ...result, reviewFormat: reviewFormatForResult }),
    };
  }

  const stopReview = useCallback(() => {
    stopAudio();
    if (reviewComplete) {
      clearStoredReviewSession();
      setSavedReview(null);
    } else if (reviewWordIds.length) {
      const session: StoredReviewSession = {
        chapter: selectedChapter,
        section: selectedSection,
        format: reviewFormat,
        mode: reviewMode,
        wordIds: reviewWordIds,
        index: reviewIndex,
        results: reviewResults,
        retryWordIds: scheduledRetryWordIds,
      };
      const storage = getReviewSessionStorage();
      if (storage) {
        try {
          writeReviewSession(storage, session);
        } catch {
          // Session recovery is optional; restricted storage should not block learning.
        }
      }
      setSavedReview(session);
    }
    setReviewing(false);
  }, [reviewComplete, reviewFormat, reviewIndex, reviewMode, reviewResults, reviewWordIds, scheduledRetryWordIds, selectedChapter, selectedSection, stopAudio]);

  const discardReview = useCallback(() => {
    clearStoredReviewSession();
    stopAudio();
    setSavedReview(null);
    setReviewWordIds([]);
    setReviewResults([]);
    setScheduledRetryWordIds([]);
    setReviewComplete(false);
    setReviewing(false);
  }, [stopAudio]);

  const startReview = useCallback(() => {
    if (!visibleWords.length) return;
    const skill = skillForReviewFormat(reviewFormat);
    const candidates = visibleWords.map((word) =>
      memoryRecords[getMemoryKey(word.id, skill)] ?? createWordMemory(word.id, getUnitId(selectedChapter, selectedSection), new Date(), skill),
    );
    const restartWordId = savedReview?.wordIds[savedReview.index];
    const recentWordIds = getRecentReviewWordIds(reviewHistory, skill);
    const queued = buildReviewQueue(candidates, reviewMode, new Date(), Math.random, restartWordId, recentWordIds);
    if (!queued.length) {
      onMessage(reviewMode === "today" ? "目前沒有到期單字。" : "目前沒有符合此佇列的單字。");
      return;
    }
    setReviewWordIds(queued.map((record) => record.wordId));
    setReviewResults([]);
    setScheduledRetryWordIds([]);
    clearStoredReviewSession();
    setSavedReview(null);
    setReviewing(true);
    setReviewIndex(0);
    resetReviewCardState();
    setReviewComplete(false);
    stopAudio();
  }, [memoryRecords, onMessage, resetReviewCardState, reviewFormat, reviewHistory, reviewMode, savedReview, selectedChapter, selectedSection, stopAudio, visibleWords]);

  const resumeReview = useCallback(() => {
    if (!savedReview) return;
    const availableIds = new Set(words.map((word) => word.id));
    const validWordIds = savedReview.wordIds.filter((wordId) => availableIds.has(wordId));
    if (!validWordIds.length || savedReview.index < 0 || savedReview.index >= validWordIds.length) {
      discardReview();
      return;
    }
    setReviewFormat(savedReview.format);
    setReviewMode(savedReview.mode);
    setReviewWordIds(validWordIds);
    setScheduledRetryWordIds(savedReview.retryWordIds?.filter((wordId) => validWordIds.includes(wordId)) ?? []);
    setReviewResults(
      savedReview.results
        .filter((result) => validWordIds.includes(result.wordId))
        .map((result) => normalizeReviewResult(result, savedReview.format)),
    );
    setReviewIndex(Math.min(savedReview.index, validWordIds.length - 1));
    setReviewComplete(false);
    resetReviewCardState();
    setSavedReview(null);
    setReviewing(true);
    stopAudio();
    onMessage(`已繼續第 ${savedReview.index + 1} 題。`);
  }, [discardReview, onMessage, resetReviewCardState, savedReview, stopAudio, words]);

  useEffect(() => {
    if (restoreAttemptedRef.current || !words.length || !visibleWords.length) return;
    const storage = getReviewSessionStorage();
    const stored = storage ? readReviewSession(storage) : null;
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
      setSavedReview({
        ...stored,
        wordIds: validWordIds,
        retryWordIds: stored.retryWordIds?.filter((wordId) => validWordIds.includes(wordId)),
        results: stored.results
          .filter((result) => validWordIds.includes(result.wordId))
          .map((result) => normalizeReviewResult(result, stored.format)),
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onMessage, resetReviewCardState, selectedChapter, selectedSection, visibleWords.length, words]);

  useEffect(() => {
    if (reviewComplete || !reviewWordIds.length) return;
    const session: StoredReviewSession = {
      chapter: selectedChapter,
      section: selectedSection,
      format: reviewFormat,
      mode: reviewMode,
      wordIds: reviewWordIds,
      index: reviewIndex,
      results: reviewResults,
      retryWordIds: scheduledRetryWordIds,
    };
    const storage = getReviewSessionStorage();
    if (storage) {
      try {
        writeReviewSession(storage, session);
      } catch {
        // Session recovery is optional; restricted storage should not block learning.
      }
    }
  }, [reviewComplete, reviewFormat, reviewIndex, reviewMode, reviewResults, reviewWordIds, reviewing, scheduledRetryWordIds, selectedChapter, selectedSection]);

  useEffect(() => {
    if (reviewComplete) {
      clearStoredReviewSession();
    }
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
    const answerRevealed = reviewFormat === "cloze"
      ? clozeAnswerCorrect === true || clozeAnswerAttempts >= 2
      : reviewRevealed || (reviewFormat === "zh-to-jp" ? reviewHintLevel === 4 : reviewHintLevel === 3);
    const previous = memoryRecords[getMemoryKey(reviewWord.id, skill)]
      ?? createWordMemory(reviewWord.id, getUnitId(selectedChapter, selectedSection), now, skill);
    const reviewStartedAt = reviewStartedAtRef.current ?? Date.now();
    const responseTimeMs = Math.max(0, Date.now() - reviewStartedAt);
    const reviewContext: ReviewContext = {
      eventId: createLearningEventId(),
      reviewFormat,
      skill,
      correct,
      usedHint: reviewHintUsed,
      answerRevealed,
      recalledWithoutHint: correct && reviewHintLevel === 0 && !(reviewFormat === "cloze" && clozeAnswerAttempts > 1),
      responseTimeMs,
      ...(reviewFormat === "cloze"
        ? { answerCorrect: clozeAnswerCorrect ?? false, answerAttempts: clozeAnswerAttempts }
        : {}),
    };
    try {
      const result = reviewWordMemory(previous, rawRating, reviewHintLevel, now, responseTimeMs, reviewContext);
      await repository.commitReview(result.memory, result.history, result.event);
      const retryPlan = scheduleReviewRetry(
        reviewWordIds,
        reviewIndex,
        result.history.wordId,
        needsImmediateRetry({
          rawRating,
          hintLevel: reviewHintLevel,
          reviewFormat,
          usedHint: reviewHintUsed,
          answerRevealed,
        }),
        scheduledRetryWordIds,
      );
      setReviewResults((results) => [...results, {
        wordId: result.history.wordId,
        rawRating,
        hintLevel: reviewHintLevel,
        correct,
        dueAfter: result.history.dueAfter ?? result.memory.fsrsCard.due,
        reviewFormat,
        usedHint: reviewHintUsed,
        answerRevealed,
      }]);
      setMemoryRecords((records) => ({ ...records, [getMemoryKey(result.memory.wordId, result.memory.skill)]: result.memory }));
      setReviewHistory((history) => [...history.filter((item) => item.id !== result.history.id), result.history]);
      setReviewEvents((events) => [...events.filter((item) => item.id !== result.event.id), result.event]);
      setReviewWordIds(retryPlan.wordIds);
      setScheduledRetryWordIds(retryPlan.retryWordIds);
      if (reviewIndex >= reviewWords.length - 1 && !retryPlan.scheduled) {
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
  }, [clozeAnswerAttempts, clozeAnswerCorrect, memoryRecords, onMessage, repository, resetReviewCardState, reviewComplete, reviewFormat, reviewHintLevel, reviewHintUsed, reviewIndex, reviewRevealed, reviewWords, reviewWordIds, scheduledRetryWordIds, selectedChapter, selectedSection, setMemoryRecords, setReviewEvents, setReviewHistory]);

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
        setReviewHintLevelForCard(reviewFormat === "zh-to-jp" ? 4 : 3);
        return;
      }
      if (shortcut === "hint") {
        const reviewWord = reviewWords[reviewIndex];
        if (!reviewWord) return;
        const cloze = createClozeSentence(reviewWord.example, [reviewWord.word, reviewWord.reading]);
        setReviewHintLevelForCard((level) => {
          const nextLevel: HintLevel = reviewFormat === "zh-to-jp"
            ? level === 0 ? 1 : level === 1 ? 2 : 3
            : level === 0 ? (cloze.replaced ? 1 : 2) : level === 1 ? 2 : 3;
          if (reviewFormat === "jp-to-zh" && nextLevel === 3) setReviewRevealed(true);
          return nextLevel;
        });
        return;
      }
      void rateReview(shortcut);
    }
    window.addEventListener("keydown", handleReviewShortcut);
    return () => window.removeEventListener("keydown", handleReviewShortcut);
  }, [clozeAnswerAttempts, clozeAnswerCorrect, rateReview, reviewComplete, reviewFormat, reviewHintLevel, reviewIndex, reviewRevealed, reviewWords, reviewing, setReviewHintLevelForCard]);

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
    reviewResume: savedReview
      ? { index: savedReview.index, total: savedReview.wordIds.length }
      : null,
    setReviewFormat,
    setReviewMode,
    setReviewHintLevel: setReviewHintLevelForCard,
    setReviewRevealed,
    setClozeAnswer,
    startReview,
    resumeReview,
    stopReview,
    discardReview,
    toggleReview,
    checkClozeAnswer,
    rateReview,
    resetReviewCardState,
    setReviewing,
    setReviewWordIds,
    setReviewComplete,
  };
}
