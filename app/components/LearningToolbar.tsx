import styles from "../demo.module.css";
import Link from "next/link";
import { AudioIcon } from "./vocabulary";
import type { QueueMode } from "../../src/spaced-repetition/review-queue";
import type { ReviewFormat } from "../../src/spaced-repetition/types";

type LearningToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  visibleWordCount: number;
  totalWordCount: number;
  hasVisibleWords: boolean;
  isPlaylist: boolean;
  reviewing: boolean;
  memoryReady: boolean;
  reviewCount: number;
  reviewEstimateMinutes: number;
  reviewResume: { index: number; total: number } | null;
  reviewMode: QueueMode;
  reviewFormat: ReviewFormat;
  showDisplaySettings: boolean;
  showMeaning: boolean;
  showReading: boolean;
  showExample: boolean;
  showExampleTranslation: boolean;
  blurTranslations: boolean;
  hasRecommendation: boolean;
  onTogglePlaylist: () => void;
  exportHref: string;
  onToggleReview: () => void;
  onResumeReview: () => void;
  onRestartReview: () => void;
  onReviewModeChange: (mode: QueueMode) => void;
  onReviewFormatChange: (format: ReviewFormat) => void;
  onToggleDisplaySettings: () => void;
  onToggleMeaning: () => void;
  onToggleReading: () => void;
  onToggleExample: () => void;
  onToggleExampleTranslation: () => void;
  onToggleBlurTranslations: () => void;
};

export function LearningToolbar({
  search,
  onSearchChange,
  visibleWordCount,
  totalWordCount,
  hasVisibleWords,
  isPlaylist,
  reviewing,
  memoryReady,
  reviewCount,
  reviewEstimateMinutes,
  reviewResume,
  reviewMode,
  reviewFormat,
  showDisplaySettings,
  showMeaning,
  showReading,
  showExample,
  showExampleTranslation,
  blurTranslations,
  hasRecommendation,
  onTogglePlaylist,
  exportHref,
  onToggleReview,
  onResumeReview,
  onRestartReview,
  onReviewModeChange,
  onReviewFormatChange,
  onToggleDisplaySettings,
  onToggleMeaning,
  onToggleReading,
  onToggleExample,
  onToggleExampleTranslation,
  onToggleBlurTranslations,
}: LearningToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.reviewActionGroup}>
        <button
          className={`${styles.reviewStartButton} ${hasRecommendation ? styles.reviewStartSecondary : ""}`}
          type="button"
          disabled={!hasVisibleWords || !memoryReady || (!reviewing && !reviewResume && reviewCount === 0)}
          onClick={reviewing ? onToggleReview : reviewResume ? onResumeReview : onToggleReview}
        >
          <span>
            {reviewing
              ? "返回單字"
              : reviewResume
                ? `繼續第 ${reviewResume.index + 1} 題`
                : reviewCount
                  ? `開始複習 ${reviewCount} 題`
                  : "沒有可複習題"}
          </span>
          {!reviewing && reviewResume && <small>已完成 {reviewResume.index} / {reviewResume.total} 題</small>}
          {!reviewing && !reviewResume && reviewCount > 0 && <small>約 {reviewEstimateMinutes} 分鐘</small>}
        </button>
        {!reviewing && reviewResume && (
          <button className={styles.reviewRestartButton} type="button" onClick={onRestartReview}>
            從第 1 題開始
          </button>
        )}
      </div>

      <label className={styles.searchField}>
        <span className={styles.searchLabel}>
          <span>搜尋本單元</span>
          <small>{search ? `${visibleWordCount} / ${totalWordCount} 詞` : `${totalWordCount} 詞`}</small>
        </span>
        <span className={styles.searchInputWrap}>
          <input
            type="search"
            value={search}
            placeholder="搜尋單字、假名或中文"
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {search && (
            <button className={styles.searchClearButton} type="button" aria-label="清除搜尋" onClick={() => onSearchChange("")}>
              清除
            </button>
          )}
        </span>
      </label>

      <button
        className={styles.playAllButton}
        type="button"
        disabled={!hasVisibleWords}
        onClick={onTogglePlaylist}
      >
        <AudioIcon />
        {isPlaylist ? "停止播放" : "播放單字"}
      </button>
      <button
        className={styles.displaySettingsToggle}
        type="button"
        aria-expanded={showDisplaySettings}
        aria-controls="display-settings-panel"
        onClick={onToggleDisplaySettings}
      >
        更多設定 {showDisplaySettings ? "⌃" : "⌄"}
      </button>
      {showDisplaySettings && (
        <div className={styles.displaySettingsPanel} id="display-settings-panel" role="group" aria-label="學習設定與工具">
          <Link className={styles.exportButton} href={exportHref} target="_blank" rel="noreferrer">
            列印練習單
          </Link>
          <label className={styles.reviewModeField}>
            <span>佇列</span>
            <select value={reviewMode} onChange={(event) => onReviewModeChange(event.target.value as QueueMode)}>
              <option value="focused">專注最多 10 題</option>
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
              onChange={(event) => onReviewFormatChange(event.target.value as ReviewFormat)}
            >
              <option value="jp-to-zh">日文回想中文</option>
              <option value="zh-to-jp">中文回想日文</option>
              <option value="cloze">例句填空</option>
            </select>
          </label>
          <div className={styles.displaySettingsGroup} aria-label="單字顯示設定">
            <button className={showMeaning ? styles.viewToggleActive : ""} type="button" aria-pressed={showMeaning} onClick={onToggleMeaning}>
              中文意思 {showMeaning ? "顯示" : "隱藏"}
            </button>
            <button className={showReading ? styles.viewToggleActive : ""} type="button" aria-pressed={showReading} onClick={onToggleReading}>
              日文讀音 {showReading ? "顯示" : "隱藏"}
            </button>
            <button className={showExample ? styles.viewToggleActive : ""} type="button" aria-pressed={showExample} onClick={onToggleExample}>
              日文例句 {showExample ? "顯示" : "隱藏"}
            </button>
            <button className={showExampleTranslation ? styles.viewToggleActive : ""} type="button" aria-pressed={showExampleTranslation} onClick={onToggleExampleTranslation}>
              例句中文 {showExampleTranslation ? "顯示" : "隱藏"}
            </button>
            <button className={blurTranslations ? styles.viewToggleActive : ""} type="button" aria-pressed={blurTranslations} onClick={onToggleBlurTranslations}>
              中文翻譯模糊 {blurTranslations ? "開" : "關"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
