import assert from "node:assert/strict";
import test from "node:test";
import { createClozeSentence, isClozeAnswerCorrect } from "../src/spaced-repetition/cloze.ts";
import { createWordMemory, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { mapHintedRating, mapOutcomeToFsrsRating } from "../src/spaced-repetition/rating-mapper.ts";
import { currentRetrievability } from "../src/spaced-repetition/retrievability.ts";
import { calculateMasteryPercent, calculateMasterySnapshot, getMasteryLabel } from "../src/spaced-repetition/mastery.ts";
import { aggregateLearningAnalysis, buildDeterministicLearningAnalysis, buildLearningAnalysisAgentContext, compactLearningAnalysisInput, createLearningAnalysisCacheKey, parseLearningAnalysisJson, validateLearningAnalysis } from "../src/spaced-repetition/ai-learning-analysis.ts";
import { migrateMemoryData, migrateWordMemoryRecord } from "../src/storage/memory-migration.ts";
import { Rating } from "ts-fsrs";
import { calculateUnitStats } from "../src/spaced-repetition/unit-stats.ts";
import { LocalStorageMemoryRepository } from "../src/storage/memory-repository.ts";

const now = new Date("2026-01-10T12:00:00.000Z");

test("hinted ratings preserve raw UI while lowering FSRS grade", () => {
  assert.equal(mapHintedRating("easy", 0), 4);
  assert.equal(mapHintedRating("good", 0), 3);
  assert.equal(mapHintedRating("easy", 1), 1);
  assert.equal(mapHintedRating("good", 1), 1);
  assert.equal(mapHintedRating("good", 2), 1);
  assert.equal(mapHintedRating("good", 3), 1);
  assert.equal(mapHintedRating("easy", 3), 1);
  assert.equal(mapHintedRating("again", 0), 1);
});

test("outcomes map hinted recall to Again without changing observed correctness", () => {
  assert.equal(mapOutcomeToFsrsRating({ correct: false, usedHint: false, struggled: false }), Rating.Again);
  assert.equal(mapOutcomeToFsrsRating({ correct: true, usedHint: true, struggled: false }), Rating.Again);
  assert.equal(mapOutcomeToFsrsRating({ correct: true, usedHint: false, struggled: true }), Rating.Hard);
  assert.equal(mapOutcomeToFsrsRating({ correct: true, usedHint: false, struggled: false }), Rating.Good);
});

test("revealing the answer keeps observed correctness but FSRS sees retrieval failure", () => {
  const result = reviewWordMemory(createWordMemory("answer-shown", "unit-1", now), "good", 3, now);
  assert.equal(result.history.fsrsRating, 1);
  assert.equal(result.memory.lastFsrsRating, 1);
  assert.equal(result.memory.lapseCount, 1);
  assert.equal(result.memory.hintedCorrectCount, 1);
  assert.equal(result.event.correct, true);
});

test("answer reveals count as hinted recall in unit stats", () => {
  const result = reviewWordMemory(createWordMemory("answer-shown", "unit-1", now), "good", 3, now);
  const stats = calculateUnitStats([result.memory], 1, [result.history], now);
  assert.equal(stats.hintRescueRate, 1);
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

test("cloze hides every visible occurrence of the target", () => {
  const result = createClozeSentence("今度[こんど]のテストと今度[こんど]の予定", ["今度", "こんど"]);
  assert.equal(result.text, "＿＿＿のテストと＿＿＿の予定");
  assert.equal(result.replaced, true);
});

test("cloze answer accepts the word or reading after trimming", () => {
  assert.equal(isClozeAnswerCorrect("  時間 ", "時間", "じかん"), true);
  assert.equal(isClozeAnswerCorrect("じかん", "時間", "じかん"), true);
  assert.equal(isClozeAnswerCorrect("時 間", "時間", "じかん"), false);
  assert.equal(isClozeAnswerCorrect("", "時間", "じかん"), false);
});

test("retrievability is zero before first review and decays with time", () => {
  const fresh = createWordMemory("word-1", "unit-1", now);
  assert.equal(currentRetrievability(fresh, now), 0);
  const reviewed = reviewWordMemory(fresh, "good", 0, now).memory;
  const soon = currentRetrievability(reviewed, new Date("2026-01-10T13:00:00.000Z"));
  const later = currentRetrievability(reviewed, new Date("2026-01-20T13:00:00.000Z"));
  assert.ok(soon > later);
});

test("mastery separates quiz evidence from immediate FSRS retrievability", () => {
  const firstReview = reviewWordMemory(createWordMemory("mastery-1", "unit-1", now), "good", 0, now).memory;
  const snapshot = calculateMasterySnapshot(firstReview, now);
  assert.equal(snapshot.currentRecallPercent, 100);
  assert.ok(snapshot.masteryPercent < snapshot.currentRecallPercent);
  assert.equal(calculateMasteryPercent(firstReview, now), snapshot.masteryPercent);
});

test("hinted recall contributes less mastery than independent recall", () => {
  const independent = reviewWordMemory(createWordMemory("mastery-independent", "unit-1", now), "good", 0, now).memory;
  const hinted = reviewWordMemory(createWordMemory("mastery-hinted", "unit-1", now), "good", 1, now).memory;
  assert.ok(calculateMasteryPercent(independent, now) > calculateMasteryPercent(hinted, now));
});

test("mastery handles invalid horizon and labels insufficient evidence", () => {
  const reviewed = reviewWordMemory(createWordMemory("mastery-edge", "unit-1", now), "good", 0, now).memory;
  const snapshot = calculateMasterySnapshot(reviewed, now, -30);
  assert.equal(snapshot.horizonDays, 0);
  assert.equal(snapshot.masteryPercent, snapshot.currentRecallPercent);
  assert.equal(getMasteryLabel(snapshot.masteryPercent, 1), "資料不足");
});

test("unit mastery includes unreviewed words and separates coverage", () => {
  const first = reviewWordMemory(createWordMemory("a", "unit-1", now), "good", 0, now).memory;
  const stats = calculateUnitStats([first], 2, [], now);
  assert.equal(stats.reviewedWords, 1);
  assert.equal(stats.coveragePercent, 50);
  assert.ok(stats.masteryPercent > 0 && stats.masteryPercent <= 50);
});

test("unit stats expose stable words for the chapter summary", () => {
  const stable = reviewWordMemory(createWordMemory("stable", "unit-1", now), "easy", 0, now).memory;
  const stats = calculateUnitStats([stable], 2, [], now);
  assert.equal(stats.stableWords, 1);
  assert.equal(stats.totalWords, 2);
});

test("review history preserves optional format and answer analysis", () => {
  const result = reviewWordMemory(
    createWordMemory("cloze-history", "unit-1", now),
    "good",
    0,
    now,
    undefined,
    { reviewFormat: "cloze", answerCorrect: true, answerAttempts: 2 },
  );
  assert.equal(result.history.reviewFormat, "cloze");
  assert.equal(result.history.answerCorrect, true);
  assert.equal(result.history.answerAttempts, 2);
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

test("different skills use separate memory records", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const repository = new LocalStorageMemoryRepository(storage);
  await repository.migrate();
  await repository.saveWordMemory(createWordMemory("same-word", "unit-1", now, "jp_to_meaning"));
  await repository.saveWordMemory(createWordMemory("same-word", "unit-1", now, "meaning_to_jp"));
  assert.equal((await repository.getWordMemory("same-word", "jp_to_meaning"))?.skill, "jp_to_meaning");
  assert.equal((await repository.getWordMemory("same-word", "meaning_to_jp"))?.skill, "meaning_to_jp");
});

test("migration adds skill-safe keys and preserves old records", () => {
  const record = createWordMemory("legacy-word", "unit-1", now);
  const migrated = migrateMemoryData({ schemaVersion: 1, memories: { "legacy-word": record }, history: [] }, now);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.memories["legacy-word:jp_to_meaning"].skill, "jp_to_meaning");
  assert.deepEqual(migrated.events, []);
  const normalized = migrateWordMemoryRecord({ wordId: "x", unitId: "u", reviewCount: 2, independentCorrectCount: 99 }, now);
  assert.equal(normalized.independentCorrectCount, 2);
});

test("learning analysis aggregates events and keeps deterministic weak item limits", () => {
  const memory = createWordMemory("分析", "unit-1", now, "jp_to_meaning");
  const result = reviewWordMemory(memory, "good", 0, now, 6000, {
    reviewFormat: "jp-to-zh",
    skill: "jp_to_meaning",
    correct: true,
    recalledWithoutHint: true,
    responseTimeMs: 6000,
    errorTypes: ["slow_recall"],
  });
  const staleMemory = reviewWordMemory(createWordMemory("stale-word", "unit-1", now), "good", 0, now).memory;
  const input = aggregateLearningAnalysis(
    [result.event],
    [result.memory, staleMemory],
    [{ wordId: "分析", word: "分析", reading: "ぶんせき" }],
    "2026-01-01T00:00:00.000Z",
    "2026-01-10T23:59:59.000Z",
    now,
  );
  assert.equal(input.summary.totalReviews, 1);
  assert.equal(input.weakItems.length, 1);
  assert.equal(input.weakItems[0].averageResponseMs, 6000);
  assert.equal(buildDeterministicLearningAnalysis(input).findings[0].type, "insufficient_evidence");
});

test("AI analysis validation rejects FSRS mutation fields and invalid JSON falls back", () => {
  const input = {
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.000Z",
    summary: { totalReviews: 0, uniqueWords: 0, independentRecallRate: 0, hintRate: 0, averageResponseMs: 0, dueReviewCount: 0, newCardCount: 0 },
    weakItems: [],
  };
  const safe = buildDeterministicLearningAnalysis(input);
  assert.equal(validateLearningAnalysis({ ...safe, fsrsCommand: "change_due" }), false);
  assert.deepEqual(parseLearningAnalysisJson("not-json", input), safe);
});

test("AI agent context skips weak evidence and compacts repeated input", () => {
  const input = {
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.000Z",
    summary: { totalReviews: 3, uniqueWords: 10, independentRecallRate: 0.4, hintRate: 0.5, averageResponseMs: 3200, dueReviewCount: 0, newCardCount: 0 },
    weakItems: Array.from({ length: 10 }, (_, index) => ({
      wordId: `word-${index}`,
      word: `word-${index}`,
      skill: "jp_to_meaning",
      currentRecall: 0.4,
      retention30d: 0.2,
      independentAccuracy: 0.4,
      hintRate: 0.5,
      averageResponseMs: 3200,
      reviewCount: 3,
      lapseCount: 1,
      confusedWordIds: ["a", "b", "c", "d"],
      errorTypes: ["meaning", "reading", "kanji", "context"],
    })),
  };
  const compacted = compactLearningAnalysisInput(input);
  assert.equal(compacted.weakItems.length, 8);
  assert.equal(compacted.weakItems[0].confusedWordIds.length, 3);
  assert.equal(compacted.weakItems[0].errorTypes.length, 3);
  const context = buildLearningAnalysisAgentContext(input);
  assert.equal(context.shouldCallAi, true);
  assert.equal(context.cacheKey, createLearningAnalysisCacheKey(compacted));
  assert.equal(buildLearningAnalysisAgentContext({ ...input, summary: { ...input.summary, totalReviews: 1 } }).shouldCallAi, false);
});
