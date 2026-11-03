import { useRef } from "react";
import styles from "../demo.module.css";
import toolbarStyles from "./LearningToolbar.module.css";
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
  // 推薦卡已提供同一個開始入口；只有續答或複習中才需要這顆按鈕。
  const hideReviewAction = hasRecommendation && !reviewing && !reviewResume;
  const settingsToggleRef = useRef<HTMLButtonElement>(null);
  const displayToggles = [
    { label: "中文意思", pressed: showMeaning, onToggle: onToggleMeaning },
    { label: "日文讀音", pressed: showReading, onToggle: onToggleReading },
    { label: "日文例句", pressed: showExample, onToggle: onToggleExample },
    { label: "例句中文", pressed: showExampleTranslation, onToggle: onToggleExampleTranslation },
    { label: "模糊翻譯", pressed: blurTranslations, onToggle: onToggleBlurTranslations },
  ];
  return (
    <div className={`${styles.toolbar} ${hideReviewAction ? styles.toolbarWithoutReview : ""}`}>
      {!hideReviewAction && <div className={styles.reviewActionGroup}>
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
      </div>}

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
        ref={settingsToggleRef}
        className={styles.displaySettingsToggle}
        type="button"
        aria-expanded={showDisplaySettings}
        aria-controls="display-settings-panel"
        onClick={onToggleDisplaySettings}
      >
        更多設定
        <svg
          className={`${toolbarStyles.toggleIcon} ${showDisplaySettings ? toolbarStyles.toggleIconOpen : ""}`}
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {showDisplaySettings && (
        <div
          className={toolbarStyles.panel}
          id="display-settings-panel"
          role="group"
          aria-label="學習設定與工具"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            onToggleDisplaySettings();
            settingsToggleRef.current?.focus();
          }}
        >
          <div className={toolbarStyles.group} role="group" aria-labelledby="settings-group-0">
            <p className={toolbarStyles.groupTitle} id="settings-group-0">複習方式</p>
            <div className={toolbarStyles.fields}>
              <label className={`${styles.reviewModeField} ${toolbarStyles.field}`}>
                <span>題目範圍</span>
                <select value={reviewMode} onChange={(event) => onReviewModeChange(event.target.value as QueueMode)}>
                  <option value="focused">專注最多 10 題</option>
                  <option value="unit">整單元</option>
                  <option value="today">今日到期</option>
                  <option value="priority">優先複習</option>
                  <option value="random">隨機</option>
                </select>
              </label>
              <label className={`${styles.reviewModeField} ${toolbarStyles.field}`}>
                <span>題型</span>
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
            </div>
          </div>
          <div className={toolbarStyles.group} role="group" aria-labelledby="settings-group-1">
            <p className={toolbarStyles.groupTitle} id="settings-group-1">卡片顯示</p>
            <div className={toolbarStyles.switches} aria-label="單字顯示設定">
              {displayToggles.map((toggle) => (
                <button
                  className={toolbarStyles.switch}
                  type="button"
                  aria-pressed={toggle.pressed}
                  onClick={toggle.onToggle}
                  key={toggle.label}
                >
                  <span>{toggle.label}</span>
                  <span className={toolbarStyles.track} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div className={toolbarStyles.group} role="group" aria-labelledby="settings-group-2">
            <p className={toolbarStyles.groupTitle} id="settings-group-2">工具</p>
            <Link className={toolbarStyles.toolLink} href={exportHref} target="_blank" rel="noreferrer">
              列印練習單（新分頁）
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
