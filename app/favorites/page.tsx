"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "../demo.module.css";
import { AppNav } from "../components/AppNav";
import { renderRuby, StarIcon } from "../components/vocabulary";
import { useFavorites } from "../hooks/useFavorites";
import { useFavoriteVocabulary } from "../hooks/useFavoriteVocabulary";
import { useVocabularyIndex } from "../hooks/useVocabularyIndex";
import { searchVocabulary } from "../../src/vocabulary/selectors";

export default function FavoritesPage() {
  const { items, loading: indexLoading, error: indexError } = useVocabularyIndex();
  const { favoriteIds, toggleFavorite, error: favoriteError } = useFavorites();
  const { words, loading: favoriteLoading, error: favoriteErrorMessage } = useFavoriteVocabulary(items, favoriteIds);
  const [query, setQuery] = useState("");
  const message = indexError || favoriteError || favoriteErrorMessage || (indexLoading || favoriteLoading ? "載入收藏清單中…" : "");
  const validFavoriteIds = useMemo(
    () => new Set(items.filter((item) => favoriteIds.has(item.id)).map((item) => item.id)),
    [favoriteIds, items],
  );

  const favoriteWords = useMemo(() => {
    return searchVocabulary(words.filter((word) => favoriteIds.has(word.id)), query);
  }, [favoriteIds, query, words]);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <AppNav active="favorites" />
      </header>

      <section className={styles.workspace}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>N4 學習清單</p>
            <h1>收藏單字</h1>
          </div>
          <span className={styles.wordCount}>{validFavoriteIds.size} 個收藏</span>
        </header>

        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            <span className={styles.searchLabel}>搜尋收藏</span>
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
                    onClick={() => toggleFavorite(word.id)}
                  >
                    <StarIcon filled />
                  </button>
                  <span className={styles.partOfSpeech}>{word.partOfSpeech}</span>
                </div>

                <div className={styles.meaningRow}>
                  <p className={styles.meaning}>{word.meaningZhTw}</p>
                  <span className={styles.wordNumber}>#{String(word.number).padStart(3, "0")}</span>
                </div>

                <div className={styles.exampleBlock}>
                  <div className={styles.exampleCopy}>
                    <p className={styles.exampleJapanese} lang="ja">{renderRuby(word.example)}</p>
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
