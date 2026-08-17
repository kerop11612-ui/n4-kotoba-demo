import assert from "node:assert/strict";
import test from "node:test";
import { createClozeSentence, isClozeAnswerCorrect } from "../src/spaced-repetition/cloze.ts";
import { createWordMemory, isSerializedCard, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { mapHintedRating, mapOutcomeToFsrsRating } from "../src/spaced-repetition/rating-mapper.ts";
import { currentRetrievability } from "../src/spaced-repetition/retrievability.ts";
import { calculateMasteryPercent, calculateMasterySnapshot, getMasteryLabel } from "../src/spaced-repetition/mastery.ts";
import { aggregateLearningAnalysis, buildDeterministicLearningAnalysis, buildLearningAnalysisAgentContext, compactLearningAnalysisInput, createLearningAnalysisCacheKey, parseLearningAnalysisJson, validateLearningAnalysis, validateLearningAnalysisForContext } from "../src/spaced-repetition/ai-learning-analysis.ts";
import { migrateMemoryData, migrateWordMemoryRecord } from "../src/storage/memory-migration.ts";
import { Rating } from "ts-fsrs";
import { calculateUnitStats, filterUnitEvidence } from "../src/spaced-repetition/unit-stats.ts";
import { LocalStorageMemoryRepository } from "../src/storage/memory-repository.ts";
import { createMemoryRepository } from "../src/storage/repository-factory.ts";
import { buildHomeRecommendation, buildStudyDashboard, buildStudyOverview, buildUnitRecommendation, estimateReviewMinutes, resolveReviewShortcut } from "../src/spaced-repetition/study-session.ts";

const now = new Date("2026-01-10T12:00:00.000Z");

test("review estimate stays practical for empty and short sessions", () => {
  assert.equal(estimateReviewMinutes(0), 0);
  assert.equal(estimateReviewMinutes(1), 1);
  assert.equal(estimateReviewMinutes(20), 5);
  assert.equal(estimateReviewMinutes(-3), 0);
});

test("review shortcuts reveal, hint, and rate only when allowed", () => {
  assert.equal(resolveReviewShortcut("Space", { reviewFormat: "jp-to-zh", answerVisible: false }), "reveal");
  assert.equal(resolveReviewShortcut("Space", { reviewFormat: "cloze", answerVisible: false }), null);
  assert.equal(resolveReviewShortcut("KeyH", { reviewFormat: "jp-to-zh", answerVisible: false }), "hint");
  assert.equal(resolveReviewShortcut("KeyH", { reviewFormat: "zh-to-jp", answerVisible: false }), null);
  assert.equal(resolveReviewShortcut("Digit1", { reviewFormat: "jp-to-zh", answerVisible: false }), null);
  assert.equal(resolveReviewShortcut("Digit1", { reviewFormat: "jp-to-zh", answerVisible: true }), "again");
  assert.equal(resolveReviewShortcut("Numpad4", { reviewFormat: "zh-to-jp", answerVisible: true }), "easy");
});

test("study dashboard deduplicates reviewed words and estimates a focused queue", () => {
  const due = createWordMemory("due", "n4-1-1", now);
  due.reviewCount = 2;
  due.fsrsCard.due = "2026-01-09T12:00:00.000Z";

  const weak = createWordMemory("weak", "n4-1-1", now);
  weak.reviewCount = 3;
  weak.lapseCount = 2;
  weak.fsrsCard.due = "2026-01-20T12:00:00.000Z";

  const dashboard = buildStudyDashboard([due, weak, { ...weak, skill: "meaning_to_jp" }], 20, now);
  assert.deepEqual(dashboard, {
    reviewedWords: 2,
    dueToday: 1,
    weakWords: 1,
    suggestedNewWords: 5,
    estimatedMinutes: 2,
  });
});

test("study overview calculates chapter progress and recommends the earliest reviewed unit", () => {
  const reviewed = createWordMemory("overview-1", "n4-1-1", now);
  reviewed.reviewCount = 1;
  reviewed.fsrsCard.due = "2026-01-09T12:00:00.000Z";

  const otherSkill = createWordMemory("overview-1", "n4-1-1", now, "meaning_to_jp");
  otherSkill.reviewCount = 3;
  const overview = buildStudyOverview(
    [reviewed, otherSkill],
    [{ id: "overview-1", chapterNumber: 1 }, { id: "overview-2", chapterNumber: 1 }],
    [{ number: 1, words: 2, sections: [] }],
    now,
  );

  assert.deepEqual(overview.chapterProgress, { 1: 50 });
  assert.equal(overview.dashboard.reviewedWords, 1);
  assert.deepEqual(overview.recommendedUnit, { chapter: 1, section: 1 });
});

test("home recommendation prioritizes due review and overload protection", () => {
  const base = { reviewedWords: 4, dueToday: 2, weakWords: 1, suggestedNewWords: 5, estimatedMinutes: 2 };
  assert.equal(buildHomeRecommendation({ dashboard: base, chapterProgress: {}, recommendedUnit: null }).action, "due_review");
  assert.equal(buildHomeRecommendation({ dashboard: { ...base, dueToday: 101 }, chapterProgress: {}, recommendedUnit: null }).action, "reduce_new_cards");
});

test("unit recommendation exposes evidence confidence and a runnable action", () => {
  const stats = {
    masteryPercent: 40,
    currentRecallPercent: 35,
    independentRecallRatePercent: 50,
    hintDependencyPercent: 40,
    reviewCount: 6,
    horizonDays: 30,
    coveragePercent: 60,
    reviewedWords: 6,
    totalWords: 10,
    stableWords: 1,
    reviewRecommendedWords: 2,
    priorityReviewWords: 3,
    dueToday: 1,
    overdue: 1,
    independentRecallRate: 0.5,
    hintRescueRate: 0.4,
  };
  const recommendation = buildUnitRecommendation({ stats });
  assert.equal(recommendation.action, "weak_practice");
  assert.equal(recommendation.confidencePercent, 100);
  assert.match(recommendation.evidenceLabel, /3/);
  assert.equal(buildUnitRecommendation({ stats: { ...stats, reviewCount: 1, priorityReviewWords: 0, dueToday: 0 } }).confidencePercent, null);
});

test("repository factory exposes the same storage contract with an injected backend", async () => {
  const values = new Map();
  const repository = createMemoryRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  const memory = createWordMemory("factory", "unit-1", now);

  await repository.saveWordMemory(memory);

  assert.equal((await repository.getWordMemory("factory"))?.wordId, "factory");
});

test("repository reset clears current and legacy local storage keys", async () => {
  const values = new Map([
    ["jlpt-apkg-progress-v2", JSON.stringify({ legacy: { dueAt: "2026-01-01T00:00:00.000Z" } })],
  ]);
  const repository = createMemoryRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });

  await repository.migrate();
  await repository.reset();

  assert.equal(values.has("jlpt-spaced-repetition-memory-v1"), false);
  assert.equal(values.has("jlpt-apkg-progress-v2"), false);
  assert.deepEqual(await repository.exportData(), { schemaVersion: 2, memories: {}, history: [], events: [] });
});

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

test("retrying the same unsaved review reuses a stable logical review id", () => {
  const memory = createWordMemory("retry-review", "unit-1", now);
  const first = reviewWordMemory(memory, "good", 0, now);
  const retry = reviewWordMemory(memory, "good", 0, new Date(now.getTime() + 500));

  assert.equal(first.history.id, retry.history.id);
  assert.equal(first.event.id, retry.event.id);
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

test("hint dependency measures hinted share of successful recalls", () => {
  const memory = createWordMemory("hint-dependency", "unit-1", now);
  memory.reviewCount = 4;
  memory.independentCorrectCount = 1;
  memory.hintedCorrectCount = 1;

  assert.equal(calculateMasterySnapshot(memory, now).hintDependencyPercent, 50);
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

test("review commit persists memory, history, and event in one write", async () => {
  const values = new Map();
  let writes = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1;
      values.set(key, value);
    },
  };
  const repository = new LocalStorageMemoryRepository(storage);
  const result = reviewWordMemory(createWordMemory("atomic", "unit-1", now), "good", 0, now);

  await repository.commitReview(result.memory, result.history, result.event);

  assert.equal(writes, 1);
  assert.equal((await repository.getWordMemory("atomic"))?.reviewCount, 1);
  assert.equal((await repository.getReviewHistory("unit-1")).length, 1);
  assert.equal((await repository.getReviewEvents("unit-1")).length, 1);
});

test("concurrent repository instances merge commits instead of losing earlier reviews", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const firstRepository = new LocalStorageMemoryRepository(storage);
  const secondRepository = new LocalStorageMemoryRepository(storage);
  await firstRepository.migrate();
  await secondRepository.migrate();

  const first = reviewWordMemory(createWordMemory("first-tab", "unit-1", now), "good", 0, now);
  const second = reviewWordMemory(createWordMemory("second-tab", "unit-1", now), "good", 0, new Date(now.getTime() + 1));
  await firstRepository.commitReview(first.memory, first.history, first.event);
  await secondRepository.commitReview(second.memory, second.history, second.event);

  const reader = new LocalStorageMemoryRepository(storage);
  await reader.migrate();
  assert.equal((await reader.getReviewHistory("unit-1")).length, 2);
  assert.equal((await reader.getReviewEvents("unit-1")).length, 2);
  assert.equal((await reader.getWordMemory("first-tab"))?.reviewCount, 1);
  assert.equal((await reader.getWordMemory("second-tab"))?.reviewCount, 1);
});

test("failed review commit does not mutate repository data", async () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
  const repository = new LocalStorageMemoryRepository(storage);
  const result = reviewWordMemory(createWordMemory("atomic-failure", "unit-1", now), "good", 0, now);

  await assert.rejects(
    () => repository.commitReview(result.memory, result.history, result.event),
    /quota exceeded/,
  );
  assert.equal(await repository.getWordMemory("atomic-failure"), null);
  assert.deepEqual(await repository.getReviewHistory("unit-1"), []);
  assert.deepEqual(await repository.getReviewEvents("unit-1"), []);
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

test("future memory schema versions are rejected instead of treated as legacy", () => {
  assert.throws(
    () => migrateMemoryData({ schemaVersion: 99, memories: {} }),
    /不支援的學習資料版本/,
  );
});

test("serialized FSRS cards require the complete safe runtime shape", () => {
  const valid = createWordMemory("validated-card", "unit-1", now).fsrsCard;
  assert.equal(isSerializedCard(valid), true);
  assert.equal(isSerializedCard({ ...valid, reps: undefined }), false);
  assert.equal(isSerializedCard({ ...valid, state: 99 }), false);
  assert.equal(isSerializedCard({ ...valid, lapses: -1 }), false);
  assert.equal(isSerializedCard({ ...valid, learning_steps: 0.5 }), false);
  assert.equal(isSerializedCard({ ...valid, due: "not-a-date" }), false);
});

test("unit stats deduplicate multiple skills for the same word", () => {
  const jpToMeaning = createWordMemory("same-word-stats", "unit-1", now, "jp_to_meaning");
  const meaningToJp = createWordMemory("same-word-stats", "unit-1", now, "meaning_to_jp");
  jpToMeaning.reviewCount = 1;
  meaningToJp.reviewCount = 1;

  const stats = calculateUnitStats([jpToMeaning, meaningToJp], 1, [], now, []);

  assert.equal(stats.reviewedWords, 1);
  assert.equal(stats.coveragePercent, 100);
});

test("unit stats keep a reviewed skill when an unreviewed skill appears first", () => {
  const unreviewed = createWordMemory("mixed-skill-word", "unit-1", now, "jp_to_meaning");
  const reviewed = createWordMemory("mixed-skill-word", "unit-1", now, "context_to_word");
  const reviewedResult = reviewWordMemory(reviewed, "again", 0, now);

  const stats = calculateUnitStats([unreviewed, reviewedResult.memory], 1, [], now, []);

  assert.equal(stats.reviewedWords, 1);
  assert.equal(stats.reviewCount, 1);
  assert.equal(stats.coveragePercent, 100);
});

test("unit evidence keeps every review skill for selected words", () => {
  const selected = { wordId: "selected", skill: "context_to_word" };
  const other = { wordId: "other", skill: "jp_to_meaning" };

  assert.deepEqual(filterUnitEvidence([selected, other], new Set(["selected"])), [selected]);
});

test("legacy no-hint correct events still count toward independent recall rate", () => {
  const memory = createWordMemory("legacy-no-hint", "unit-1", now);
  const result = reviewWordMemory(memory, "good", 0, now);
  const legacyEvent = { ...result.event };
  delete legacyEvent.recalledWithoutHint;

  const stats = calculateUnitStats([result.memory], 1, [], now, [legacyEvent]);

  assert.equal(stats.independentRecallRatePercent, 100);
});

test("independent recall rate includes incorrect no-hint attempts in its denominator", () => {
  const correct = reviewWordMemory(createWordMemory("independent-correct", "unit-1", now), "good", 0, now);
  const incorrect = reviewWordMemory(createWordMemory("independent-incorrect", "unit-1", now), "again", 0, now);

  const stats = calculateUnitStats(
    [correct.memory, incorrect.memory],
    2,
    [],
    now,
    [correct.event, incorrect.event],
  );

  assert.equal(stats.independentRecallRatePercent, 50);
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

test("AI analysis validation enforces nested schema and raw response limits", () => {
  const input = {
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.000Z",
    summary: { totalReviews: 0, uniqueWords: 0, independentRecallRate: 0, hintRate: 0, averageResponseMs: 0, dueReviewCount: 0, newCardCount: 0 },
    weakItems: [],
  };
  const valid = {
    overallStatus: "warning",
    findings: [{
      type: "weak_retention",
      wordIds: ["word-1"],
      reason: "保持率偏低",
      evidence: ["30 天保持率 40%"],
      confidence: 0.8,
    }],
    recommendedActions: [{
      action: "contrast_quiz",
      wordIds: ["word-1"],
      priority: 0.8,
      questionCount: 3,
      reason: "安排對比練習",
    }],
  };

  assert.equal(validateLearningAnalysis(valid), true);
  assert.equal(validateLearningAnalysis({ ...valid, findings: [{ ...valid.findings[0], wordIds: ["1", "2", "3", "4"] }] }), false);
  assert.equal(validateLearningAnalysis({ ...valid, findings: [{ ...valid.findings[0], reason: "x".repeat(121) }] }), false);
  assert.equal(validateLearningAnalysis({ ...valid, findings: [{ ...valid.findings[0], evidence: ["1", "2", "3", "4"] }] }), false);
  assert.equal(validateLearningAnalysis({ ...valid, recommendedActions: [{ ...valid.recommendedActions[0], reason: "x".repeat(121) }] }), false);

  const oversizedButOtherwiseValid = `${" ".repeat(50_001)}${JSON.stringify(valid)}`;
  assert.deepEqual(parseLearningAnalysisJson(oversizedButOtherwiseValid, input), buildDeterministicLearningAnalysis(input));
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
  assert.equal(compacted.weakItems.length, 5);
  assert.equal(compacted.weakItems[0].confusedWordIds.length, 3);
  assert.equal(compacted.weakItems[0].errorTypes.length, 3);
  const context = buildLearningAnalysisAgentContext(input);
  assert.equal(context.shouldCallAi, true);
  assert.equal(context.cacheKey, createLearningAnalysisCacheKey(compacted));
  assert.equal(buildLearningAnalysisAgentContext({ ...input, summary: { ...input.summary, totalReviews: 1 } }).shouldCallAi, false);
});

test("context-aware validation rejects unknown ids, empty text, contradictions, and FSRS mutations", () => {
  const input = {
    periodStart: "2026-08-09T00:00:00.000Z",
    periodEnd: "2026-08-11T23:59:59.000Z",
    summary: { totalReviews: 3, uniqueWords: 1, independentRecallRate: 0.4, hintRate: 0.5, averageResponseMs: 3200, dueReviewCount: 0, newCardCount: 0 },
    weakItems: [{
      wordId: "word-0",
      word: "word-0",
      skill: "jp_to_meaning",
      currentRecall: 0.4,
      retention30d: 0.2,
      independentAccuracy: 0.4,
      hintRate: 0.5,
      averageResponseMs: 3200,
      reviewCount: 3,
      lapseCount: 1,
      confusedWordIds: [],
      errorTypes: ["meaning"],
    }],
  };
  const valid = {
    overallStatus: "warning",
    findings: [{
      type: "weak_retention",
      wordIds: ["word-0"],
      reason: "保持率偏低",
      evidence: ["30 天保持率 20%"],
      confidence: 0.8,
    }],
    recommendedActions: [{
      action: "contrast_quiz",
      wordIds: ["word-0"],
      priority: 0.8,
      questionCount: 3,
      reason: "安排對比練習",
    }],
  };

  assert.equal(validateLearningAnalysisForContext(valid, input), true);
  assert.equal(validateLearningAnalysisForContext({ ...valid, findings: [{ ...valid.findings[0], wordIds: ["unknown"] }] }, input), false);
  assert.equal(validateLearningAnalysisForContext({ ...valid, findings: [{ ...valid.findings[0], reason: "" }] }, input), false);
  assert.equal(validateLearningAnalysisForContext({ ...valid, overallStatus: "overloaded" }, input), false);
  assert.equal(validateLearningAnalysisForContext({ ...valid, due: "2026-09-01T00:00:00.000Z" }, input), false);
});
