import type { MemorySkill, VocabularyReviewEvent } from "./types.ts";

export type LeechState = "normal" | "struggling" | "leech" | "scaffolded" | "recovering" | "mastered";

export interface LeechSnapshot {
  state: LeechState;
  enteredAt: string;
  independentFailuresAcrossSessions: number;
  independentFailuresAcrossDays: number;
  failedSkills: MemorySkill[];
  recurringConfusedWordIds: string[];
  reasons: string[];
}

export function transitionLeechState(
  previous: LeechSnapshot | undefined,
  attempts: readonly VocabularyReviewEvent[],
  now = new Date(),
): LeechSnapshot {
  // Sort attempts chronologically
  const sorted = [...attempts].sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt));

  // Analyze failures across sessions and calendar days
  const sessionFailures = new Set<string>();
  const dayFailures = new Set<string>();
  const failedSkills = new Set<MemorySkill>();
  const confusionCounts = new Map<string, number>();

  let hasScaffold = false;
  let hasDiagnosticAfterScaffold = false;
  let hasSpacedSuccessAfterRecovery = false;
  let scaffoldTimestamp = 0;
  let recoveryTimestamp = 0;

  for (const ev of sorted) {
    const isIndependent = !ev.usedHint && ev.hintLevel === 0 && !ev.answerRevealedBeforeResponse;
    const isFailure = isIndependent && !ev.correct;
    const evTime = Date.parse(ev.reviewedAt);

    if (ev.attemptKind === "scaffold") {
      hasScaffold = true;
      scaffoldTimestamp = evTime;
    } else if (hasScaffold && evTime > scaffoldTimestamp) {
      if (isIndependent && ev.correct) {
        if (!hasDiagnosticAfterScaffold) {
          hasDiagnosticAfterScaffold = true;
          recoveryTimestamp = evTime;
        } else if (evTime > recoveryTimestamp + 86_400_000) { // spaced success after 1 day
          hasSpacedSuccessAfterRecovery = true;
        }
      }
    }

    if (isFailure) {
      if (ev.sessionId) {
        sessionFailures.add(ev.sessionId);
      }
      const dayKey = ev.reviewedAt.slice(0, 10);
      dayFailures.add(dayKey);
      failedSkills.add(ev.skill);

      if (ev.confusedWordIds) {
        for (const id of ev.confusedWordIds) {
          confusionCounts.set(id, (confusionCounts.get(id) ?? 0) + 1);
        }
      }
    }
  }

  const recurringConfusedWordIds = [...confusionCounts.entries()]
    .filter(([_, count]) => count >= 2)
    .map(([id]) => id);

  const reasons: string[] = [];
  let state: LeechState = "normal";

  // Check state transitions
  const numSessionFailures = sessionFailures.size;
  const numDayFailures = dayFailures.size;
  const numFailedSkills = failedSkills.size;

  // Most recent event to check if last attempt was failure
  const lastAttempt = sorted[sorted.length - 1];
  const lastWasIndependentFailure = lastAttempt
    && !lastAttempt.usedHint
    && lastAttempt.hintLevel === 0
    && !lastAttempt.answerRevealedBeforeResponse
    && !lastAttempt.correct;

  if (hasSpacedSuccessAfterRecovery && !lastWasIndependentFailure) {
    state = "mastered";
    reasons.push("間隔後再次成功獨立提取，已穩固掌握");
  } else if (hasDiagnosticAfterScaffold && !lastWasIndependentFailure) {
    state = "recovering";
    reasons.push("鷹架引導後已完成獨立診斷測驗");
  } else if (hasScaffold && !lastWasIndependentFailure) {
    state = "scaffolded";
    reasons.push("已介入鷹架拆解練習");
  } else if (numDayFailures >= 2 || numFailedSkills >= 2 || recurringConfusedWordIds.length > 0) {
    state = "leech";
    if (numDayFailures >= 2) reasons.push(`跨越 ${numDayFailures} 天持續出現獨立錯誤`);
    if (numFailedSkills >= 2) reasons.push(`跨越多種題型技能失誤 (${[...failedSkills].join(", ")})`);
    if (recurringConfusedWordIds.length > 0) reasons.push("持續出現相同易混淆單字干擾");
  } else if (numSessionFailures >= 2 || (numSessionFailures >= 1 && numDayFailures >= 1)) {
    state = "struggling";
    reasons.push(`在 ${numSessionFailures} 個學習 session 中出現獨立回想困難`);
  } else {
    state = "normal";
    reasons.push("記憶狀態正常，無頑固學習阻礙");
  }

  const enteredAt = (previous?.state === state && previous?.enteredAt)
    ? previous.enteredAt
    : now.toISOString();

  return {
    state,
    enteredAt,
    independentFailuresAcrossSessions: numSessionFailures,
    independentFailuresAcrossDays: numDayFailures,
    failedSkills: [...failedSkills],
    recurringConfusedWordIds,
    reasons,
  };
}
