"use client";

import type { LearningRecommendationViewModel } from "../../src/spaced-repetition/study-session.ts";
import styles from "./LearningRecommendationCard.module.css";

type Props = {
  recommendation: LearningRecommendationViewModel;
  sourceLabel: "本機規則" | "AI 分析" | "快取";
  generatedAt?: string | null;
  onStart: () => void;
  onAskWhy?: () => void;
};

const actionLabels: Record<LearningRecommendationViewModel["action"], string> = {
  weak_practice: "開始弱項複習",
  due_review: "開始到期複習",
  reduce_new_cards: "先處理到期複習",
  learn_new: "開始學新字",
  gather_evidence: "開始累積資料",
};

export function LearningRecommendationCard({
  recommendation,
  sourceLabel,
  generatedAt = null,
  onStart,
  onAskWhy,
}: Props) {
  const confidenceLabel = recommendation.confidencePercent === null
    ? "資料不足"
    : `信心 ${recommendation.confidencePercent}%`;
  const generatedLabel = generatedAt ? formatGeneratedAt(generatedAt) : "剛剛由本機規則產生";

  return (
    <article className={styles.card} aria-labelledby="learning-recommendation-title">
      <div className={styles.header}>
        <span className={styles.kicker}>下一步建議</span>
        <span className={styles.source}>{sourceLabel}</span>
      </div>
      <div className={styles.content}>
        <h2 className={styles.title} id="learning-recommendation-title">{recommendation.title}</h2>
        <p className={styles.reason}>{recommendation.reason}</p>
        <div className={styles.meta} aria-label="建議證據">
          <span>{recommendation.evidenceLabel}</span>
          <span>{confidenceLabel}</span>
          <span>{generatedLabel}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.primary} type="button" onClick={onStart}>
          {actionLabels[recommendation.action]}
        </button>
        {onAskWhy && (
          <button className={styles.secondary} type="button" onClick={onAskWhy}>
            為什麼推薦？
          </button>
        )}
      </div>
    </article>
  );
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "分析時間未知";
  return `分析於 ${new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)}`;
}
