"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./demo.module.css";
import { MasterySummary } from "./components/MasterySummary";
import { ReviewPanel } from "./components/ReviewPanel";
import { WordCard } from "./components/WordCard";
import { AudioIcon, renderRuby, type AudioStep, type DemoWord } from "./components/vocabulary";
import { createClozeSentence, isClozeAnswerCorrect } from "../src/spaced-repetition/cloze";
import { createWordMemory, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter";
import { buildReviewQueue, type QueueMode } from "../src/spaced-repetition/review-queue";
import { calculateUnitStats } from "../src/spaced-repetition/unit-stats";
import { getMemoryKey } from "../src/spaced-repetition/types";
import type { HintLevel, MemorySkill, ReviewContext, ReviewFormat, ReviewRating, UnitStats, VocabularyReviewEvent, WordMemoryRecord } from "../src/spaced-repetition/types";
import { LocalStorageMemoryRepository } from "../src/storage/memory-repository";

type PlaybackMode = "word" | "sentence" | "both";

type DemoSection = {
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
  wordCount: number;
};

function skillForReviewFormat(format: ReviewFormat): MemorySkill {
  if (format === "zh-to-jp") return "meaning_to_jp";
  if (format === "cloze") return "context_to_word";
  return "jp_to_meaning";
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
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [selectedSection, setSelectedSection] = useState(1);
  const [selectionReady, setSelectionReady] = useState(false);
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
  const [reviewFormat, setReviewFormat] = useState<ReviewFormat>("jp-to-zh");
  const [clozeAnswer, setClozeAnswer] = useState("");
  const [clozeAnswerAttempts, setClozeAnswerAttempts] = useState(0);
  const [clozeAnswerCorrect, setClozeAnswerCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [reviewMode, setReviewMode] = useState<QueueMode>("unit");
  const [reviewWordIds, setReviewWordIds] = useState<string[]>([]);
  const [memoryRecords, setMemoryRecords] = useState<Record<string, WordMemoryRecord>>({});
  const [memoryReady, setMemoryReady] = useState(false);
  const [reviewHistory, setReviewHistory] = useState<Awaited<ReturnType<LocalStorageMemoryRepository["getReviewHistory"]>>>([]);
  const [reviewEvents, setReviewEvents] = useState<VocabularyReviewEvent[]>([]);
  const repositoryRef = useRef<LocalStorageMemoryRepository | null>(null);
  const reviewStartedAtRef = useRef(Date.now());
  const [audioSteps, setAudioSteps] = useState<AudioStep[]>([]);
  const [audioIndex, setAudioIndex] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioRate, setAudioRate] = useState(1);
  const [repeatCount, setRepeatCount] = useState<1 | 2 | 3>(1);
  const [message, setMessage] = useState("正在準備 N4 單字…");
  const audioRef = useRef<HTMLAudioElement>(null);

  if (!repositoryRef.current) repositoryRef.current = new LocalStorageMemoryRepository();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const chapter = Number(params.get("chapter"));
      const section = Number(params.get("section"));
      if (Number.isInteger(chapter) && chapter > 0) setSelectedChapter(chapter);
      if (Number.isInteger(section) && section > 0) setSelectedSection(section);
      setSelectionReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    if (!words.length || !selectionReady || !repositoryRef.current) return;
    const repository = repositoryRef.current;
    const unitId = `n4-${selectedChapter}-${selectedSection}`;
    void repository.migrate().then(async () => {
      const unitWords = words.filter((word) =>
        word.chapterNumber === selectedChapter && word.sectionNumber === selectedSection,
      );
      const skills: MemorySkill[] = ["jp_to_meaning", "meaning_to_jp", "context_to_word"];
      const records = (await Promise.all(unitWords.flatMap((word) =>
        skills.map((skill) => repository.getWordMemory(word.id, skill)))))
        .filter((record): record is WordMemoryRecord => Boolean(record));
      const history = await repository.getReviewHistory(unitId);
      const events = await repository.getReviewEvents(unitId);
      setMemoryRecords(Object.fromEntries(records.map((record) => [getMemoryKey(record.wordId, record.skill), record])));
      setReviewHistory(history);
      setReviewEvents(events);
    }).finally(() => setMemoryReady(true));
  }, [selectedChapter, selectedSection, selectionReady, words]);

  const sections = useMemo<DemoSection[]>(() => {
    const map = new Map<string, DemoSection>();
    for (const word of words) {
      const key = `${word.chapterNumber}-${word.sectionNumber}`;
      const existing = map.get(key);
      if (existing) {
        existing.wordCount += 1;
      } else {
        map.set(key, {
          chapterNumber: word.chapterNumber,
          chapterTitle: word.chapterTitle,
          sectionNumber: word.sectionNumber,
          sectionTitle: word.sectionTitle,
          wordCount: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.chapterNumber - b.chapterNumber || a.sectionNumber - b.sectionNumber,
    );
  }, [words]);

  const selectedSectionData = sections.find((section) =>
    section.chapterNumber === selectedChapter && section.sectionNumber === selectedSection,
  ) ?? sections[0];

  const chapterSections = useMemo(
    () => sections.filter((section) => section.chapterNumber === selectedChapter),
    [sections, selectedChapter],
  );

  function resetReviewCardState() {
    setReviewRevealed(false);
    setReviewHintLevel(0);
    setClozeAnswer("");
    setClozeAnswerAttempts(0);
    setClozeAnswerCorrect(null);
    reviewStartedAtRef.current = Date.now();
  }

  function selectUnit(chapter: number, section: number) {
    setSelectedChapter(chapter);
    setSelectedSection(section);
    setSearch("");
    setReviewing(false);
    setReviewWordIds([]);
    setReviewComplete(false);
    resetReviewCardState();
    setMemoryReady(false);
    stopAudio();
    window.history.replaceState(null, "", `/?chapter=${chapter}&section=${section}`);
  }

  const visibleWords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return words.filter((word) => {
      const matchesSection =
        word.chapterNumber === selectedChapter && word.sectionNumber === selectedSection;
      const matchesSearch =
        !query ||
        [word.word, word.reading, word.meaningZhTw, word.exampleZhTw].some(
          (value) => value.toLocaleLowerCase().includes(query),
        );
      return matchesSection && matchesSearch;
    });
  }, [search, selectedChapter, selectedSection, words]);

  const selectedUnitWords = useMemo(
    () => words.filter((word) =>
      word.chapterNumber === selectedChapter && word.sectionNumber === selectedSection,
    ),
    [selectedChapter, selectedSection, words],
  );

  const unitStats = useMemo<UnitStats>(() => {
    const records = selectedUnitWords.map((word) => memoryRecords[getMemoryKey(word.id, "jp_to_meaning")]).filter(Boolean);
    return calculateUnitStats(records, selectedUnitWords.length, reviewHistory, new Date(), reviewEvents);
  }, [memoryRecords, reviewEvents, reviewHistory, selectedUnitWords]);

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
    const playableAudio = audio;
    let cancelled = false;

    function startPlayback() {
      if (cancelled) return;
      void playableAudio
        .play()
        .then(() => setIsAudioPlaying(true))
        .catch(() => {
          if (!cancelled) {
            setIsAudioPlaying(false);
            setMessage("請再按一次播放。音檔尚未準備完成。");
          }
        });
    }

    playableAudio.pause();
    playableAudio.src = currentAudio.src;
    playableAudio.playbackRate = audioRate;
    playableAudio.currentTime = 0;
    playableAudio.load();
    if (playableAudio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      startPlayback();
    } else {
      audio.addEventListener("canplay", startPlayback, { once: true });
    }

    return () => {
      cancelled = true;
      audio.removeEventListener("canplay", startPlayback);
    };
  }, [audioRate, currentAudio]);

  useEffect(() => {
    if (!reviewing || reviewComplete) return;
    if (reviewFormat !== "jp-to-zh" && !reviewRevealed) return;
    const reviewWord = reviewWords[reviewIndex];
    if (!reviewWord?.wordAudio) return;
    playOne({
      id: `${reviewWord.id}-word`,
      label: `${reviewWord.word}・單字`,
      src: reviewWord.wordAudio,
    });
  }, [reviewComplete, reviewFormat, reviewIndex, reviewRevealed, reviewing, reviewWords]);

  useEffect(() => {
    if (!reviewing || reviewComplete) return;
    function handleReviewShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
      if (event.code === "Space") {
        if (reviewFormat === "cloze") return;
        event.preventDefault();
        setReviewRevealed(true);
        setReviewHintLevel(reviewFormat === "zh-to-jp" ? 4 : 3);
        return;
      }
      if (event.code === "KeyH") {
        if (reviewFormat !== "jp-to-zh") return;
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
  }, [reviewComplete, reviewFormat, reviewIndex, reviewing, reviewWords]);

  function playOne(step: AudioStep) {
    setMessage("");
    setAudioIndex(0);
    setAudioSteps([step]);
  }

  function startReview() {
    if (!visibleWords.length) return;
    const skill = skillForReviewFormat(reviewFormat);
    const candidates = visibleWords.map((word) =>
      memoryRecords[getMemoryKey(word.id, skill)] ?? createWordMemory(word.id, `n4-${selectedChapter}-${selectedSection}`, new Date(), skill),
    );
    const queued = buildReviewQueue(candidates, reviewMode);
    if (!queued.length) {
      setMessage(reviewMode === "today" ? "目前沒有到期單字。" : "目前沒有符合此佇列的單字。");
      return;
    }
    setReviewWordIds(queued.map((record) => record.wordId));
    setReviewing(true);
    setReviewIndex(0);
    resetReviewCardState();
    setReviewComplete(false);
    stopAudio();
  }

  function checkClozeAnswer() {
    const reviewWord = reviewWords[reviewIndex];
    if (!reviewWord || reviewFormat !== "cloze" || clozeAnswerCorrect === true || clozeAnswerAttempts >= 2) return;
    const nextAttempt = clozeAnswerAttempts + 1;
    const correct = isClozeAnswerCorrect(clozeAnswer, reviewWord.word, reviewWord.reading);
    setClozeAnswerAttempts(nextAttempt);
    setClozeAnswerCorrect(correct);
    if (correct || nextAttempt >= 2) setReviewRevealed(true);
  }

  async function rateReview(rawRating: ReviewRating) {
    if (isSubmittingRef.current || !repositoryRef.current || reviewComplete) return;
    const reviewWord = reviewWords[reviewIndex];
    if (!reviewWord) return;
    if (reviewFormat === "cloze" && clozeAnswerCorrect === null) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const now = new Date();
    const skill = skillForReviewFormat(reviewFormat);
    const correct = reviewFormat === "cloze"
      ? clozeAnswerCorrect === true
      : rawRating !== "again";
    const previous = memoryRecords[getMemoryKey(reviewWord.id, skill)]
      ?? createWordMemory(reviewWord.id, `n4-${selectedChapter}-${selectedSection}`, now, skill);
    const responseTimeMs = Math.max(0, Date.now() - reviewStartedAtRef.current);
    const reviewContext: ReviewContext = {
      reviewFormat,
      skill,
      correct,
      recalledWithoutHint: correct && reviewHintLevel === 0 && !(reviewFormat === "cloze" && clozeAnswerAttempts > 1),
      responseTimeMs,
      ...(reviewFormat === "cloze"
        ? { answerCorrect: clozeAnswerCorrect ?? false, answerAttempts: clozeAnswerAttempts }
        : {}),
    };
    const result = reviewWordMemory(previous, rawRating, reviewHintLevel, now, responseTimeMs, reviewContext);
    try {
      await repositoryRef.current.saveWordMemory(result.memory);
      await repositoryRef.current.appendReviewHistory(result.history);
      await repositoryRef.current.appendReviewEvent(result.event);
      setMemoryRecords((records) => ({ ...records, [getMemoryKey(result.memory.wordId, result.memory.skill)]: result.memory }));
      setReviewHistory((history) => [...history, result.history]);
      setReviewEvents((events) => [...events, result.event]);
      if (reviewIndex >= reviewWords.length - 1) {
        setReviewComplete(true);
      } else {
        setReviewIndex((index) => index + 1);
        resetReviewCardState();
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
      Array.from({ length: repeatCount }, () => ({ ...step })),
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
        onError={() => {
          setIsAudioPlaying(false);
          setMessage("音檔載入失敗，請確認音檔路徑。");
        }}
      />

      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>N4</span>
          <span>
            <strong>ことば帳</strong>
            <small>Audio Vocabulary</small>
          </span>
        </Link>
        <span className={styles.demoBadge}>INDEPENDENT DEMO</span>
      </header>

      <section className={styles.workspace}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>
              N4・第 {selectedSectionData?.chapterNumber} 章・{selectedSectionData?.chapterTitle}
            </p>
            <h1>{selectedSectionData?.sectionTitle}</h1>
            <p className={styles.sectionProgress} aria-label="目前章節掌握進度">
              第 {selectedSectionData?.chapterNumber} 章｜第 {selectedSectionData?.sectionNumber} 節｜{unitStats.stableWords}／{unitStats.totalWords} 個｜30 天保持率 {unitStats.masteryPercent}%
            </p>
          </div>
          <span className={styles.wordCount}>{visibleWords.length} WORDS</span>
        </header>

        <div className={styles.unitPicker} aria-label="選擇章節與單字庫">
          <label>
            <span>章節</span>
            <select
              value={selectedChapter}
              onChange={(event) => {
                const chapter = Number(event.target.value);
                const firstSection = sections.find((section) => section.chapterNumber === chapter);
                if (firstSection) selectUnit(chapter, firstSection.sectionNumber);
              }}
            >
              {[...new Set(sections.map((section) => section.chapterNumber))].map((chapter) => {
                const chapterData = sections.find((section) => section.chapterNumber === chapter);
                return <option key={chapter} value={chapter}>第 {chapter} 章・{chapterData?.chapterTitle}</option>;
              })}
            </select>
          </label>
          <label>
            <span>單字庫</span>
            <select
              value={selectedSection}
              onChange={(event) => selectUnit(selectedChapter, Number(event.target.value))}
            >
              {chapterSections.map((section) => (
                <option key={section.sectionNumber} value={section.sectionNumber}>
                  {String(section.sectionNumber).padStart(2, "0")}・{section.sectionTitle}（{section.wordCount} 詞）
                </option>
              ))}
            </select>
          </label>
          <Link className={styles.unitMapLink} href="/units">查看全部章節 →</Link>
          <Link className={styles.unitMapLink} href="/favorites">收藏清單</Link>
        </div>

        {unitStats && <MasterySummary stats={unitStats} />}

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
          <label className={styles.reviewModeField}>
            <span>形式</span>
            <select
              value={reviewFormat}
              disabled={reviewing}
              aria-label="複習形式"
              onChange={(event) => setReviewFormat(event.target.value as ReviewFormat)}
            >
              <option value="jp-to-zh">日文回想中文</option>
              <option value="zh-to-jp">中文回想日文</option>
              <option value="cloze">例句填空</option>
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
          <ReviewPanel
            reviewWords={reviewWords}
            reviewIndex={reviewIndex}
            reviewComplete={reviewComplete}
            reviewFormat={reviewFormat}
            reviewRevealed={reviewRevealed}
            reviewHintLevel={reviewHintLevel}
            clozeAnswer={clozeAnswer}
            clozeAnswerAttempts={clozeAnswerAttempts}
            clozeAnswerCorrect={clozeAnswerCorrect}
            isSubmitting={isSubmitting}
            showMeaning={showMeaning}
            showExample={showExample}
            showExampleTranslation={showExampleTranslation}
            onStopReview={() => setReviewing(false)}
            onPlayOne={playOne}
            onSetHintLevel={setReviewHintLevel}
            onSetRevealed={setReviewRevealed}
            onSetClozeAnswer={setClozeAnswer}
            onCheckClozeAnswer={checkClozeAnswer}
            onRate={(rating) => void rateReview(rating)}
          />
        ) : <div className={styles.cardGrid}>
          {visibleWords.map((word, wordIndex) => (
            <WordCard
              key={word.id}
              word={word}
              wordIndex={wordIndex}
              memory={memoryRecords[getMemoryKey(word.id, "jp_to_meaning")]}
              currentAudioId={currentAudio?.id}
              isPlaylist={isPlaylist}
              showMeaning={showMeaning}
              showExample={showExample}
              showExampleTranslation={showExampleTranslation}
              blurTranslations={blurTranslations}
              isFavorite={favorites.has(word.id)}
              isExampleExpanded={expandedExamples.has(word.id)}
              onPlayVisible={playVisibleWords}
              onPlayOne={playOne}
              onToggleFavorite={() => toggleFavorite(word.id)}
              onToggleExample={() => toggleExample(word.id)}
            />
          ))}
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
