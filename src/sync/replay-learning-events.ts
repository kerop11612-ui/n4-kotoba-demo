import { reviewWordMemory, createWordMemory } from "../spaced-repetition/fsrs-adapter.ts";
import { setManualMastery } from "../spaced-repetition/mastery.ts";
import { getMemoryKey, type MemoryRepositoryData, type ReviewFormat } from "../spaced-repetition/types.ts";
import { compareEvents, deduplicateEvents, type LearningEvent, type ReviewLearningEvent } from "./learning-events.ts";

export function replayLearningEvents(events: LearningEvent[]): MemoryRepositoryData {
  const uniqueEvents = deduplicateEvents(events);
  const groups = new Map<string, LearningEvent[]>();
  for (const event of uniqueEvents) {
    const key = getMemoryKey(event.wordId, event.skill);
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  const memories: MemoryRepositoryData["memories"] = {};
  const history: MemoryRepositoryData["history"] = [];
  const reviewEvents: MemoryRepositoryData["events"] = [];
  for (const [key, group] of groups) {
    const ordered = [...group].sort(compareEvents);
    const snapshot = latestSnapshot(ordered);
    const first = ordered[0];
    let memory = snapshot
      ? structuredClone(snapshot.payload.memory)
      : createWordMemory(first.wordId, first.unitId, new Date(first.occurredAt), first.skill);
    const snapshotTime = snapshot ? Date.parse(snapshot.occurredAt) : Number.NEGATIVE_INFINITY;
    for (const event of ordered) {
      if (event.type === "memory_snapshot" || Date.parse(event.occurredAt) <= snapshotTime) continue;
      const occurredAt = new Date(event.occurredAt);
      if (event.type === "review") {
        const result = replayReview(memory, event);
        memory = result.memory;
        history.push(result.history);
        reviewEvents.push(result.event);
      } else {
        memory = setManualMastery(memory, event.payload.mastered, occurredAt);
      }
    }
    memories[key] = memory;
  }

  history.sort((left, right) => Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt) || left.id.localeCompare(right.id));
  reviewEvents.sort((left, right) => Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt) || left.id.localeCompare(right.id));
  return { schemaVersion: 2, memories, history, events: reviewEvents };
}

function latestSnapshot(events: LearningEvent[]) {
  return events
    .filter((event): event is Extract<LearningEvent, { type: "memory_snapshot" }> => event.type === "memory_snapshot")
    .sort(compareEvents)
    .at(-1);
}

function replayReview(memory: MemoryRepositoryData["memories"][string], event: ReviewLearningEvent) {
  const payload = event.payload;
  return reviewWordMemory(
    memory,
    payload.rawRating,
    payload.hintLevel,
    new Date(event.occurredAt),
    payload.responseTimeMs,
    {
      eventId: event.id,
      reviewFormat: payload.reviewFormat as ReviewFormat,
      skill: event.skill,
      answerCorrect: payload.answerCorrect,
      answerAttempts: payload.answerAttempts,
      usedHint: payload.usedHint,
      answerRevealed: payload.answerRevealed,
      correct: payload.correct,
      recalledWithoutHint: payload.recalledWithoutHint,
      responseTimeMs: payload.responseTimeMs,
      errorTypes: payload.errorTypes,
      confusedWordIds: payload.confusedWordIds,
    },
  );
}
