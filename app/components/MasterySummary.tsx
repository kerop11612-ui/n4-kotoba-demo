import styles from "../demo.module.css";
import type { UnitStats } from "../../src/spaced-repetition/types";

type MasterySummaryProps = {
  stats: UnitStats;
};

export function MasterySummary({ stats }: MasterySummaryProps) {
  return (
    <div className={styles.masterySummary} aria-label="單元學習統計">
      <div className={styles.masteryMain}>
        <span>30 天保持率</span>
        <strong>{stats.masteryPercent}%</strong>
        <small>目前記憶率 {stats.currentRecallPercent}%</small>
        <progress value={stats.masteryPercent} max={100} aria-label="30 天保持率" />
      </div>
      <div><span>已測驗</span><strong>{stats.reviewedWords} / {stats.totalWords}</strong></div>
      <div><span>無提示答對率</span><strong>{stats.independentRecallRatePercent === null ? "—" : `${stats.independentRecallRatePercent}%`}</strong></div>
      <div><span>提示依賴率</span><strong>{stats.hintDependencyPercent === null ? "—" : `${stats.hintDependencyPercent}%`}</strong></div>
      <div><span>今日到期</span><strong>{stats.dueToday}</strong></div>
      <div><span>逾期</span><strong>{stats.overdue}</strong></div>
    </div>
  );
}
