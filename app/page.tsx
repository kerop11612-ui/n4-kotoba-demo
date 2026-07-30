"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import styles from "./demo.module.css";
import { createClozeSentence } from "../src/spaced-repetition/cloze";
import { createWordMemory, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter";
import { buildReviewQueue, type QueueMode } from "../src/spaced-repetition/review-queue";
import { calculateUnitStats } from "../src/spaced-repetition/unit-stats";
import type { HintLevel, ReviewRating, UnitStats, WordMemoryRecord } from "../src/spaced-repetition/types";
import { LocalStorageMemoryRepository } from "../src/storage/memory-repository";

type DemoWord = {
  id: string;
  number: number;
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
  word: string;
  reading: string;
  partOfSpeech: string;
  meaningZhTw: string;
  example: string;
  exampleZhTw: string;
  wordAudio: string;
  sentenceAudio: string;
};

type AudioStep = {
  id: string;
  label: string;
  src: string;
};
type PlaybackMode = "word" | "sentence" | "both";
const DEMO_UNIT_ID = "n4-1-1";

function renderRuby(text: string): ReactNode[] {
  const output: ReactNode[] = [];
  const matcher = /([一-龯々〆ヵヶ0-9０-９]+)\[([^\]]+)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > cursor) {
      output.push(
        <Fragment key={`text-${cursor}`}>{text.slice(cursor, match.index)}</Fragment>,
      );
    }
    output.push(
      <ruby key={`ruby-${match.index}`}>
        {match[1]}
        <rt>{match[2]}</rt>
      </ruby>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    output.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor)}</Fragment>);
  }
  return output;
}

function AudioIcon() {
  return <span className={styles.audioIcon} aria-hidden="true" />;
}

export default function DemoPage() {
  const [words, setWords] = useState<DemoWord[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = JSON.parse(window.localStorage.getItem("kotoba-demo-favorites") ?? "[]");
      return new Set(Array.isArray(stored) ? stored.filter((value) => typeof value === "string") : []);
    } catch {
      return new Set();
    }
  });
  const [search, setSearch] = useState("");
  const [showMeaning, setShowMeaning] = useState(true);
  const [showExample, setShowExample] = useState(true);
  const [showExampleTranslation, setShowExampleTranslation] = useState(true);
  const [blurTranslations, setBlurTranslations] = useState(true);
  const [expandedExamples, setExpandedExamples] = useState<Set<string>>(new Set());
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("both");
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [reviewHintLevel, setReviewHintLevel] = useState<HintLevel>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [reviewMode, setReviewMode] = useState<QueueMode>("unit");
  const [reviewWordIds, setReviewWordIds] = useState<string[]>([]);
  const [memoryRecords, setMemoryRecords] = useState<Record<string, WordMemoryRecord>>({});
  const [memoryReady, setMemoryReady] = useState(false);
  const [reviewHistory, setReviewHistory] = useState<Awaited<ReturnType<LocalStorageMemoryRepository["getReviewHistory"]>>>([]);
  const repositoryRef = useRef<LocalStorageMemoryRepository | null>(null);
  const [audioSteps, setAudioSteps] = useState<AudioStep[]>([]);
  const [audioIndex, setAudioIndex] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioRate, setAudioRate] = useState(1);
  const [repeatCount, setRepeatCount] = useState<1 | 2 | 3>(1);
  const [message, setMessage] = useState("正在準備 N4 單字…");
  const audioRef = useRef<HTMLAudioElement>(null);

  if (!repositoryRef.current) repositoryRef.current = new LocalStorageMemoryRepository();

  useEffect(() => {
    fetch("/vocabulary-n4.json")
      .then((response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json() as Promise<DemoWord[]>;
      })
      .then((items) => {
        setWords(items);
        setMessage("");
      })
      .catch(() => setMessage("資料載入失敗，請重新整理頁面。"));
  }, []);

  useEffect(() => {
    if (!words.length || !repositoryRef.current) return;
    const repository = repositoryRef.current;
    void repository.migrate().then(async () => {
      // Read by word id so records migrated from the legacy app (unitId="legacy")
      // remain visible in this demo unit until the user reviews them again.
      const records = (await Promise.all(words
        .filter((word) => word.chapterNumber === 1 && word.sectionNumber === 1)
        .map((word) => repository.getWordMemory(word.id))))
        .filter((record): record is WordMemoryRecord => Boolean(record));
      const history = await repository.getReviewHistory(DEMO_UNIT_ID);
      setMemoryRecords(Object.fromEntries(records.map((record) => [record.wordId, record])));
      setReviewHistory(history);
    }).finally(() => setMemoryReady(true));
  }, [words]);

  const visibleWords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return words.filter((word) => {
      const matchesSection =
        word.chapterNumber === 1 && word.sectionNumber === 1;
      const matchesSearch =
        !query ||
        [word.word, word.reading, word.meaningZhTw, word.exampleZhTw].some(
          (value) => value.toLocaleLowerCase().includes(query),
        );
      return matchesSection && matchesSearch;
    });
  }, [search, words]);

  const unitStats = useMemo<UnitStats>(() => {
    const records = visibleWords.map((word) => memoryRecords[word.id]).filter(Boolean);
    return calculateUnitStats(records, visibleWords.length, reviewHistory);
  }, [memoryRecords, reviewHistory, visibleWords]);

  const reviewWords = useMemo(
    () => (reviewWordIds.length ? reviewWordIds : visibleWords.map((word) => word.id))
      .map((id) => words.find((word) => word.id === id))
      .filter((word): word is DemoWord => Boolean(word)),
    [reviewWordIds, visibleWords, words],
  );

  const currentAudio = audioSteps[audioIndex];
  const isPlaylist = audioSteps.length > 1;
  const currentWord = currentAudio
    ? words.find((word) => currentAudio.id.startsWith(word.id))
    : undefined;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentAudio) return;
    audio.src = currentAudio.src;
    audio.playbackRate = audioRate;
    audio.currentTime = 0;
    void audio
      .play()
      .then(() => setIsAudioPlaying(true))
      .catch(() => {
        setIsAudioPlaying(false);
        setMessage("請再按一次播放。");
      });
  }, [audioRate, currentAudio]);

  useEffect(() => {
    if (!reviewing || reviewComplete) return;
    const reviewWord = reviewWords[reviewIndex];
    if (!reviewWord?.wordAudio) return;
    playOne({
      id: `${reviewWord.id}-word`,
      label: `${reviewWord.word}・單字`,
      src: reviewWord.wordAudio,
    });
  }, [reviewComplete, reviewIndex, reviewing, reviewWords]);

  useEffect(() => {
    if (!reviewing || reviewComplete) return;
    function handleReviewShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
      if (event.code === "Space") {
        event.preventDefault();
        setReviewRevealed(true);
        setReviewHintLevel(3);
        return;
      }
      if (event.code === "KeyH") {
        event.preventDefault();
        const reviewWord = reviewWords[reviewIndex];
        if (!reviewWord) return;
        const cloze = createClozeSentence(reviewWord.example, [reviewWord.word, reviewWord.reading]);
        setReviewHintLevel((level) => {
          const nextLevel: HintLevel = level === 0
            ? (cloze.replaced ? 1 : 2)
            : level === 1
              ? 2
              : 3;
          if (nextLevel === 3) setReviewRevealed(true);
          return nextLevel;
        });
      }
    }
    window.addEventListener("keydown", handleReviewShortcut);
    return () => window.removeEventListener("keydown", handleReviewShortcut);
  }, [reviewComplete, reviewIndex, reviewing, reviewWords]);

  function playOne(step: AudioStep) {
    setMessage("");
    setAudioIndex(0);
    setAudioSteps([step]);
  }

  function startReview() {
    if (!visibleWords.length) return;
    const candidates = visibleWords.map((word) =>
      memoryRecords[word.id] ?? createWordMemory(word.id, DEMO_UNIT_ID),
    );
    const queued = buildReviewQueue(candidates, reviewMode);
    if (!queued.length) {
      setMessage(reviewMode === "today" ? "目前沒有到期單字。" : "目前沒有符合此佇列的單字。");
      return;
    }
    setReviewWordIds(queued.map((record) => record.wordId));
    setReviewing(true);
    setReviewIndex(0);
    setReviewRevealed(false);
    setReviewHintLevel(0);
    setReviewComplete(false);
    stopAudio();
  }

  async function rateReview(rawRating: ReviewRating) {
    if (isSubmittingRef.current || !repositoryRef.current || reviewComplete) return;
    const reviewWord = reviewWords[reviewIndex];
    if (!reviewWord) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const now = new Date();
    const previous = memoryRecords[reviewWord.id] ?? createWordMemory(reviewWord.id, DEMO_UNIT_ID, now);
    const result = reviewWordMemory(previous, rawRating, reviewHintLevel, now);
    try {
      await repositoryRef.current.saveWordMemory(result.memory);
      await repositoryRef.current.appendReviewHistory(result.history);
      setMemoryRecords((records) => ({ ...records, [reviewWord.id]: result.memory }));
      setReviewHistory((history) => [...history, result.history]);
      if (reviewIndex >= reviewWords.length - 1) {
        setReviewComplete(true);
      } else {
        setReviewIndex((index) => index + 1);
        setReviewRevealed(false);
        setReviewHintLevel(0);
      }
    } catch {
      setMessage("學習紀錄保存失敗，請再試一次。");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function toggleFavorite(id: string) {
    setFavorites((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("kotoba-demo-favorites", JSON.stringify([...next]));
      return next;
    });
  }

  function toggleExample(id: string) {
    setExpandedExamples((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function playVisibleWords(startIndex = 0) {
    const baseSteps = visibleWords.slice(startIndex).flatMap((word) => {
      const wordStep = word.wordAudio
        ? {
            id: `${word.id}-word`,
            label: `${word.word}・單字`,
            src: word.wordAudio,
          }
        : null;
      const sentenceStep = word.sentenceAudio
        ? {
            id: `${word.id}-sentence`,
            label: `${word.word}・例句`,
            src: word.sentenceAudio,
          }
        : null;
      return playbackMode === "word"
        ? wordStep ? [wordStep] : []
        : playbackMode === "sentence"
          ? sentenceStep ? [sentenceStep] : []
          : [wordStep, sentenceStep].filter(
              (step): step is AudioStep => Boolean(step),
            );
    });
    const steps = baseSteps.flatMap((step) =>
      Array.from({ length: repeatCount }, () => step),
    );
    if (!steps.length) return;
    setMessage("");
    setAudioIndex(0);
    setAudioSteps(steps);
  }

  function stopAudio() {
    audioRef.current?.pause();
    setIsAudioPlaying(false);
    setAudioSteps([]);
    setAudioIndex(0);
  }

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio || !currentAudio) return;
    if (isAudioPlaying) {
      audio.pause();
      setIsAudioPlaying(false);
      return;
    }
    void audio.play().then(() => setIsAudioPlaying(true));
  }

  function jumpAudio(offset: number) {
    if (!isPlaylist) return;
    setAudioIndex((index) =>
      Math.max(0, Math.min(index + offset, audioSteps.length - 1)),
    );
  }

  function handleAudioEnded() {
    setIsAudioPlaying(false);
    if (audioIndex < audioSteps.length - 1) {
      setAudioIndex((index) => index + 1);
    } else {
      setAudioSteps([]);
      setAudioIndex(0);
    }
  }

  if (!words.length) {
    return (
      <main className={styles.loading}>
        <div className={styles.loadingMark}>N4</div>
        <p>{message}</p>
      </main>
    );
  }

  return (
    <main className={`${styles.page} ${blurTranslations ? styles.blurTranslations : ""}`}>
      <audio
        ref={audioRef}
        className={styles.audioElement}
        onEnded={handleAudioEnded}
        onPause={() => setIsAudioPlaying(false)}
      />

      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>N4</span>
          <span>
            <strong>ことば帳</strong>
            <small>Audio Vocabulary</small>
          </span>
        </Link>
        <span className={styles.demoBadge}>N4 LEARNING DEMO</span>
      </header>

      <section className={styles.workspace}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>
              N4・第 1 章・私たちの毎日
            </p>
            <h1>時間</h1>
          </div>
          <span className={styles.wordCount}>{visibleWords.length} WORDS</span>
        </header>

        {unitStats && (
          <div className={styles.masterySummary} aria-label="單元學習統計">
            <div className={styles.masteryMain}>
              <span>單元熟練度</span>
              <strong>{unitStats.masteryPercent}%</strong>
              <progress value={unitStats.masteryPercent} max={100} aria-label="單元熟練度" />
            </div>
            <div><span>已測驗</span><strong>{unitStats.reviewedWords} / {unitStats.totalWords}</strong></div>
            <div><span>今日到期</span><strong>{unitStats.dueToday}</strong></div>
            <div><span>逾期</span><strong>{unitStats.overdue}</strong></div>
          </div>
        )}

        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            <span className={styles.visuallyHidden}>搜尋目前單元</span>
            <input
              type="search"
              value={search}
              placeholder="搜尋單字、假名或中文"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <button
            className={styles.playAllButton}
            type="button"
            disabled={!visibleWords.length}
            onClick={() => (isPlaylist ? stopAudio() : playVisibleWords())}
          >
            <AudioIcon />
            {isPlaylist ? "停止" : "播放"}
          </button>
          <button
            className={styles.reviewStartButton}
            type="button"
            disabled={!visibleWords.length || !memoryReady}
            onClick={reviewing ? () => setReviewing(false) : startReview}
          >
            {reviewing ? "返回單字" : "開始複習"}
          </button>
          <label className={styles.reviewModeField}>
            <span>佇列</span>
            <select value={reviewMode} onChange={(event) => setReviewMode(event.target.value as QueueMode)}>
              <option value="unit">整單元</option>
              <option value="today">今日到期</option>
              <option value="priority">優先複習</option>
              <option value="random">隨機</option>
            </select>
          </label>
          <button
            className={styles.displaySettingsToggle}
            type="button"
            aria-expanded={showDisplaySettings}
            onClick={() => setShowDisplaySettings((open) => !open)}
          >
            顯示設定 {showDisplaySettings ? "⌃" : "⌄"}
          </button>
          {showDisplaySettings && (
            <div className={styles.displaySettingsPanel}>
              <button
                className={showMeaning ? styles.viewToggleActive : ""}
                type="button"
                aria-pressed={showMeaning}
                onClick={() => setShowMeaning((visible) => !visible)}
              >
                中文意思 {showMeaning ? "顯示" : "隱藏"}
              </button>
              <button
                className={showExample ? styles.viewToggleActive : ""}
                type="button"
                aria-pressed={showExample}
                onClick={() => setShowExample((visible) => !visible)}
              >
                日文例句 {showExample ? "顯示" : "隱藏"}
              </button>
              <button
                className={showExampleTranslation ? styles.viewToggleActive : ""}
                type="button"
                aria-pressed={showExampleTranslation}
                onClick={() => setShowExampleTranslation((visible) => !visible)}
              >
                例句中文 {showExampleTranslation ? "顯示" : "隱藏"}
              </button>
              <button
                className={blurTranslations ? styles.viewToggleActive : ""}
                type="button"
                aria-pressed={blurTranslations}
                onClick={() => setBlurTranslations((enabled) => !enabled)}
              >
                中文翻譯模糊 {blurTranslations ? "開" : "關"}
              </button>
            </div>
          )}
        </div>

        {message && (
          <p className={styles.notice} role="status">
            {message}
          </p>
        )}

        {blurTranslations && !reviewing && (
          <p className={styles.translationHint}>
            手機可點一下單字卡，暫時查看中文翻譯。
          </p>
        )}

        {reviewing ? (
          <section className={styles.reviewCard} aria-label="日文到中文複習">
            {reviewComplete ? (
              <div className={styles.reviewComplete}>
                <strong>本輪複習完成</strong>
                <span>已完成 {reviewWords.length} 個單字</span>
                <button type="button" onClick={() => setReviewing(false)}>
                  回到單字列表
                </button>
              </div>
            ) : (
              (() => {
                const reviewWord = reviewWords[reviewIndex];
                const reviewWordStepId = `${reviewWord.id}-word`;
                const cloze = createClozeSentence(reviewWord.example, [reviewWord.word, reviewWord.reading]);
                const answerVisible = reviewRevealed || reviewHintLevel === 3;
                const hintLabel = reviewHintLevel === 0
                  ? "例句提示"
                  : reviewHintLevel === 1
                    ? "顯示完整例句"
                    : "顯示答案";
                return (
                  <>
                    <div className={styles.reviewMeta}>
                      <span>日文 → 中文</span>
                      <span>{reviewIndex + 1} / {reviewWords.length}</span>
                    </div>
                    <div className={styles.reviewPrompt}>
                      <button
                        className={styles.reviewWord}
                        type="button"
                        onClick={() =>
                          playOne({
                            id: reviewWordStepId,
                            label: `${reviewWord.word}・單字`,
                            src: reviewWord.wordAudio,
                          })
                        }
                      >
                        <span lang="ja">{reviewWord.word}</span>
                        <small lang="ja">{reviewWord.reading}</small>
                      </button>
                      {reviewHintLevel >= 1 && !answerVisible && (
                        <p className={styles.reviewHintSentence} lang="ja">
                          {renderRuby(reviewHintLevel === 1 && cloze.replaced ? cloze.text : reviewWord.example)}
                        </p>
                      )}
                      {!answerVisible && (
                        <div className={styles.reviewActions}>
                          {reviewHintLevel < 2 && (
                            <button
                              className={styles.reviewHintButton}
                              type="button"
                              onClick={() => setReviewHintLevel(reviewHintLevel === 0 && cloze.replaced ? 1 : 2)}
                            >
                              {hintLabel}
                            </button>
                          )}
                          <button
                            className={styles.reviewAnswerButton}
                            type="button"
                            onClick={() => {
                              setReviewHintLevel(3);
                              setReviewRevealed(true);
                            }}
                          >
                            顯示答案
                          </button>
                        </div>
                      )}
                    </div>
                    {reviewRevealed && (
                      <div className={styles.reviewAnswer}>
                        {showMeaning && <strong>{reviewWord.meaningZhTw}</strong>}
                        {showExample && (
                          <div className={styles.reviewExample}>
                            <p lang="ja">{renderRuby(reviewWord.example)}</p>
                            {showExampleTranslation && <p>{reviewWord.exampleZhTw}</p>}
                            <button
                              type="button"
                              onClick={() =>
                                playOne({
                                  id: `${reviewWord.id}-sentence`,
                                  label: `${reviewWord.word}・例句`,
                                  src: reviewWord.sentenceAudio,
                                })
                              }
                            >
                              <AudioIcon /> 播放例句
                            </button>
                          </div>
                        )}
                        <p className={styles.reviewHintUsed}>
                          {reviewHintLevel === 3
                            ? "本次已查看中文答案，將以「忘記」記錄"
                            : reviewHintLevel === 2
                              ? "本次使用：完整日文例句提示"
                              : reviewHintLevel === 1
                                ? "本次使用：挖空例句提示"
                                : "本次未使用提示"}
                        </p>
                        <div className={styles.reviewRatings}>
                          {(["忘記", "困難", "想起", "熟練"] as const).map((label, index) => (
                            <button
                              key={label}
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => void rateReview((["again", "hard", "good", "easy"] as const)[index])}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </section>
        ) : <div className={styles.cardGrid}>
          {visibleWords.map((word, wordIndex) => {
            const wordStepId = `${word.id}-word`;
            const sentenceStepId = `${word.id}-sentence`;
            const isExampleLong = word.example.length > 28 || word.exampleZhTw.length > 22;
            const isExampleExpanded = expandedExamples.has(word.id);
            return (
              <article
                className={`${styles.card} ${
                  currentAudio?.id.startsWith(`${word.id}-`)
                    ? styles.activeCard
                    : ""
                }`}
                key={word.id}
                tabIndex={blurTranslations ? 0 : undefined}
              >
                <div className={styles.cardHeading}>
                  <button
                    className={styles.wordPlayButton}
                    type="button"
                    disabled={!word.wordAudio}
                    aria-label={`播放 ${word.word} 的單字音檔`}
                    title={`播放 ${word.word}`}
                    data-playing={currentAudio?.id === wordStepId}
                    onClick={() =>
                      isPlaylist
                        ? playVisibleWords(wordIndex)
                        : playOne({
                            id: wordStepId,
                            label: `${word.word}・單字`,
                            src: word.wordAudio,
                          })
                    }
                  >
                    <h2 lang="ja">{word.word}</h2>
                  </button>
                  <span className={styles.reading} lang="ja">
                    {word.reading}
                  </span>
                  <span className={styles.partOfSpeech}>{word.partOfSpeech}</span>
                  <button
                    className={styles.favoriteButton}
                    type="button"
                    aria-label={favorites.has(word.id) ? `取消收藏${word.word}` : `收藏${word.word}`}
                    aria-pressed={favorites.has(word.id)}
                    title={favorites.has(word.id) ? "取消收藏" : "加入收藏"}
                    onClick={() => toggleFavorite(word.id)}
                  >
                    {favorites.has(word.id) ? "★" : "☆"}
                  </button>
                </div>

                {showMeaning ? (
                  <div className={styles.meaningRow}>
                    <p className={styles.meaning}>{word.meaningZhTw}</p>
                    <span className={styles.wordNumber}>
                      #{String(word.number).padStart(3, "0")}
                    </span>
                  </div>
                ) : (
                  <span className={styles.wordNumberOnly}>
                    #{String(word.number).padStart(3, "0")}
                  </span>
                )}

                {showExample && <div className={`${styles.exampleBlock} ${isExampleExpanded ? styles.exampleExpanded : ""}`}>
                  <div className={styles.exampleCopy}>
                    <p className={styles.exampleJapanese} lang="ja">
                      {renderRuby(word.example)}
                    </p>
                    {showExampleTranslation && (
                      <p className={styles.exampleTranslation}>
                        {word.exampleZhTw}
                      </p>
                    )}
                  </div>
                  <div className={styles.exampleActions}>
                    {isExampleLong && (
                      <button
                        className={styles.exampleMore}
                        type="button"
                        onClick={() => toggleExample(word.id)}
                      >
                        {isExampleExpanded ? "收起" : "更多"}
                      </button>
                    )}
                    <button
                      className={styles.exampleAudio}
                      type="button"
                      disabled={!word.sentenceAudio}
                      aria-label={`播放 ${word.word} 的例句音檔`}
                      title="播放例句"
                      data-playing={currentAudio?.id === sentenceStepId}
                      onClick={() =>
                        playOne({
                          id: sentenceStepId,
                          label: `${word.word}・例句`,
                          src: word.sentenceAudio,
                        })
                      }
                    >
                      <AudioIcon />
                    </button>
                  </div>
                </div>}

              </article>
            );
          })}
        </div>}

        {!visibleWords.length && (
          <div className={styles.emptyState}>
            <strong>找不到符合的單字</strong>
            <button type="button" onClick={() => setSearch("")}>
              清除搜尋
            </button>
          </div>
        )}
      </section>

      {currentAudio && isPlaylist && (
        <aside className={styles.nowPlaying} aria-live="polite">
          <div className={styles.playerInfo}>
            <small>{isPlaylist ? "連續播放" : "正在播放"}</small>
            <strong lang="ja">{currentWord?.word ?? currentAudio.label}</strong>
            <span>
              {currentWord?.reading}・{currentWord?.meaningZhTw}
            </span>
              </div>
              <div className={styles.playerSentence}>
                <p lang="ja">
                  {currentWord ? renderRuby(currentWord.example) : currentAudio.label}
                </p>
          </div>
          <div className={styles.playerControls}>
            <button
              className={styles.playerButton}
              type="button"
              aria-label="上一個音檔"
              disabled={!isPlaylist || audioIndex === 0}
              onClick={() => jumpAudio(-1)}
            >
              ‹
            </button>
            <button
              className={`${styles.playerButton} ${styles.playerMainButton}`}
              type="button"
              aria-label={isAudioPlaying ? "暫停播放" : "繼續播放"}
              onClick={toggleAudio}
            >
              {isAudioPlaying ? "Ⅱ" : "▶"}
            </button>
            <button
              className={styles.playerButton}
              type="button"
              aria-label="下一個音檔"
              disabled={!isPlaylist || audioIndex === audioSteps.length - 1}
              onClick={() => jumpAudio(1)}
            >
              ›
            </button>
          </div>
          <div className={styles.playerProgressWrap}>
            <div className={styles.playerProgressMeta}>
              <span>{isPlaylist ? `${audioIndex + 1} / ${audioSteps.length}` : "單次播放"}</span>
            </div>
            <progress
              className={styles.playerProgress}
              value={audioIndex + 1}
              max={audioSteps.length}
              aria-label="播放進度"
            />
          </div>
          <button className={styles.playerStop} type="button" onClick={stopAudio}>
            停止
          </button>
          <button
            className={styles.playerSettingsToggle}
            type="button"
            aria-expanded={showPlayerSettings}
            onClick={() => setShowPlayerSettings((open) => !open)}
          >
            播放設定 {showPlayerSettings ? "⌃" : "⌄"}
          </button>
          {showPlayerSettings && (
            <div className={styles.playerSettings}>
              <fieldset>
                <legend>播放內容</legend>
                <div className={styles.settingSegments}>
                  {(
                    [
                      ["word", "單字"],
                      ["sentence", "例句"],
                      ["both", "單字＋例句"],
                    ] as Array<[PlaybackMode, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={playbackMode === value ? styles.selectedSetting : ""}
                      aria-pressed={playbackMode === value}
                      onClick={() => setPlaybackMode(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
                  <label className={styles.settingsRate}>
                    <span>語速</span>
                    <select
                      value={audioRate}
                      onChange={(event) => setAudioRate(Number(event.target.value))}
                    >
                      {Array.from({ length: 11 }, (_, index) => {
                        const rate = 0.75 + index * 0.05;
                        return (
                          <option key={rate.toFixed(2)} value={rate}>
                            {rate.toFixed(2)}×
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className={styles.settingsRate}>
                    <span>連續</span>
                    <select
                      value={repeatCount}
                      onChange={(event) =>
                        setRepeatCount(Number(event.target.value) as 1 | 2 | 3)
                      }
                    >
                      <option value={1}>1 次</option>
                      <option value={2}>2 次</option>
                      <option value={3}>3 次</option>
                    </select>
                  </label>
                </div>
          )}
        </aside>
      )}
    </main>
  );
}
