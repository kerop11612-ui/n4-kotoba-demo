"use client";

import { useCallback, useEffect, useState } from "react";
import { readFavoriteIds, writeFavoriteIds } from "../../src/storage/favorites";

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setFavoriteIds(readFavoriteIds()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    const next = new Set(favoriteIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      writeFavoriteIds(next);
      setFavoriteIds(next);
      setError("");
    } catch {
      setError("收藏資料無法保存，請檢查瀏覽器儲存空間。");
    }
  }, [favoriteIds]);

  return { favoriteIds, toggleFavorite, error };
}
