import styles from "../demo.module.css";
import type { UnitStats } from "../../src/spaced-repetition/types";

type MasterySummaryProps = {
  stats: UnitStats;
};

export function MasterySummary({ stats }: MasterySummaryProps) {
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
        <span>本單元進度</span>
        <strong>已複習 {stats.reviewedWords} / {stats.totalWords} 個</strong>
        {stats.masteryDataReady && <small>30 天保持率 {stats.masteryPercent}%</small>}
        <progress value={stats.coveragePercent} max={100} aria-label="已複習覆蓋率" />
      </div>
      <section className={styles.practicePlan} aria-label="今天怎麼練">
        <div className={styles.practicePlanHeader}>
          <span>今天怎麼練</span>
          <strong>{plan}</strong>
        </div>
      </section>
      <details className={styles.masteryDetails}>
        <summary>查看詳細統計</summary>
        <div className={styles.masteryDetailGrid}>
          <div>
            <span>30 天保持率</span>
            <strong>{stats.masteryDataReady ? `${stats.masteryPercent}%` : "尚在建立"}</strong>
            {!stats.masteryDataReady && (
              <small>
                {stats.reviewedWords === 0
                  ? "完成第一次複習後開始累積"
                  : `已有 ${stats.masteryReadyWords} / ${stats.reviewedWords} 個已複習單字完成 3 次複習`}
              </small>
            )}
          </div>
          <div><span>目前記憶率</span><strong>{stats.reviewedWords === 0 ? "尚未評估" : `${stats.currentRecallPercent}%`}</strong></div>
          <div><span>已複習單字</span><strong>{stats.reviewedWords} / {stats.totalWords}</strong></div>
          <div><span>需要加強</span><strong>{statusCounts["需要加強"]}</strong></div>
          <div><span>學習中</span><strong>{statusCounts["學習中"]}</strong></div>
          <div><span>尚未練習</span><strong>{statusCounts["尚未練習"]}</strong></div>
          <div><span>已熟悉</span><strong>{statusCounts["已熟悉"]}</strong></div>
          <div><span>手動已學會</span><strong>{statusCounts["手動已學會"]}</strong></div>
          <div><span>獨立回想成功</span><strong>{stats.independentRecallRatePercent === null ? "—" : `${stats.independentRecallRatePercent}%`}</strong></div>
          <div><span>非獨立回想比例</span><strong>{stats.hintDependencyPercent === null ? "—" : `${stats.hintDependencyPercent}%`}</strong></div>
          <div><span>今日到期</span><strong>{stats.dueToday}</strong></div>
          <div><span>逾期</span><strong>{stats.overdue}</strong></div>
        </div>
      </details>
    </div>
  );
}
