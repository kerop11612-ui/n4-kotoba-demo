import type { LearningStatus } from "./mastery.ts";

export type LearningFilter = "needs" | "all" | "learned";

export function matchesLearningFilter(
  status: LearningStatus,
  filter: LearningFilter,
  manualReviewDue = false,
): boolean {
  if (filter === "all") return true;
  if (filter === "learned") return status === "已熟悉" || status === "手動已學會";
  if (manualReviewDue && status === "手動已學會") return true;
  return status !== "已熟悉" && status !== "手動已學會";
}

export function learningFilterLabel(filter: LearningFilter): string {
  if (filter === "learned") return "已學會";
  if (filter === "all") return "全部";
  return "待加強";
}
