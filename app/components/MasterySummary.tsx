import styles from "../demo.module.css";
import type { UnitStats } from "../../src/spaced-repetition/types";

type MasterySummaryProps = {
  stats: UnitStats;
};

export function MasterySummary({ stats }: MasterySummaryProps) {
  const retentionLabel = stats.masteryDataReady ? `${stats.masteryPercent}%` : "資料累積中";
  const retentionNote = stats.masteryDataReady
    ? `預估 ${stats.horizonDays} 天後保持率`
    : `已有 ${stats.masteryReadyWords} / ${stats.reviewedWords} 個單字達到 3 次複習`;
  const statusCounts = stats.learningStatusCounts;
  const plan = statusCounts["需要加強"] > 0
    ? `先練 ${statusCounts["需要加強"]} 個需要加強的單字`
    : statusCounts["學習中"] > 0
      ? `接著複習 ${statusCounts["學習中"]} 個學習中的單字`
      : statusCounts["尚未練習"] > 0
        ? `再學 ${Math.min(5, statusCounts["尚未練習"])} 個新字`
        : "目前可跳過已熟悉單字";
  return (
    <div className={styles.masterySummary} aria-label="單元學習統計">
      <div className={styles.masteryMain}>
        <span>30 天預估保持率</span>
        <strong>{retentionLabel}</strong>
        <small>{retentionNote}・目前記憶率 {stats.currentRecallPercent}%</small>
        <progress value={stats.masteryDataReady ? stats.masteryPercent : 0} max={100} aria-label="30 天預估保持率" />
      </div>
      <span className={styles.masteryReviewed}>已複習 {stats.reviewedWords} / {stats.totalWords} 個</span>
      <section className={styles.practicePlan} aria-label="今天怎麼練">
        <div className={styles.practicePlanHeader}>
          <span>今天怎麼練</span>
          <strong>{plan}</strong>
        </div>
        <div className={styles.practicePlanSteps}>
          <span className={styles.practicePlanNeeds}>需要加強 <b>{statusCounts["需要加強"]}</b></span>
          <span className={styles.practicePlanLearning}>學習中 <b>{statusCounts["學習中"]}</b></span>
          <span className={styles.practicePlanFresh}>尚未練習 <b>{statusCounts["尚未練習"]}</b></span>
          <span className={styles.practicePlanStable}>已熟悉 <b>{statusCounts["已熟悉"]}</b></span>
          <span className={styles.practicePlanManual}>手動已學會 <b>{statusCounts["手動已學會"]}</b></span>
        </div>
      </section>
      <details className={styles.masteryDetails}>
        <summary>查看全部統計</summary>
        <div className={styles.masteryDetailGrid}>
          <div><span>已複習單字</span><strong>{stats.reviewedWords} / {stats.totalWords}</strong></div>
          <div><span>獨立回想成功</span><strong>{stats.independentRecallRatePercent === null ? "—" : `${stats.independentRecallRatePercent}%`}</strong></div>
          <div><span>非獨立回想比例</span><strong>{stats.hintDependencyPercent === null ? "—" : `${stats.hintDependencyPercent}%`}</strong></div>
          <div><span>今日到期</span><strong>{stats.dueToday}</strong></div>
          <div><span>逾期</span><strong>{stats.overdue}</strong></div>
        </div>
      </details>
    </div>
  );
}
