"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "../demo.module.css";

type FavoriteWord = {
  id: string;
  number: number;
  chapterNumber: number;
  sectionNumber: number;
  word: string;
  reading: string;
  partOfSpeech: string;
  meaningZhTw: string;
  example: string;
  exampleZhTw: string;
  wordAudio: string;
  sentenceAudio: string;
};

const FAVORITES_KEY = "kotoba-demo-favorites";

export default function FavoritesPage() {
  const [words, setWords] = useState<FavoriteWord[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]");
      return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : []);
    } catch {
      return new Set();
    }
  });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("載入收藏清單中…");

  useEffect(() => {
    fetch("/vocabulary-n4.json")
      .then((response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json() as Promise<FavoriteWord[]>;
      })
      .then((items) => {
        setWords(items);
        setMessage("");
      })
      .catch(() => setMessage("單字資料載入失敗，請重新整理頁面。"));

  }, []);

  const favoriteWords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return words.filter((word) => {
      if (!favoriteIds.has(word.id)) return false;
      if (!normalizedQuery) return true;
      return [word.word, word.reading, word.meaningZhTw, word.exampleZhTw]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [favoriteIds, query, words]);

  function removeFavorite(id: string) {
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>N4</span>
          <span>
            <strong>N4 ことば帳</strong>
            <small>FAVORITES</small>
          </span>
        </Link>
        <Link className={styles.unitMapLink} href="/">返回單字庫</Link>
      </header>

      <section className={styles.workspace}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>N4 學習清單</p>
            <h1>收藏單字</h1>
          </div>
          <span className={styles.wordCount}>{favoriteIds.size} WORDS</span>
        </header>

        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            <span className={styles.visuallyHidden}>搜尋收藏單字</span>
            <input
              type="search"
              value={query}
              placeholder="搜尋單字、假名或中文"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Link className={styles.unitMapLink} href="/">開始學習</Link>
        </div>

        {message && <p className={styles.notice} role="status">{message}</p>}

        {!message && favoriteWords.length > 0 && (
          <div className={styles.cardGrid}>
            {favoriteWords.map((word) => (
              <article className={styles.card} key={word.id}>
                <div className={styles.cardHeading}>
                  <div>
                    <h2 className={styles.favoriteWord} lang="ja">{word.word}</h2>
                    <span className={styles.reading} lang="ja">{word.reading}</span>
                  </div>
                  <button
                    className={styles.favoriteButton}
                    type="button"
                    aria-label={`取消收藏${word.word}`}
                    title="取消收藏"
                    onClick={() => removeFavorite(word.id)}
                  >
                    ★
                  </button>
                  <span className={styles.partOfSpeech}>{word.partOfSpeech}</span>
                </div>

                <div className={styles.meaningRow}>
                  <p className={styles.meaning}>{word.meaningZhTw}</p>
                  <span className={styles.wordNumber}>#{String(word.number).padStart(3, "0")}</span>
                </div>

                <div className={styles.exampleBlock}>
                  <div className={styles.exampleCopy}>
                    <p className={styles.exampleJapanese} lang="ja">{word.example}</p>
                    <p className={styles.exampleTranslation}>{word.exampleZhTw}</p>
                  </div>
                  <div className={styles.favoriteCardActions}>
                    <audio className={styles.favoriteAudio} controls preload="none" src={word.wordAudio} aria-label={`${word.word} 單字音檔`} />
                    <audio className={styles.favoriteAudio} controls preload="none" src={word.sentenceAudio} aria-label={`${word.word} 例句音檔`} />
                  </div>
                </div>

                <Link
                  className={styles.favoriteOpenLink}
                  href={`/?chapter=${word.chapterNumber}&section=${word.sectionNumber}`}
                >
                  開啟原單字卡 →
                </Link>
              </article>
            ))}
          </div>
        )}

        {!message && favoriteWords.length === 0 && (
          <div className={styles.emptyState}>
            <strong>{favoriteIds.size ? "找不到符合的收藏單字" : "還沒有收藏單字"}</strong>
            <span>{favoriteIds.size ? "試試其他搜尋關鍵字。" : "回到單字庫，按下星號即可加入收藏。"}</span>
            <Link className={styles.favoriteOpenLink} href="/">前往單字庫</Link>
          </div>
        )}
      </section>
    </main>
  );
}
