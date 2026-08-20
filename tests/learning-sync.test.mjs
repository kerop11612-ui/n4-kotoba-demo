import assert from "node:assert/strict";
import test from "node:test";
import { createWordMemory, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { reviewHistoryToLearningEvent, seedLearningEvents } from "../src/sync/learning-events.ts";
import { replayLearningEvents } from "../src/sync/replay-learning-events.ts";
import { LocalSyncStateStore } from "../src/sync/local-sync-state.ts";
import { createMemoryRepository } from "../src/storage/repository-factory.ts";
import { SyncCoordinator } from "../src/sync/sync-coordinator.ts";
import { SyncingMemoryRepository } from "../src/sync/syncing-memory-repository.ts";

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

test("learning event round-trip keeps optional hint kinds", () => {
  const memory = createWordMemory("hint-sync", "n4-1-1", new Date("2026-08-01T00:00:00Z"));
  const result = reviewWordMemory(memory, "good", 1, new Date("2026-08-02T00:00:00Z"), 1000, {
    reviewFormat: "zh-to-jp",
    correct: true,
    usedHint: true,
    hintKinds: ["length", "kana-1"],
  });
  const event = reviewHistoryToLearningEvent(result.history, "phone");
  assert.deepEqual(event.payload.hintKinds, ["length", "kana-1"]);
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

test("repository namespaces do not expose another user's local data", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const guest = createMemoryRepository(storage, null, "guest");
  const owner = createMemoryRepository(storage, null, "user:owner-1");
  await guest.migrate();
  await guest.saveWordMemory(createWordMemory("guest-word", "n4-1-1"));
  await owner.migrate();
  assert.equal(await owner.getWordMemory("guest-word"), null);
});

test("outbox enqueue is idempotent by event id", () => {
  const memoryStorage = new Map();
  const stateStore = new LocalSyncStateStore({
    getItem: (key) => memoryStorage.get(key) ?? null,
    setItem: (key, value) => memoryStorage.set(key, value),
    removeItem: (key) => memoryStorage.delete(key),
  });
  const event = {
    version: 1,
    id: "event-a",
    deviceId: "phone",
    type: "manual_mastery",
    wordId: "n4-0001",
    unitId: "n4-1-1",
    skill: "jp_to_meaning",
    occurredAt: "2026-08-04T00:00:00Z",
    payload: { mastered: true },
  };
  stateStore.enqueue("owner-1", [event, event]);
  assert.equal(stateStore.read("owner-1").outbox.length, 1);
});

test("failed upload keeps local review in the outbox", async () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  };
  const repository = createMemoryRepository(storage, null, "user:owner");
  await repository.migrate();
  const stateStore = new LocalSyncStateStore(storage);
  const cloud = new FakeCloudEventStore({ uploadError: new Error("offline") });
  const coordinator = new SyncCoordinator({ cloud, stateStore, deviceId: "phone" });
  await coordinator.start("owner", repository);
  const event = createReviewLearningEvent("local-word", "2026-08-05T00:00:00Z");
  await coordinator.record(event);
  await assert.rejects(coordinator.syncNow());
  assert.deepEqual(stateStore.read("owner").outbox.map((item) => item.id), [event.id]);
  assert.equal(coordinator.status, "error");
});

test("successful sync uploads idempotently, pulls pages, and rebuilds local data", async () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  };
  const repository = createMemoryRepository(storage, null, "user:owner");
  await repository.migrate();
  const stateStore = new LocalSyncStateStore(storage);
  const remoteEvent = createReviewLearningEvent("remote-word", "2026-08-04T00:00:00Z");
  const localEvent = createReviewLearningEvent("local-word", "2026-08-05T00:00:00Z");
  const cloud = new FakeCloudEventStore({ rows: [{ event: remoteEvent, serverSeq: 1 }] });
  const coordinator = new SyncCoordinator({ cloud, stateStore, deviceId: "phone" });
  await coordinator.start("owner", repository);
  await coordinator.record(localEvent);
  await coordinator.syncNow();
  const data = await repository.exportData();
  assert.equal(data.history.length, 2);
  assert.equal(stateStore.read("owner").outbox.length, 0);
  assert.equal(stateStore.read("owner").lastServerSeq, 1);
});

test("sync pulls more than one page and advances the server cursor", async () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  };
  const repository = createMemoryRepository(storage, null, "user:owner");
  await repository.migrate();
  const rows = Array.from({ length: 501 }, (_, index) => ({
    event: createReviewLearningEvent(`remote-${index}`, `2026-08-04T00:${String(index % 60).padStart(2, "0")}:00Z`),
    serverSeq: index + 1,
  }));
  const stateStore = new LocalSyncStateStore(storage);
  const cloud = new FakeCloudEventStore({ rows });
  const coordinator = new SyncCoordinator({ cloud, stateStore, deviceId: "phone" });
  await coordinator.start("owner", repository);
  assert.equal(stateStore.read("owner").lastServerSeq, 501);
  assert.equal((await repository.exportData()).history.length, 501);
});

test("cloud-first reset leaves local data unchanged when deletion fails", async () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  };
  const repository = createMemoryRepository(storage, null, "user:owner");
  await repository.migrate();
  const result = reviewWordMemory(createWordMemory("keep", "n4-1-1"), "good", 0, new Date("2026-08-05T00:00:00Z"), 1000, { eventId: "keep-event", reviewFormat: "jp-to-zh" });
  await repository.commitReview(result.memory, result.history, result.event);
  const stateStore = new LocalSyncStateStore(storage);
  const cloud = new FakeCloudEventStore();
  const coordinator = new SyncCoordinator({ cloud, stateStore, deviceId: "phone" });
  await coordinator.start("owner", repository);
  cloud.clearError = new Error("offline");
  await assert.rejects(coordinator.reset());
  assert.equal((await repository.exportData()).history.length, 1);
});

test("review commit remains local when cloud sync fails and can retry", async () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  };
  const localRepository = createMemoryRepository(storage, null, "user:owner");
  await localRepository.migrate();
  const stateStore = new LocalSyncStateStore(storage);
  const cloud = new FakeCloudEventStore({ uploadError: new Error("offline") });
  const coordinator = new SyncCoordinator({ cloud, stateStore, deviceId: "phone" });
  await coordinator.start("owner", localRepository);
  const repository = new SyncingMemoryRepository(localRepository, coordinator);
  const result = reviewWordMemory(createWordMemory("sync-word", "n4-1-1"), "good", 0, new Date("2026-08-06T00:00:00Z"), 1000, { eventId: "sync-event", reviewFormat: "jp-to-zh" });

  await repository.commitReview(result.memory, result.history, result.event);
  assert.equal((await localRepository.exportData()).history.length, 1);
  assert.deepEqual(stateStore.read("owner").outbox.map((item) => item.id), [result.history.id]);
  await assert.rejects(coordinator.syncNow());
  cloud.uploadError = null;
  await coordinator.syncNow();
  assert.deepEqual(stateStore.read("owner").outbox, []);
});

test("signed-in reset does not clear local data when cloud deletion fails", async () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  };
  const localRepository = createMemoryRepository(storage, null, "user:owner");
  await localRepository.migrate();
  const result = reviewWordMemory(createWordMemory("keep-sync", "n4-1-1"), "good", 0, new Date("2026-08-06T00:00:00Z"), 1000, { eventId: "keep-sync-event", reviewFormat: "jp-to-zh" });
  await localRepository.commitReview(result.memory, result.history, result.event);
  const stateStore = new LocalSyncStateStore(storage);
  const cloud = new FakeCloudEventStore();
  const coordinator = new SyncCoordinator({ cloud, stateStore, deviceId: "phone" });
  await coordinator.start("owner", localRepository);
  const repository = new SyncingMemoryRepository(localRepository, coordinator);
  cloud.clearError = new Error("offline");

  await assert.rejects(repository.reset());
  assert.equal((await localRepository.exportData()).history.length, 1);
});

class FakeCloudEventStore {
  constructor({ rows = [], uploadError = null } = {}) {
    this.rows = rows;
    this.uploadError = uploadError;
    this.clearError = null;
    this.uploadedIds = [];
  }

  async upload(_userId, events) {
    if (this.uploadError) throw this.uploadError;
    for (const event of events) {
      if (!this.uploadedIds.includes(event.id)) this.uploadedIds.push(event.id);
    }
  }

  async pull(_userId, afterSeq, limit) {
    return this.rows.filter((row) => row.serverSeq > afterSeq).sort((a, b) => a.serverSeq - b.serverSeq).slice(0, limit);
  }

  async clear() {
    if (this.clearError) throw this.clearError;
    this.rows = [];
  }
}

function createReviewLearningEvent(wordId, occurredAt) {
  const memory = createWordMemory(wordId, "n4-1-1", new Date("2026-08-01T00:00:00Z"));
  const result = reviewWordMemory(memory, "good", 0, new Date(occurredAt), 1000, {
    eventId: `event-${wordId}`,
    reviewFormat: "jp-to-zh",
  });
  return reviewHistoryToLearningEvent(result.history, "phone");
}
