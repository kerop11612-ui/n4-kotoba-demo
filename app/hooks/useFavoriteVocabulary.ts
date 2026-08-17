"use client";

import { useEffect, useMemo, useState } from "react";
import { loadVocabularyUnits } from "../../src/vocabulary/loader";
import type { VocabularyIndexItem, VocabularyWord } from "../../src/vocabulary/types";

const LOAD_ERROR = "\u6536\u85cf\u8a5e\u5eab\u8f09\u5165\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u3002";

export function useFavoriteVocabulary(items: VocabularyIndexItem[], favoriteIds: Set<string>) {
  const [state, setState] = useState({
    requestKey: "",
    words: [] as VocabularyWord[],
    error: "",
  });
  const favoriteUnitIds = useMemo(
    () => [...new Set(items.filter((item) => favoriteIds.has(item.id)).map((item) => `n4-${item.chapterNumber}-${item.sectionNumber}`))],
    [favoriteIds, items],
  );
  const favoriteIdKey = [...favoriteIds].sort().join(",");
  const requestKey = `${favoriteUnitIds.join(",")}::${favoriteIdKey}`;
  const hasFavorites = items.length > 0 && favoriteUnitIds.length > 0;

  useEffect(() => {
    if (!hasFavorites) return;

    let cancelled = false;
    loadVocabularyUnits(favoriteUnitIds)
      .then((loadedWords) => {
        if (!cancelled) {
          setState({
            requestKey,
            words: loadedWords.filter((word) => favoriteIds.has(word.id)),
            error: "",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ requestKey, words: [], error: LOAD_ERROR });
      });

    return () => {
      cancelled = true;
    };
  }, [favoriteIds, favoriteUnitIds, hasFavorites, requestKey]);

  const current = hasFavorites && state.requestKey === requestKey;
  return {
    words: current ? state.words : [],
    loading: hasFavorites && !current,
    error: current ? state.error : "",
  };
}
