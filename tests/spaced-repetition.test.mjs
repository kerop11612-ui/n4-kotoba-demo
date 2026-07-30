import assert from "node:assert/strict";
import test from "node:test";
import { createClozeSentence } from "../src/spaced-repetition/cloze.ts";
import { createWordMemory, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { mapHintedRating } from "../src/spaced-repetition/rating-mapper.ts";
import { currentRetrievability } from "../src/spaced-repetition/retrievability.ts";
import { calculateUnitStats } from "../src/spaced-repetition/unit-stats.ts";
import { LocalStorageMemoryRepository } from "../src/storage/memory-repository.ts";

const now = new Date("2026-01-10T12:00:00.000Z");

test("hinted ratings preserve raw UI while lowering FSRS grade", () => {
  assert.equal(mapHintedRating("easy", 0), 4);
  assert.equal(mapHintedRating("good", 0), 3);
  assert.equal(mapHintedRating("easy", 1), 3);
  assert.equal(mapHintedRating("good", 1), 2);
  assert.equal(mapHintedRating("good", 2), 2);
  assert.equal(mapHintedRating("easy", 3), 1);
  assert.equal(mapHintedRating("again", 0), 1);
});

test("cloze replaces the longest explicit target without touching other text", () => {
  const result = createClozeSentence("昨日はさっき帰りました。", ["さっき", "先ほど"]);
  assert.equal(result.replaced, true);
  assert.equal(result.text, "昨日は＿＿＿帰りました。");
  assert.equal(createClozeSentence("例文だけです。", ["見つからない"]).replaced, false);
});

test("cloze keeps ruby markers outside the hidden target", () => {
  assert.deepEqual(createClozeSentence("先[さき]に行[い]く", ["先に"]), {
    text: "＿＿＿行[い]く",
    replaced: true,
  });
});

test("retrievability is zero before first review and decays with time", () => {
  const fresh = createWordMemory("word-1", "unit-1", now);
  assert.equal(currentRetrievability(fresh, now), 0);
  const reviewed = reviewWordMemory(fresh, "good", 0, now).memory;
  const soon = currentRetrievability(reviewed, new Date("2026-01-10T13:00:00.000Z"));
  const later = currentRetrievability(reviewed, new Date("2026-01-20T13:00:00.000Z"));
  assert.ok(soon > later);
});

test("unit mastery includes unreviewed words and separates coverage", () => {
  const first = reviewWordMemory(createWordMemory("a", "unit-1", now), "good", 0, now).memory;
  const stats = calculateUnitStats([first], 2, [], now);
  assert.equal(stats.reviewedWords, 1);
  assert.equal(stats.coveragePercent, 50);
  assert.ok(stats.masteryPercent > 0 && stats.masteryPercent <= 50);
});

test("invalid imports do not replace existing memory data", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const repository = new LocalStorageMemoryRepository(storage);
  const memory = createWordMemory("persisted", "unit-1", now);
  await repository.saveWordMemory(memory);
  await assert.rejects(() => repository.importData({ schemaVersion: 99, memories: {} }), /學習資料格式無效/);
  assert.equal((await repository.getWordMemory("persisted"))?.wordId, "persisted");
});
