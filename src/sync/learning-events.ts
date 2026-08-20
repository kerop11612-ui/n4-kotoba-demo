import type {
  MemoryRepositoryData,
  MemorySkill,
  ReviewFormat,
  ReviewHistoryRecord,
  WordMemoryRecord,
} from "../spaced-repetition/types.ts";

type LearningEventBase = {
  version: 1;
  id: string;
  deviceId: string;
  wordId: string;
  unitId: string;
  skill: MemorySkill;
  occurredAt: string;
};

export type ReviewLearningEvent = LearningEventBase & {
  type: "review";
  payload: Pick<ReviewHistoryRecord, "rawRating" | "hintLevel" | "answerCorrect" | "answerAttempts" | "usedHint" | "answerRevealed" | "responseTimeMs" | "correct" | "recalledWithoutHint" | "errorTypes" | "confusedWordIds" | "hintKinds"> & {
    reviewFormat: ReviewFormat;
  };
};

export type ManualMasteryLearningEvent = LearningEventBase & {
  type: "manual_mastery";
  payload: { mastered: boolean };
};

export type MemorySnapshotLearningEvent = LearningEventBase & {
  type: "memory_snapshot";
  payload: { memory: WordMemoryRecord };
};

export type LearningEvent = ReviewLearningEvent | ManualMasteryLearningEvent | MemorySnapshotLearningEvent;

export function createLearningEventId(randomUUID: () => string = () => crypto.randomUUID()): string {
  return randomUUID();
}

export function reviewHistoryToLearningEvent(
  history: ReviewHistoryRecord,
  deviceId: string,
): ReviewLearningEvent {
  const skill = history.skill ?? skillForReviewFormat(history.reviewFormat);
  return {
    version: 1,
    id: history.id,
    deviceId,
    wordId: history.wordId,
    unitId: history.unitId,
    skill,
    occurredAt: history.reviewedAt,
    type: "review",
    payload: {
      rawRating: history.rawRating,
      hintLevel: history.hintLevel,
      answerCorrect: history.answerCorrect,
      answerAttempts: history.answerAttempts,
      usedHint: history.usedHint,
      answerRevealed: history.answerRevealed,
      responseTimeMs: history.responseTimeMs,
      correct: history.correct,
      recalledWithoutHint: history.recalledWithoutHint,
      errorTypes: history.errorTypes,
      hintKinds: history.hintKinds ? [...history.hintKinds] : undefined,
      confusedWordIds: history.confusedWordIds,
      reviewFormat: history.reviewFormat ?? formatForSkill(skill),
    },
  };
}

export function seedLearningEvents(data: MemoryRepositoryData, deviceId: string): LearningEvent[] {
  const events: LearningEvent[] = data.history.map((history) => reviewHistoryToLearningEvent(history, deviceId));
  const historyCounts = new Map<string, number>();
  for (const history of data.history) {
    const skill = history.skill ?? skillForReviewFormat(history.reviewFormat);
    const key = `${history.wordId}:${skill}`;
    historyCounts.set(key, (historyCounts.get(key) ?? 0) + 1);
  }
  for (const memory of Object.values(data.memories)) {
    const key = `${memory.wordId}:${memory.skill}`;
    const matchingHistoryCount = historyCounts.get(key) ?? 0;
    if (memory.reviewCount <= matchingHistoryCount && !memory.manualMastered) continue;
    events.push({
      version: 1,
      id: `snapshot:${memory.wordId}:${memory.skill}:${memory.updatedAt}`,
      deviceId,
      wordId: memory.wordId,
      unitId: memory.unitId,
      skill: memory.skill,
      occurredAt: memory.updatedAt,
      type: "memory_snapshot",
      payload: { memory: structuredClone(memory) },
    });
  }
  return deduplicateEvents(events).sort(compareEvents);
}

function skillForReviewFormat(format: ReviewFormat | undefined): MemorySkill {
  if (format === "zh-to-jp") return "meaning_to_jp";
  if (format === "cloze") return "context_to_word";
  return "jp_to_meaning";
}

function formatForSkill(skill: MemorySkill): ReviewFormat {
  if (skill === "meaning_to_jp") return "zh-to-jp";
  if (skill === "context_to_word") return "cloze";
  return "jp-to-zh";
}

export function deduplicateEvents(events: LearningEvent[]): LearningEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

export function compareEvents(left: LearningEvent, right: LearningEvent): number {
  const byDate = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  return byDate || left.id.localeCompare(right.id);
}
