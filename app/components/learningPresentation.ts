import type { MetaScheduleReason } from "../../src/spaced-repetition/meta-scheduler";
import type { PracticePlanItem } from "../../src/spaced-repetition/practice-plan";
import type { SkillMasterySnapshot } from "../../src/spaced-repetition/skill-mastery";

export function formatSkillMastery(snapshot: SkillMasterySnapshot): string {
  if (snapshot.band === "unknown") return "尚未練習";
  if (snapshot.confidence === "low" || snapshot.retrievabilityAtHorizon === null) return "資料累積中";
  return `${Math.round(snapshot.retrievabilityAtHorizon * 100)}%`;
}

const PRACTICE_REASON_LABELS: Record<MetaScheduleReason, string> = {
  fsrs_due: "已到複習時間",
  weakness_diagnostic: "需要診斷",
  unfamiliar_skill: "優先加強",
  cross_skill_diagnostic: "技能表現不一致",
  new_skill: "練習新技能",
  leech_scaffold: "改用提示練習",
};

export function getPracticeReasonLabels(items: readonly PracticePlanItem[]): string[] {
  return [...new Set(items.flatMap((item) => item.reason ? [PRACTICE_REASON_LABELS[item.reason]] : []))];
}
