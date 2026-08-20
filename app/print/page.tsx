"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppNav } from "../components/AppNav";
import { useVocabularyUnit } from "../hooks/useVocabularyUnit";
import { useUnitMemory } from "../hooks/useUnitMemory";
import { searchVocabulary } from "../../src/vocabulary/selectors";
import { getRecentReviewWordIds } from "../../src/spaced-repetition/review-queue";
import { selectFocusedPrintWords } from "../../src/spaced-repetition/print-recommendation";
import type { VocabularyWord } from "../../src/vocabulary/types";
import styles from "./print.module.css";

type PrintMode = "practice" | "study" | "answers";
type PrintLayout = "two-column" | "single-column";
type PrintScope = "focused" | "all";

function toPositiveInteger(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

const printModeLabels: Record<PrintMode, string> = {
  practice: "默寫練習",
  study: "學習清單",
  answers: "答案整理",
};

function PrintPracticeContent() {
  const searchParams = useSearchParams();
  const chapter = toPositiveInteger(searchParams.get("chapter"));
  const section = toPositiveInteger(searchParams.get("section"));
  const query = searchParams.get("q")?.trim() ?? "";
  const enabled = chapter > 0 && section > 0;
  const { words, loading, error } = useVocabularyUnit(chapter, section, enabled);
  const { memoryRecords, reviewHistory } = useUnitMemory(words, chapter, section, enabled);
  const [mode, setMode] = useState<PrintMode>("practice");
  const [scope, setScope] = useState<PrintScope>("focused");
  const [showReading, setShowReading] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [layout, setLayout] = useState<PrintLayout>("two-column");

  const sourceWords = useMemo(() => searchVocabulary(words, query), [query, words]);
  const printWords = useMemo(() => {
    if (scope === "all") return sourceWords;
    return selectFocusedPrintWords(
      sourceWords,
      Object.values(memoryRecords),
      new Date(),
      Math.random,
      getRecentReviewWordIds(reviewHistory, "jp_to_meaning"),
    );
  }, [memoryRecords, reviewHistory, scope, sourceWords]);
  const firstWord = words[0];
  const backHref = enabled ? `/?chapter=${chapter}&section=${section}` : "/";

  useEffect(() => {
    if (!firstWord) return;
    document.title = `N4-${firstWord.sectionTitle}-${printModeLabels[mode]}`;
  }, [firstWord, mode]);

  function handlePrint() {
    window.print();
  }

  function handleModeChange(nextMode: PrintMode) {
    setMode(nextMode);
    if (nextMode === "study") {
      setShowReading(true);
      setShowExamples(true);
    } else if (nextMode === "answers") {
      setShowReading(true);
      setShowExamples(false);
    } else {
      setShowReading(false);
      setShowExamples(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.screenNav}>
        <AppNav active="library" />
      </header>

      <div className={styles.screenActions}>
        <button type="button" onClick={handlePrint} disabled={!printWords.length}>
          列印／另存 PDF
        </button>
        <Link href={backHref}>返回單字頁</Link>
      </div>

      {words.length > 0 && (
        <section className={styles.settingsPanel} aria-labelledby="print-settings-title">
          <div className={styles.settingsHeader}>
            <div>
              <p className={styles.settingsEyebrow}>高效學習列印</p>
              <h2 id="print-settings-title">列印設定</h2>
            </div>
            <strong>{printWords.length} 詞</strong>
          </div>

          <div className={styles.settingsGroups}>
            <fieldset className={styles.settingsGroup}>
              <legend>列印內容</legend>
              <label className={styles.settingsOption}>
                <input type="radio" name="print-mode" checked={mode === "practice"} onChange={() => handleModeChange("practice")} />
                <span><strong>默寫練習</strong><small>日文→中文、中文→日文</small></span>
              </label>
              <label className={styles.settingsOption}>
                <input type="radio" name="print-mode" checked={mode === "study"} onChange={() => handleModeChange("study")} />
                <span><strong>學習清單</strong><small>單字、讀音、中文與例句</small></span>
              </label>
              <label className={styles.settingsOption}>
                <input type="radio" name="print-mode" checked={mode === "answers"} onChange={() => handleModeChange("answers")} />
                <span><strong>答案整理</strong><small>快速對照與複習</small></span>
              </label>
            </fieldset>

            <fieldset className={styles.settingsGroup}>
              <legend>本次單字</legend>
              <label className={styles.settingsOption}>
                <input type="radio" name="print-scope" checked={scope === "focused"} onChange={() => setScope("focused")} />
                <span><strong>專注推薦・最多 10 詞</strong><small>優先到期、常忘記與需要提示的單字</small></span>
              </label>
              <label className={styles.settingsOption}>
                <input type="radio" name="print-scope" checked={scope === "all"} onChange={() => setScope("all")} />
                <span><strong>{query ? "目前搜尋結果" : "整個單元"}</strong><small>{sourceWords.length} 詞，依目前範圍列印</small></span>
              </label>
            </fieldset>

            <fieldset className={styles.settingsGroup}>
              <legend>顯示與排版</legend>
              <label className={styles.settingsCheck}>
                <input type="checkbox" checked={showReading} onChange={(event) => setShowReading(event.target.checked)} />
                顯示讀音（假名）
              </label>
              {mode === "study" && <label className={styles.settingsCheck}>
                <input type="checkbox" checked={showExamples} disabled={mode !== "study"} onChange={(event) => setShowExamples(event.target.checked)} />
                顯示例句
              </label>}
              <label className={styles.settingsCheck}>
                <input type="checkbox" checked={layout === "single-column"} onChange={(event) => setLayout(event.target.checked ? "single-column" : "two-column")} />
                單欄手寫版
              </label>
              {mode === "practice" && (
                <label className={styles.settingsCheck}>
                  <input type="checkbox" checked={includeAnswerKey} onChange={(event) => setIncludeAnswerKey(event.target.checked)} />
                  包含答案頁
                </label>
              )}
            </fieldset>
          </div>

          <p className={styles.settingsStatus} role="status">
            {scope === "focused" ? "專注推薦" : query ? `搜尋結果：「${query}」` : "整個單元"}・{printWords.length} 詞・{printModeLabels[mode]}・讀音{showReading ? "顯示" : "隱藏"}・{layout === "single-column" ? "單欄" : "雙欄"}
          </p>
        </section>
      )}

      <article className={styles.sheet}>
        <header className={styles.sheetHeader}>
          <p className={styles.eyebrow}>N4 ことば帳・{printModeLabels[mode]}</p>
          <h1>{firstWord?.sectionTitle ?? "本單元單字練習"}</h1>
          <p className={styles.subtitle}>
            {firstWord
              ? `第 ${firstWord.chapterNumber} 章・${firstWord.chapterTitle}・第 ${firstWord.sectionNumber} 節・${printWords.length} 詞`
              : enabled
                ? `第 ${chapter} 章・第 ${section} 節`
                : "請從單字頁選擇單元"}
          </p>
          <div className={styles.studentMeta}>
            <span>姓名：________________</span>
            <span>日期：________________</span>
          </div>
        </header>

        {loading && <p className={styles.notice}>正在準備本單元單字…</p>}
        {error && <p className={styles.notice}>{error}</p>}
        {!loading && !error && !words.length && (
          <p className={styles.notice}>找不到這個單元，請返回單字頁重新選擇。</p>
        )}
        {!loading && !error && words.length > 0 && !printWords.length && (
          <p className={styles.notice}>沒有符合「{query}」的單字，請返回單字頁調整搜尋條件。</p>
        )}
        {printWords.length > 0 && mode === "practice" && (
          <PracticeSections words={printWords} showReading={showReading} includeAnswerKey={includeAnswerKey} layout={layout} />
        )}
        {printWords.length > 0 && mode === "study" && (
          <StudyList words={printWords} showReading={showReading} showExamples={showExamples} layout={layout} />
        )}
        {printWords.length > 0 && mode === "answers" && (
          <AnswerKey words={printWords} showReading={showReading} layout={layout} title="答案整理" />
        )}
      </article>
    </main>
  );
}

function PracticeSections({
  words,
  showReading,
  includeAnswerKey,
  layout,
}: {
  words: VocabularyWord[];
  showReading: boolean;
  includeAnswerKey: boolean;
  layout: PrintLayout;
}) {
  const listClassName = `${styles.questionList} ${layout === "single-column" ? styles.singleColumn : ""}`;

  return (
    <>
      <section className={styles.exerciseSection}>
        <h2>A｜日文回想中文</h2>
        <p className={styles.instruction}>請看日文單字，寫出中文意思。</p>
        <ol className={listClassName}>
          {words.map((word) => (
            <li className={styles.questionRow} key={`meaning-${word.id}`}>
              <span className={styles.questionNumber}>#{String(word.number).padStart(3, "0")}</span>
              <span className={styles.promptWord} lang="ja">
                <strong>{word.word}</strong>
                {showReading && <small className={styles.promptReading}>{word.reading}</small>}
              </span>
              <span className={styles.answerLine} aria-label="中文作答欄" />
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.exerciseSection}>
        <h2>B｜中文回想日文</h2>
        <p className={styles.instruction}>請看中文意思，寫出日文單字。</p>
        <ol className={listClassName}>
          {words.map((word) => (
            <li className={styles.questionRow} key={`word-${word.id}`}>
              <span className={styles.questionNumber}>#{String(word.number).padStart(3, "0")}</span>
              <span className={styles.promptMeaning}>{word.meaningZhTw}</span>
              <span className={styles.answerLine} aria-label="日文作答欄" />
            </li>
          ))}
        </ol>
      </section>

      {includeAnswerKey && <AnswerKey words={words} showReading={showReading} layout={layout} title="答案" />}
    </>
  );
}

function StudyList({
  words,
  showReading,
  showExamples,
  layout,
}: {
  words: VocabularyWord[];
  showReading: boolean;
  showExamples: boolean;
  layout: PrintLayout;
}) {
  return (
    <section className={styles.exerciseSection}>
      <h2>學習清單</h2>
      <p className={styles.instruction}>依序複習單字、讀音與中文意思。</p>
      <ol className={`${styles.studyList} ${layout === "single-column" ? styles.singleColumn : ""}`}>
        {words.map((word) => (
          <li className={styles.studyRow} key={`study-${word.id}`}>
            <span className={styles.questionNumber}>#{String(word.number).padStart(3, "0")}</span>
            <span className={styles.studyWord} lang="ja">
              <strong>{word.word}</strong>
              {showReading && <small>{word.reading}</small>}
            </span>
            <span className={styles.studyMeaning}>{word.meaningZhTw}</span>
            {showExamples && (
              <span className={styles.studyExample}>
                <span lang="ja">{word.example}</span>
                <small>{word.exampleZhTw}</small>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function AnswerKey({
  words,
  showReading,
  layout,
  title,
}: {
  words: VocabularyWord[];
  showReading: boolean;
  layout: PrintLayout;
  title: string;
}) {
  return (
    <section className={`${styles.exerciseSection} ${styles.answerKey}`}>
      <h2>{title}</h2>
      <ol className={`${styles.answerList} ${layout === "single-column" ? styles.singleColumn : ""}`}>
        {words.map((word) => (
          <li key={`answer-${word.id}`}>
            <span className={styles.questionNumber}>#{String(word.number).padStart(3, "0")}</span>
            <span lang="ja"><strong>{word.word}</strong>{showReading && <small className={styles.answerReading}>{word.reading}</small>}</span>
            <small>{word.meaningZhTw}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function PrintPracticePage() {
  return (
    <Suspense fallback={<main className={styles.page}><p className={styles.notice}>正在準備練習單…</p></main>}>
      <PrintPracticeContent />
    </Suspense>
  );
}
