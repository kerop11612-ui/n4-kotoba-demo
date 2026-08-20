"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryRepository } from "../../src/storage/memory-repository";
import { useLearningData } from "./useLearningData";
import type { ReviewHistoryRecord, VocabularyReviewEvent, WordMemoryRecord } from "../../src/spaced-repetition/types";
import { getMemoryKey } from "../../src/spaced-repetition/types";
import { createWordMemory } from "../../src/spaced-repetition/fsrs-adapter";
import { setManualMastery } from "../../src/spaced-repetition/mastery";
import { getUnitId } from "../../src/vocabulary/catalog";
import type { VocabularyWord } from "../../src/vocabulary/types";

export function useUnitMemory(
  words: VocabularyWord[],
  selectedChapter: number,
  selectedSection: number,
  enabled: boolean,
) {
  const { repository } = useLearningData();
  const repositoryRef = useRef<MemoryRepository | null>(null);
  const migrationRef = useRef<Promise<void> | null>(null);
  const [memoryRecords, setMemoryRecords] = useState<Record<string, WordMemoryRecord>>({});
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryRecord[]>([]);
  const [reviewEvents, setReviewEvents] = useState<VocabularyReviewEvent[]>([]);
  const [memoryReady, setMemoryReady] = useState(false);
  const [readyUnitId, setReadyUnitId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [errorUnitId, setErrorUnitId] = useState<string | null>(null);
  const unitId = getUnitId(selectedChapter, selectedSection);

  useEffect(() => {
    const unitWords = words.filter((word) =>
      word.chapterNumber === selectedChapter && word.sectionNumber === selectedSection,
    );
    if (!enabled || !unitWords.length) return;

    let cancelled = false;
    if (repositoryRef.current !== repository) {
      repositoryRef.current = repository;
      migrationRef.current = null;
    }

    void (async () => {
      try {
        migrationRef.current ??= repository.migrate();
        await migrationRef.current;
        const records = await repository.getUnitMemories(unitId);
        const history = await repository.getReviewHistory(unitId);
        const events = await repository.getReviewEvents(unitId);
        if (cancelled) return;
        setMemoryRecords(Object.fromEntries(records.map((record) => [getMemoryKey(record.wordId, record.skill), record])));
        setReviewHistory(history);
        setReviewEvents(events);
        setMemoryReady(true);
        setReadyUnitId(unitId);
        setError("");
        setErrorUnitId(null);
      } catch {
        migrationRef.current = null;
        if (cancelled) return;
        setMemoryRecords({});
        setReviewHistory([]);
        setReviewEvents([]);
        setError("學習資料版本過新或已損毀，請更新程式或匯入備份。");
        setErrorUnitId(unitId);
        setMemoryReady(false);
        setReadyUnitId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, repository, selectedChapter, selectedSection, unitId, words]);

  const setManualMastered = useCallback(async (wordId: string, mastered: boolean) => {
    const key = getMemoryKey(wordId, "jp_to_meaning");
    const current = memoryRecords[key] ?? createWordMemory(wordId, unitId, new Date(), "jp_to_meaning");
    const next = setManualMastery(current, mastered);
    await repository.saveWordMemory(next);
    setMemoryRecords((previous) => ({ ...previous, [key]: next }));
  }, [memoryRecords, repository, unitId]);

  return {
    repository,
    memoryRecords,
    setMemoryRecords,
    reviewHistory,
    setReviewHistory,
    reviewEvents,
    setReviewEvents,
    setManualMastered,
    memoryReady: memoryReady && readyUnitId === unitId,
    error: errorUnitId === unitId ? error : "",
  };
}
