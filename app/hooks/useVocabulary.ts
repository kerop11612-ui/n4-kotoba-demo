"use client";

import { useEffect, useState } from "react";
import { loadVocabulary } from "../../src/vocabulary/loader";
import type { VocabularyWord } from "../../src/vocabulary/types";

export function useVocabulary() {
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadVocabulary()
      .then((items) => {
        if (cancelled) return;
        setWords(items);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("資料載入失敗，請重新整理頁面。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { words, loading, error };
}
