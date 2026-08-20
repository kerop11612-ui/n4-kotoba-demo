import assert from "node:assert/strict";
import test from "node:test";
import { createWordMemory, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { reviewHistoryToLearningEvent, seedLearningEvents } from "../src/sync/learning-events.ts";
import { replayLearningEvents } from "../src/sync/replay-learning-events.ts";

test("merged review events are deduplicated and replayed in time order", () => {
  const base = createWordMemory("n4-0001", "n4-1-1", new Date("2026-08-01T00:00:00Z"));
  const first = reviewWordMemory(base, "good", 0, new Date("2026-08-02T00:00:00Z"), 1000, { eventId: "event-a", reviewFormat: "jp-to-zh" });
  const second = reviewWordMemory(first.memory, "again", 0, new Date("2026-08-03T00:00:00Z"), 1200, { eventId: "event-b", reviewFormat: "jp-to-zh" });
  const events = [
    reviewHistoryToLearningEvent(second.history, "phone"),
    reviewHistoryToLearningEvent(first.history, "pc"),
    reviewHistoryToLearningEvent(first.history, "phone"),
  ];
  const data = replayLearningEvents(events);
  assert.equal(data.memories["n4-0001:jp_to_meaning"].reviewCount, 2);
  assert.equal(data.memories["n4-0001:jp_to_meaning"].lastRawRating, "again");
  assert.equal(data.history.length, 2);
});

test("manual mastery and Again follow the merged event timeline", () => {
  const events = [
    { version: 1, id: "manual", deviceId: "phone", type: "manual_mastery", wordId: "n4-0001", unitId: "n4-1-1", skill: "jp_to_meaning", occurredAt: "2026-08-02T00:00:00Z", payload: { mastered: true } },
    { version: 1, id: "again", deviceId: "pc", type: "review", wordId: "n4-0001", unitId: "n4-1-1", skill: "jp_to_meaning", occurredAt: "2026-08-03T00:00:00Z", payload: { rawRating: "again", hintLevel: 0, reviewFormat: "jp-to-zh", responseTimeMs: 1000, correct: false, usedHint: false, answerRevealed: false } },
  ];
  const data = replayLearningEvents(events);
  assert.equal(data.memories["n4-0001:jp_to_meaning"].manualMastered, false);
});

test("first-sync seeding adds a deterministic snapshot for incomplete legacy history", () => {
  const now = new Date("2026-08-04T00:00:00Z");
  const memory = createWordMemory("legacy", "n4-1-1", now);
  memory.reviewCount = 2;
  const seeded = seedLearningEvents({ schemaVersion: 2, memories: { ["legacy:jp_to_meaning"]: memory }, history: [], events: [] }, "phone");
  assert.deepEqual(seeded.map((event) => event.id), ["snapshot:legacy:jp_to_meaning:2026-08-04T00:00:00.000Z"]);
  assert.equal(seeded[0].type, "memory_snapshot");
});
