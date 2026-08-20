"use client";

import Link from "next/link";
import type { ChangeEvent } from "react";
import styles from "./practice.module.css";
import { AppNav } from "../components/AppNav";
import { ReviewPanel } from "../components/ReviewPanel";
import { SyncAccountCard } from "../components/SyncAccountCard";
import { usePracticeSession } from "../hooks/usePracticeSession";
import type { ReviewFormat } from "../../src/spaced-repetition/types";

export default function PracticePage() {
  const {
    reviewing,
    reviewWords,
    reviewIndex,
    reviewComplete,
    reviewFormat,
    activeReviewFormat,
    reviewRevealed,
    reviewHintLevel,
    clozeAnswer,
    clozeAnswerAttempts,
    clozeAnswerCorrect,
    isSubmitting,
    reviewSummary,
    stopReview,
    playOne,
    setReviewHintLevel,
    setReviewRevealed,
    setClozeAnswer,
    checkClozeAnswer,
    rateReview,
    audioRef,
    handleAudioEnded,
    reviewResume,
    dueCount,
    weakCount,
    queueLength,
    estimatedMinutes,
    loading,
    error,
    empty,
    format,
    practiceMode,
    setReviewFormat,
    resumeReview,
    startReview,
  } = usePracticeSession();

  function handleFormatChange(event: ChangeEvent<HTMLSelectElement>) {
    setReviewFormat(event.target.value as ReviewFormat);
  }

  if (reviewing) {
    return (
      <main className={styles.page}>
        <header className={styles.topbar}><AppNav active="practice" /></header>
        <section className={styles.reviewWorkspace}>
          <ReviewPanel
            reviewWords={reviewWords}
            reviewIndex={reviewIndex}
            reviewComplete={reviewComplete}
            reviewFormat={reviewFormat}
            activeReviewFormat={activeReviewFormat}
            reviewRevealed={reviewRevealed}
            reviewHintLevel={reviewHintLevel}
            clozeAnswer={clozeAnswer}
            clozeAnswerAttempts={clozeAnswerAttempts}
            clozeAnswerCorrect={clozeAnswerCorrect}
            isSubmitting={isSubmitting}
            reviewSummary={reviewSummary}
            showMeaning
            showExample
            showExampleTranslation
            onStopReview={stopReview}
            onPlayOne={playOne}
            onSetHintLevel={setReviewHintLevel}
            onSetRevealed={setReviewRevealed}
            onSetClozeAnswer={setClozeAnswer}
            onCheckClozeAnswer={checkClozeAnswer}
            onRate={(rating) => void rateReview(rating)}
            exitLabel="暫停練習"
            completionLabel="回到練習區"
          />
        </section>
        <audio ref={audioRef} onEnded={handleAudioEnded} aria-hidden="true" />
      </main>
    );
  }

  const hasResume = Boolean(reviewResume);
  const resumeIndex = (reviewResume?.index ?? 0) + 1;
  const resumeTotal = reviewResume?.total ?? queueLength;
  return (
    <main className={styles.page}>
      <header className={styles.topbar}><AppNav active="practice" /></header>
      <section className={styles.hero} aria-labelledby="practice-title">
        <div>
          <p className={styles.eyebrow}>今日推薦</p>
          <h1 id="practice-title">練習區</h1>
          <p className={styles.lede}>從已經學過的單字開始，跨章節整理今天最值得回想的內容。</p>
        </div>
        <div className={styles.metrics} aria-label="今日練習摘要">
          <div><strong>{dueCount}</strong><span>到期</span></div>
          <div><strong>{weakCount}</strong><span>待加強</span></div>
          <div><strong>{queueLength}</strong><span>本輪題數</span></div>
          <div><strong>{estimatedMinutes}</strong><span>分鐘</span></div>
        </div>
      </section>

      {loading && <p className={styles.notice} role="status">正在整理你的練習清單…</p>}
      {error && <p className={styles.notice} role="alert">{error}</p>}
      {empty && (
        <section className={styles.emptyState} aria-live="polite">
          <strong>還沒有可練習的單字</strong>
          <span>先在單字庫完成幾次回想，這裡就會建立跨章節練習清單。</span>
          <Link href="/">先到單字庫學習</Link>
        </section>
      )}

      {!loading && !error && !empty && (
        <section className={styles.actionCard} aria-label="開始今日練習">
          <div>
            <p className={styles.eyebrow}>今日最佳練習</p>
            <p className={styles.recommendation}>包含 {dueCount} 個到期、{weakCount} 個待加強（分類可能重疊），每個單字挑最需要回想的技能。</p>
            <details className={styles.customPractice}>
              <summary>自訂練習</summary>
              <label className={styles.formatField} htmlFor="practice-format">
                <span>指定回想方式</span>
                <select id="practice-format" value={format} onChange={handleFormatChange}>
                  <option value="jp-to-zh">日文回想中文</option>
                  <option value="zh-to-jp">中文回想日文</option>
                  <option value="cloze">例句填空</option>
                </select>
              </label>
            </details>
            <span className={styles.modeNote}>{practiceMode === "recommended" ? "目前使用推薦模式" : "目前使用自訂模式"}</span>
          </div>
          <div className={styles.actionButtons}>
            <button className={styles.primaryButton} type="button" onClick={hasResume ? resumeReview : startReview}>
              {hasResume ? `繼續第 ${resumeIndex} / ${resumeTotal} 題` : `開始 ${queueLength} 題`}
            </button>
            {hasResume && <button className={styles.secondaryButton} type="button" onClick={startReview}>重新開始</button>}
          </div>
        </section>
      )}

      <SyncAccountCard />
    </main>
  );
}
