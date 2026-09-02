"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppNav } from "../components/AppNav";
import { useVocabularyUnit } from "../hooks/useVocabularyUnit";
import { searchVocabulary } from "../../src/vocabulary/selectors";
import { selectFocusedPrintWords } from "../../src/spaced-repetition/print-recommendation";
import { useUnitMemory } from "../hooks/useUnitMemory";
import type { VocabularyWord } from "../../src/vocabulary/types";
import {
  chunkWords,
  getPrintPageCount,
  selectQuestionWords,
  type PrintLayout,
  type PrintMode,
  type PracticeDirection,
  type QuestionCount,
} from "./print-utils";
import styles from "./print.module.css";

const printModeLabels: Record<PrintMode, string> = {
  practice: "默寫練習",
  study: "學習清單",
  answers: "答案整理",
};

const directionLabels: Record<PracticeDirection, string> = {
  "ja-to-zh": "日文 → 中文",
  "zh-to-ja": "中文 → 日文",
  both: "雙向練習",
};

function toPositiveInteger(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getQuestionCountLabel(count: QuestionCount, available: number): string {
  return count === "all" ? `全部 ${available} 題` : `${Math.min(count, available)} 題`;
}

function PrintPracticeContent() {
  const searchParams = useSearchParams();
  const chapter = toPositiveInteger(searchParams.get("chapter"));
  const section = toPositiveInteger(searchParams.get("section"));
  const query = searchParams.get("q")?.trim() ?? "";
  const enabled = chapter > 0 && section > 0;
  const { words, loading, error } = useVocabularyUnit(chapter, section, enabled);

  const [mode, setMode] = useState<PrintMode>("practice");
  const [direction, setDirection] = useState<PracticeDirection>("ja-to-zh");
  const [questionCount, setQuestionCount] = useState<QuestionCount>(20);
  const [showQuestionReading, setShowQuestionReading] = useState(false);
  const [showStudyReading, setShowStudyReading] = useState(false);
  const [showAnswerReading, setShowAnswerReading] = useState(true);
  const [showExamples, setShowExamples] = useState(false);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [layout, setLayout] = useState<PrintLayout>("two-column");
  const [focused, setFocused] = useState(false);

  const { memoryRecords } = useUnitMemory(words, chapter, section, enabled);
  const memoriesArray = useMemo(() => Object.values(memoryRecords), [memoryRecords]);

  const availableWords = useMemo(
    () => searchVocabulary(words, query),
    [query, words],
  );
  const printWords = useMemo(
    () => {
      if (mode !== "practice") return availableWords;
      if (focused) return selectFocusedPrintWords(availableWords, memoriesArray);
      return selectQuestionWords(availableWords, questionCount);
    },
    [availableWords, focused, memoriesArray, mode, questionCount],
  );
  const pageCount = getPrintPageCount({
    mode,
    direction,
    wordCount: printWords.length,
    layout,
    includeAnswerKey,
  });
  const firstWord = words[0];
  const backHref = enabled ? `/?chapter=${chapter}&section=${section}` : "/";
  const countLabel = getQuestionCountLabel(questionCount, availableWords.length);
  const pageEstimateLabel = mode === "study" && showExamples
    ? "頁數依例句長度"
    : `${pageCount} 頁`;

  useEffect(() => {
    if (firstWord) {
      document.title = `N4-${firstWord.sectionTitle}-${printModeLabels[mode]}`;
    }
  }, [firstWord, mode]);

  const handleModeChange = (nextMode: PrintMode) => {
    setMode(nextMode);
    setIncludeAnswerKey(nextMode === "practice");
  };

  return (
    <main className={styles.page}>
      <header className={styles.screenNav}>
        <AppNav active="library" />
      </header>

      <div className={styles.screenActions}>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!printWords.length}
        >
          {mode === "study" && showExamples
            ? "列印／另存 PDF"
            : `列印 ${pageCount} 頁／另存 PDF`}
        </button>
        <Link href={backHref}>返回單字頁</Link>
      </div>

      {words.length > 0 && (
        <section className={styles.settingsPanel} aria-labelledby="print-settings-title">
          <div className={styles.settingsHeader}>
            <div>
              <p className={styles.settingsEyebrow}>專注列印</p>
              <h2 id="print-settings-title">列印設定</h2>
            </div>
            <strong>{availableWords.length} 詞</strong>
          </div>

          <div className={styles.settingsGroups}>
            <fieldset className={styles.settingsGroup}>
              <legend>快速選擇</legend>
              {(["practice", "study", "answers"] as PrintMode[]).map((option) => (
                <label className={`${styles.settingsOption} ${styles.modeOption}`} key={option}>
                  <input
                    type="radio"
                    name="print-mode"
                    checked={mode === option}
                    onChange={() => handleModeChange(option)}
                  />
                  <span>
                    <strong>{printModeLabels[option]}</strong>
                    <small>
                      {option === "practice"
                        ? "回想並手寫答案"
                        : option === "study"
                          ? "單字、讀音、中文與例句"
                          : "快速對照與複習"}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>

            {mode === "practice" && (
              <fieldset className={styles.settingsGroup}>
                <legend>① 題目設定</legend>
                {(["ja-to-zh", "zh-to-ja", "both"] as PracticeDirection[]).map((option) => (
                  <label className={styles.settingsOption} key={option}>
                    <input
                      type="radio"
                      name="print-direction"
                      checked={direction === option}
                      onChange={() => setDirection(option)}
                    />
                    <span>
                      <strong>{directionLabels[option]}</strong>
                      <small>
                        {option === "ja-to-zh"
                          ? "看日文寫中文"
                          : option === "zh-to-ja"
                            ? "看中文寫日文"
                            : "兩種方向各一頁"}
                      </small>
                    </span>
                  </label>
                ))}
                <div className={styles.inlineOptions}>
                  {[10, 20, "all"].map((value) => (
                    <label className={styles.compactOption} key={String(value)}>
                      <input
                        type="radio"
                        name="question-count"
                        checked={questionCount === value}
                        disabled={focused}
                        onChange={() => setQuestionCount(value as QuestionCount)}
                      />
                      {value === "all" ? `全部 ${availableWords.length}` : `${value} 題`}
                    </label>
                  ))}
                </div>
                <label className={styles.settingsCheck}>
                  <input
                    type="checkbox"
                    checked={focused}
                    onChange={(event) => setFocused(event.target.checked)}
                  />
                  📊 專注模式（依記憶狀態選詞）
                </label>
              </fieldset>
            )}

            <details className={styles.advancedSettings}>
              <summary>{mode === "practice" ? "② 進階顯示" : "① 進階顯示"}</summary>
              <fieldset className={styles.settingsGroup}>
              <div className={styles.layoutOptions}>
                <label className={styles.compactOption}>
                  <input
                    type="radio"
                    name="print-layout"
                    checked={layout === "two-column"}
                    onChange={() => setLayout("two-column")}
                  />
                  精簡雙欄
                </label>
                <label className={styles.compactOption}>
                  <input
                    type="radio"
                    name="print-layout"
                    checked={layout === "single-column"}
                    onChange={() => setLayout("single-column")}
                  />
                  寬版單欄
                </label>
              </div>
              {mode === "practice" && (
                <label className={styles.settingsCheck}>
                  <input
                    type="checkbox"
                    checked={showQuestionReading}
                    onChange={(event) => setShowQuestionReading(event.target.checked)}
                  />
                  題目顯示讀音
                </label>
              )}
              {mode === "study" && (
                <label className={styles.settingsCheck}>
                  <input
                    type="checkbox"
                    checked={showStudyReading}
                    onChange={(event) => setShowStudyReading(event.target.checked)}
                  />
                  顯示讀音
                </label>
              )}
              <label className={styles.settingsCheck}>
                <input
                  type="checkbox"
                  checked={showExamples}
                  disabled={mode !== "study"}
                  onChange={(event) => setShowExamples(event.target.checked)}
                />
                顯示例句
              </label>
              {mode === "practice" && (
                <label className={styles.settingsCheck}>
                  <input
                    type="checkbox"
                    checked={includeAnswerKey}
                    onChange={(event) => setIncludeAnswerKey(event.target.checked)}
                  />
                  包含答案頁
                </label>
              )}
              {(mode === "practice" || mode === "answers") && (
                <label className={styles.settingsCheck}>
                  <input
                    type="checkbox"
                    checked={showAnswerReading}
                    onChange={(event) => setShowAnswerReading(event.target.checked)}
                  />
                  答案顯示讀音
                </label>
              )}
              </fieldset>
            </details>
          </div>

          <p className={styles.settingsStatus} role="status">
            {mode === "practice"
              ? `${directionLabels[direction]}｜${focused ? "專注模式" : countLabel}`
              : `${printModeLabels[mode]}｜${availableWords.length} 詞`}
            ｜{layout === "two-column" ? "精簡雙欄" : "寬版單欄"}
            ｜預估 {pageEstimateLabel}
          </p>
          <button
            className={styles.settingsPrimaryAction}
            type="button"
            onClick={() => window.print()}
            disabled={!printWords.length}
          >
            {mode === "study" && showExamples ? "開始列印" : `開始列印 ${pageCount} 頁`}
          </button>
        </section>
      )}

      <article className={styles.sheet}>
        <header className={styles.sheetHeader}>
          <div>
            <p className={styles.sheetKicker}>N4 ことば帳｜{printModeLabels[mode]}</p>
            <h1>{firstWord?.sectionTitle ?? "本單元單字練習"}</h1>
          </div>
          <p className={styles.sheetMeta}>
            {firstWord
              ? `第 ${firstWord.chapterNumber} 章・${firstWord.chapterTitle}・第 ${firstWord.sectionNumber} 節`
              : enabled
                ? `第 ${chapter} 章・第 ${section} 節`
                : "請從單字頁選擇單元"}
            ｜{printWords.length} 詞
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
          <PracticeSections
            words={printWords}
            direction={direction}
            showQuestionReading={showQuestionReading}
            showAnswerReading={showAnswerReading}
            includeAnswerKey={includeAnswerKey}
            layout={layout}
          />
        )}
        {printWords.length > 0 && mode === "study" && (
          <StudyList
            words={printWords}
            showReading={showStudyReading}
            showExamples={showExamples}
            layout={layout}
          />
        )}
        {printWords.length > 0 && mode === "answers" && (
          <AnswerKey
            words={printWords}
            showReading={showAnswerReading}
            layout={layout}
            title="答案整理"
          />
        )}
      </article>
    </main>
  );
}

type DirectionPageProps = {
  words: VocabularyWord[];
  direction: "ja-to-zh" | "zh-to-ja";
  showReading: boolean;
  continuation: boolean;
  startIndex?: number;
};

function DirectionPage({
  words,
  direction,
  showReading,
  continuation,
  startIndex = 0,
}: DirectionPageProps) {
  const isMeaning = direction === "ja-to-zh";

  return (
    <section className={`${styles.exerciseSection} ${continuation ? styles.pageBreakBefore : ""}`}>
      <h2>
        {isMeaning ? "日文 → 中文" : "中文 → 日文"}
        {continuation && <small>｜續頁</small>}
      </h2>
      <p className={styles.instruction}>
        {isMeaning ? "看日文單字，寫出中文意思。" : "看中文意思，寫出日文單字。"}
      </p>
      <ol className={styles.questionList}>
        {words.map((word, index) => (
          <li className={styles.questionRow} key={`${direction}-${word.id}`}>
            <span className={styles.questionNumber}>
              {String(startIndex + index + 1).padStart(2, "0")}
            </span>
            <span
              className={isMeaning ? styles.promptWord : styles.promptMeaning}
              lang={isMeaning ? "ja" : undefined}
            >
              {isMeaning ? (
                <>
                  <strong>{word.word}</strong>
                  {showReading && (
                    <small className={styles.promptReading}>{word.reading}</small>
                  )}
                </>
              ) : (
                word.meaningZhTw
              )}
            </span>
            <span
              className={styles.answerLine}
              aria-label={isMeaning ? "中文作答欄" : "日文作答欄"}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

type PracticeSectionsProps = {
  words: VocabularyWord[];
  direction: PracticeDirection;
  showQuestionReading: boolean;
  showAnswerReading: boolean;
  includeAnswerKey: boolean;
  layout: PrintLayout;
};

function PracticeSections({
  words,
  direction,
  showQuestionReading,
  showAnswerReading,
  includeAnswerKey,
  layout,
}: PracticeSectionsProps) {
  const capacity = layout === "two-column" ? 34 : 17;
  const directions = direction === "both"
    ? (["ja-to-zh", "zh-to-ja"] as const)
    : ([direction] as const);
  let pageIndex = 0;

  return (
    <>
      {directions.flatMap((currentDirection) =>
        chunkWords(words, capacity).map((chunk, chunkIndex) => {
          const node = (
            <DirectionPage
              key={`${currentDirection}-${pageIndex}`}
              words={chunk}
              direction={currentDirection}
              showReading={showQuestionReading}
              continuation={pageIndex > 0}
              startIndex={chunkIndex * capacity}
            />
          );
          pageIndex += 1;
          return node;
        }),
      )}
      {includeAnswerKey && (
        <AnswerKey
          words={words}
          showReading={showAnswerReading}
          layout={layout}
          title="答案｜請完成題目後再查看"
        />
      )}
    </>
  );
}

type StudyListProps = {
  words: VocabularyWord[];
  showReading: boolean;
  showExamples: boolean;
  layout: PrintLayout;
};

function StudyList({ words, showReading, showExamples, layout }: StudyListProps) {
  const capacity = layout === "two-column" ? 34 : 17;

  return (
    <>
      {chunkWords(words, capacity).map((chunk, index) => (
        <section
          className={`${styles.exerciseSection} ${index > 0 ? styles.pageBreakBefore : ""}`}
          key={`study-${index}`}
        >
          <h2>
            學習清單
            {index > 0 && <small>｜續頁</small>}
          </h2>
          <p className={styles.instruction}>依序複習單字、讀音與中文意思。</p>
          <ol className={styles.studyList}>
            {chunk.map((word, offset) => (
              <li className={styles.studyRow} key={`study-${word.id}`}>
                <span className={styles.questionNumber}>
                  {String(index * capacity + offset + 1).padStart(2, "0")}
                </span>
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
      ))}
    </>
  );
}

type AnswerKeyProps = {
  words: VocabularyWord[];
  showReading: boolean;
  layout: PrintLayout;
  title: string;
};

function AnswerKey({ words, showReading, layout, title }: AnswerKeyProps) {
  const capacity = layout === "two-column" ? 34 : 17;

  return (
    <>
      {chunkWords(words, capacity).map((chunk, index) => (
        <section
          className={`${styles.exerciseSection} ${styles.answerKey} ${index > 0 ? styles.pageBreakBefore : ""}`}
          key={`answers-${index}`}
        >
          <h2>
            {title}
            {index > 0 && <small>｜續頁</small>}
          </h2>
          <ol className={styles.answerList}>
            {chunk.map((word, offset) => (
              <li key={`answer-${word.id}`}>
                <span className={styles.questionNumber}>
                  {String(index * capacity + offset + 1).padStart(2, "0")}
                </span>
                <span lang="ja">
                  <strong>{word.word}</strong>
                  {showReading && (
                    <small className={styles.answerReading}>{word.reading}</small>
                  )}
                </span>
                <small>{word.meaningZhTw}</small>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

export default function PrintPracticePage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.notice}>正在準備練習單…</p>
        </main>
      }
    >
      <PrintPracticeContent />
    </Suspense>
  );
}
