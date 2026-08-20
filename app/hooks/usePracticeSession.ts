"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildPracticeQueue, skillForReviewFormat, type PracticeWordRef } from "../../src/spaced-repetition/practice-queue";
import { currentRetrievability } from "../../src/spaced-repetition/retrievability";
import { isManualMasteryDue } from "../../src/spaced-repetition/mastery";
import { getRecentReviewWordIds } from "../../src/spaced-repetition/review-queue";
import { estimateReviewMinutes } from "../../src/spaced-repetition/study-session";
import type { MemorySkill, ReviewFormat, ReviewHistoryRecord, VocabularyReviewEvent, WordMemoryRecord } from "../../src/spaced-repetition/types";
import { getMemoryKey } from "../../src/spaced-repetition/types";
import { loadVocabularyUnits } from "../../src/vocabulary/loader";
import type { VocabularyWord } from "../../src/vocabulary/types";
import { readPracticeSession, writePracticeSession, clearPracticeSession } from "../../src/spaced-repetition/practice-session-storage";
import { useLearningData } from "./useLearningData";
import { useAudioPlayer } from "./useAudioPlayer";
import { useReviewSession } from "./useReviewSession";

function getPracticeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getCandidateMemory(
  records: Record<string, WordMemoryRecord>,
  ref: PracticeWordRef,
  skill: MemorySkill,
): WordMemoryRecord | undefined {
  return records[getMemoryKey(ref.wordId, skill)] ?? records[getMemoryKey(ref.wordId, "jp_to_meaning")];
}

export function usePracticeSession() {
  const { repository, authStatus, syncStatus, user, pendingCount } = useLearningData();
  const [format, setFormat] = useState<ReviewFormat>("jp-to-zh");
  const [memoryRecords, setMemoryRecords] = useState<Record<string, WordMemoryRecord>>({});
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryRecord[]>([]);
  const [, setReviewEvents] = useState<VocabularyReviewEvent[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [queueWords, setQueueWords] = useState<VocabularyWord[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");

  useEffect(() => {
    if (authStatus === "loading") return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      setDataLoading(true);
      try {
        await repository.migrate();
        const data = await repository.exportData();
        if (cancelled) return;
        setMemoryRecords(data.memories);
        setReviewHistory(data.history);
        setReviewEvents(data.events);
        setDataError("");
      } catch {
        if (!cancelled) {
          setMemoryRecords({});
          setReviewHistory([]);
          setReviewEvents([]);
          setDataError("學習資料載入失敗，請重新同步或稍後再試。");
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, repository]);

  const queueRefs = useMemo(() => {
    const skill = skillForReviewFormat(format);
    const recentWordIds = getRecentReviewWordIds(reviewHistory, skill);
    return buildPracticeQueue(Object.values(memoryRecords), format, new Date(), Math.random, recentWordIds);
  }, [format, memoryRecords, reviewHistory]);

  useEffect(() => {
    if (dataLoading || dataError) return;
    let cancelled = false;
    void (async () => {
      if (!queueRefs.length) {
        setQueueWords([]);
        setQueueError("");
        setQueueLoading(false);
        return;
      }
      setQueueLoading(true);
      try {
        const loadedWords = await loadVocabularyUnits(queueRefs.map((ref) => ref.unitId));
        if (cancelled) return;
        const byId = new Map(loadedWords.map((word) => [word.id, word]));
        const orderedWords = queueRefs
          .map((ref) => byId.get(ref.wordId))
          .filter((word): word is VocabularyWord => Boolean(word));
        setQueueWords(orderedWords);
        setQueueError(orderedWords.length === queueRefs.length ? "" : "部分練習單字載入失敗，請稍後再試。");
      } catch {
        if (!cancelled) {
          setQueueWords([]);
          setQueueError("練習單字載入失敗，請重新整理頁面。");
        }
      } finally {
        if (!cancelled) setQueueLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataError, dataLoading, queueRefs]);

  const practiceScope = useMemo(() => {
    const storage = getPracticeStorage();
    return {
      wordRefs: queueRefs,
      readSession: () => {
        const session = storage ? readPracticeSession(storage) : null;
        return session?.format === format ? session : null;
      },
      writeSession: (session: Parameters<typeof writePracticeSession>[1]) => {
        if (storage) writePracticeSession(storage, session);
      },
      clearSession: () => {
        if (storage) clearPracticeSession(storage);
      },
    };
  }, [format, queueRefs]);

  const audio = useAudioPlayer({ words: queueWords, visibleWords: queueWords, onMessage: () => undefined });
  const review = useReviewSession({
    words: queueWords,
    visibleWords: queueWords,
    memoryRecords,
    setMemoryRecords,
    repository,
    selectedChapter: 0,
    selectedSection: 0,
    reviewHistory,
    setReviewHistory,
    setReviewEvents,
    playOne: audio.playOne,
    stopAudio: audio.stopAudio,
    onMessage: () => undefined,
    practiceScope,
  });

  const applyReviewFormat = review.setReviewFormat;
  const setReviewFormat = useCallback((nextFormat: ReviewFormat) => {
    setFormat(nextFormat);
    applyReviewFormat(nextFormat);
  }, [applyReviewFormat]);

  const selectedSkill = skillForReviewFormat(format);
  const queueStats = useMemo(() => {
    let due = 0;
    let weak = 0;
    const now = new Date();
    for (const ref of queueRefs) {
      const memory = getCandidateMemory(memoryRecords, ref, selectedSkill);
      if (!memory) continue;
      const dueAt = Date.parse(memory.fsrsCard.due);
      if (isManualMasteryDue(memory, now) || (Number.isFinite(dueAt) && dueAt <= now.getTime())) due += 1;
      if (currentRetrievability(memory, now) < 0.7) weak += 1;
    }
    return { due, weak };
  }, [memoryRecords, queueRefs, selectedSkill]);

  const loading = authStatus === "loading" || dataLoading || queueLoading;
  const error = dataError || queueError;
  const estimatedMinutes = estimateReviewMinutes(queueWords.length || queueRefs.length);

  return {
    ...review,
    ...audio,
    format,
    setReviewFormat,
    queueRefs,
    queueWords,
    loading,
    error,
    empty: !loading && !error && queueRefs.length === 0,
    dueCount: queueStats.due,
    weakCount: queueStats.weak,
    queueLength: queueWords.length || queueRefs.length,
    estimatedMinutes,
    syncStatus,
    user,
    pendingCount,
  };
}
