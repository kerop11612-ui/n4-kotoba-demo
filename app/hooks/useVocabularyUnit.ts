"use client";

import { useEffect, useState } from "react";
import { loadVocabularyUnit } from "../../src/vocabulary/loader";
import type { VocabularyWord } from "../../src/vocabulary/types";

const LOAD_ERROR = "\u8a5e\u5eab\u8f09\u5165\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u3002";

export function useVocabularyUnit(chapterNumber: number, sectionNumber: number, enabled: boolean) {
  const [state, setState] = useState({
    unitId: "",
    words: [] as VocabularyWord[],
    error: "",
  });
  const unitId = `n4-${chapterNumber}-${sectionNumber}`;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    loadVocabularyUnit(unitId)
      .then((words) => {
        if (!cancelled) setState({ unitId, words, error: "" });
      })
      .catch(() => {
        if (!cancelled) setState({ unitId, words: [], error: LOAD_ERROR });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, unitId]);

  const current = enabled && state.unitId === unitId;
  return {
    words: current ? state.words : [],
    loading: enabled && !current,
    error: current ? state.error : "",
  };
}
