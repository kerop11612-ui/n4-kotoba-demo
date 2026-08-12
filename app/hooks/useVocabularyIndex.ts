"use client";

import { useEffect, useState } from "react";
import { loadVocabularyIndex } from "../../src/vocabulary/loader";
import type { VocabularyIndex } from "../../src/vocabulary/types";

export function useVocabularyIndex() {
  const [index, setIndex] = useState<VocabularyIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadVocabularyIndex()
      .then((value) => {
        if (cancelled) return;
        setIndex(value);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("詞庫索引載入失敗，請重新整理頁面。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    items: index?.items ?? [],
    totalWords: index?.totalWords ?? 0,
    loading,
    error,
  };
}
