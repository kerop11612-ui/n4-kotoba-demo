import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createWordMemory, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { buildPracticeQueue } from "../src/spaced-repetition/practice-queue.ts";
import { buildPracticePlan, makePracticeItemId } from "../src/spaced-repetition/practice-plan.ts";
import { isNeedsPractice, setManualMastery } from "../src/spaced-repetition/mastery.ts";
import {
  PRACTICE_SESSION_KEY,
  readPracticeSession,
  writePracticeSession,
} from "../src/spaced-repetition/practice-session-storage.ts";
import { buildMetaSchedule } from "../src/spaced-repetition/meta-scheduler.ts";
import { transitionLeechState } from "../src/spaced-repetition/leech-state.ts";

test("needs-practice predicate uses all review signals but excludes unseen and deferred manual mastery", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const unseen = createWordMemory("unseen", "n4-1-1", now);
  assert.equal(isNeedsPractice(unseen, now), false);

  const learned = reviewWordMemory(createWordMemory("learned", "n4-1-1", now), "good", 0, now).memory;
  learned.fsrsCard.due = "2026-09-01T00:00:00Z";
  assert.equal(isNeedsPractice(learned, now), false);

  assert.equal(isNeedsPractice({ ...learned, fsrsCard: { ...learned.fsrsCard, due: "2026-08-19T00:00:00Z" } }, now), true);
  assert.equal(isNeedsPractice({ ...learned, lastRawRating: "again" }, now), true);
  assert.equal(isNeedsPractice({ ...learned, lastHintLevel: 1 }, now), true);
  assert.equal(isNeedsPractice({ ...learned, againStreak: 1 }, now), true);
  assert.equal(isNeedsPractice({ ...learned, fsrsCard: { ...learned.fsrsCard, stability: 0.1, last_review: "2026-01-01T00:00:00Z" } }, now), true);

  const deferred = setManualMastery(learned, true, now);
  assert.equal(isNeedsPractice(deferred, now), false);
  assert.equal(isNeedsPractice(deferred, new Date("2026-09-03T00:00:00Z")), true);
});

test("needs-practice predicate rejects invalid dates and non-finite review counts", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const learned = reviewWordMemory(createWordMemory("malformed", "n4-1-1", now), "good", 0, now).memory;
  learned.fsrsCard.due = "2026-09-01T00:00:00Z";

  assert.equal(isNeedsPractice(learned, new Date("invalid")), false);
  assert.equal(isNeedsPractice({ ...learned, reviewCount: Number.NaN }, now), false);
  assert.equal(isNeedsPractice({ ...learned, reviewCount: Number.POSITIVE_INFINITY }, now), false);
});

test("practice queue rejects an invalid current date", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const learned = reviewWordMemory(createWordMemory("invalid-queue-date", "n4-1-1", now), "good", 0, now).memory;
  learned.fsrsCard.due = "2026-09-01T00:00:00Z";

  assert.deepEqual(buildPracticeQueue([learned], "jp-to-zh", new Date("invalid")), []);
});

test("recommended queue keeps the primary when only an alternate skill is manually deferred", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const primary = createWordMemory("per-skill-manual", "n4-1-1", now, "jp_to_meaning");
  primary.reviewCount = 1;
  primary.fsrsCard.due = "2026-08-19T00:00:00Z";
  const alternate = setManualMastery(
    reviewWordMemory(createWordMemory("per-skill-manual", "n4-1-1", now, "meaning_to_jp"), "good", 0, now).memory,
    true,
    now,
  );

  const queue = buildPracticeQueue(
    [primary, alternate],
    "jp-to-zh",
    now,
    () => 0.5,
    [],
    true,
  );

  assert.deepEqual(queue.map((item) => item.wordId), ["per-skill-manual"]);
});

test("primary manual mastery still excludes the word from the practice queue", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const primary = setManualMastery(
    reviewWordMemory(createWordMemory("primary-manual", "n4-1-1", now), "good", 0, now).memory,
    true,
    now,
  );
  const alternate = reviewWordMemory(
    createWordMemory("primary-manual", "n4-1-1", now, "meaning_to_jp"),
    "again",
    0,
    now,
  ).memory;

  assert.deepEqual(buildPracticeQueue([primary, alternate], "jp-to-zh", now, () => 0.5, [], true), []);
  assert.deepEqual(buildPracticeQueue([primary], "zh-to-jp", now, () => 0.5), []);
});

test("custom practice skips a deferred record for the requested skill", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const primary = reviewWordMemory(createWordMemory("custom-deferred", "n4-1-1", now), "good", 0, now).memory;
  const alternate = setManualMastery(
    reviewWordMemory(createWordMemory("custom-deferred", "n4-1-1", now, "meaning_to_jp"), "good", 0, now).memory,
    true,
    now,
  );

  assert.deepEqual(buildPracticeQueue([primary, alternate], "zh-to-jp", now, () => 0.5), []);
});

test("practice queue spans units, excludes unseen words, and prioritizes due words", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const due = createWordMemory("due", "n4-2-1", now);
  due.reviewCount = 2;
  due.fsrsCard.due = "2026-08-19T00:00:00Z";
  const learned = createWordMemory("learned", "n4-1-1", now);
  learned.reviewCount = 1;
  learned.fsrsCard.due = "2026-09-01T00:00:00Z";
  const unseen = createWordMemory("unseen", "n4-3-1", now);
  const queue = buildPracticeQueue([learned, unseen, due], "jp-to-zh", now, () => 0.5);
  assert.deepEqual(queue.map(item => item.wordId), ["due", "learned"]);
  assert.deepEqual(new Set(queue.map(item => item.unitId)), new Set(["n4-1-1", "n4-2-1"]));
});

test("alternate formats use learned primary records for initial priority", () => {
  const primary = createWordMemory("word", "n4-1-1", new Date(), "jp_to_meaning");
  primary.reviewCount = 3;
  assert.equal(buildPracticeQueue([primary], "zh-to-jp").length, 1);
});

test("adaptive practice keeps focused order and chooses an eligible weak skill", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const primary = createWordMemory("word", "n4-1-1", now, "jp_to_meaning");
  primary.reviewCount = 3;
  primary.fsrsCard.due = "2026-08-19T00:00:00Z";
  const productive = createWordMemory("word", "n4-1-1", now, "meaning_to_jp");
  productive.reviewCount = 1;
  productive.fsrsCard.stability = 0.2;

  const plan = buildPracticePlan(
    [primary, productive],
    [{ wordId: "word", unitId: "n4-1-1", clozeEligible: true }],
    "recommended",
    now,
    () => 0.5,
  );

  assert.equal(plan[0].format, "zh-to-jp");
  assert.equal(plan[0].skill, "meaning_to_jp");
  assert.equal(plan[0].itemId, makePracticeItemId("word", "zh-to-jp"));
});

test("recommended practice promotes a weak established alternate skill into the candidate queue", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const weakPrimaryMemories = Array.from({ length: 11 }, (_, index) => {
    const memory = createWordMemory(`weak-${index}`, "n4-1-1", now, "jp_to_meaning");
    memory.reviewCount = 1;
    memory.fsrsCard.due = "2026-09-01T00:00:00Z";
    memory.fsrsCard.last_review = "2026-07-01T00:00:00Z";
    memory.fsrsCard.stability = 1;
    return memory;
  });
  const primary = reviewWordMemory(createWordMemory("alternate-weak", "n4-1-1", now), "good", 0, now).memory;
  primary.fsrsCard.due = "2026-12-01T00:00:00Z";
  primary.fsrsCard.stability = 100;
  const alternate = reviewWordMemory(
    createWordMemory("alternate-weak", "n4-1-1", now, "meaning_to_jp"),
    "again",
    0,
    now,
  ).memory;
  alternate.fsrsCard.due = "2026-08-19T00:00:00Z";

  const words = [
    ...weakPrimaryMemories,
    primary,
  ].map((memory) => ({ wordId: memory.wordId, unitId: memory.unitId, clozeEligible: false }));
  const plan = buildPracticePlan(
    [...weakPrimaryMemories, primary, alternate],
    words,
    "recommended",
    now,
    () => 0.5,
  );

  assert.equal(plan[0].wordId, "alternate-weak");
  assert.equal(plan[0].format, "zh-to-jp");
  assert.equal(plan[0].skill, "meaning_to_jp");
});

test("recommended practice considers a non-due alternate with low retrievability", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const primary = reviewWordMemory(createWordMemory("non-due-weak", "n4-1-1", now), "good", 0, now).memory;
  primary.fsrsCard.due = "2026-12-01T00:00:00Z";
  primary.fsrsCard.stability = 100;
  const alternate = reviewWordMemory(
    createWordMemory("non-due-weak", "n4-1-1", new Date("2026-07-01T00:00:00Z"), "meaning_to_jp"),
    "good",
    0,
    new Date("2026-07-01T00:00:00Z"),
  ).memory;
  alternate.fsrsCard.due = "2026-09-01T00:00:00Z";
  alternate.fsrsCard.last_review = "2026-07-01T00:00:00Z";
  alternate.fsrsCard.stability = 0.2;

  const plan = buildPracticePlan(
    [primary, alternate],
    [{ wordId: "non-due-weak", unitId: "n4-1-1", clozeEligible: false }],
    "recommended",
    now,
    () => 0.5,
  );

  assert.equal(plan[0].wordId, "non-due-weak");
  assert.equal(plan[0].format, "zh-to-jp");
});

test("recommended plan ignores deferred and malformed alternate format records", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const weakPrimaries = Array.from({ length: 6 }, (_, index) => {
    const reviewedAt = new Date("2026-07-01T00:00:00Z");
    const memory = reviewWordMemory(createWordMemory(`format-filter-weak-${index}`, "n4-1-1", reviewedAt), "good", 0, reviewedAt).memory;
    memory.fsrsCard.due = "2026-09-01T00:00:00Z";
    memory.fsrsCard.last_review = "2026-07-01T00:00:00Z";
    memory.fsrsCard.stability = 0.2;
    return memory;
  });
  const primary = reviewWordMemory(createWordMemory("format-filter", "n4-1-1", now), "good", 0, now).memory;
  primary.fsrsCard.due = "2026-12-01T00:00:00Z";
  primary.fsrsCard.stability = 100;
  const deferredAlternate = setManualMastery(
    reviewWordMemory(createWordMemory("format-filter", "n4-1-1", new Date("2026-07-01T00:00:00Z"), "meaning_to_jp"), "good", 0, new Date("2026-07-01T00:00:00Z")).memory,
    true,
    now,
  );
  deferredAlternate.fsrsCard.due = "2026-09-01T00:00:00Z";
  deferredAlternate.fsrsCard.last_review = "2026-07-01T00:00:00Z";
  deferredAlternate.fsrsCard.stability = 0.2;
  const malformedAlternate = {
    ...deferredAlternate,
    skill: "context_to_word",
    manualMastered: false,
    manualMasteredAt: null,
    manualNextReviewAt: null,
    reviewCount: Number.POSITIVE_INFINITY,
  };
  const otherStable = reviewWordMemory(createWordMemory("format-filter-other", "n4-1-1", now), "good", 0, now).memory;
  otherStable.fsrsCard.due = "2026-12-01T00:00:00Z";
  otherStable.fsrsCard.last_review = "2026-07-01T00:00:00Z";
  otherStable.fsrsCard.stability = 100;

  const plan = buildPracticePlan(
    [...weakPrimaries, primary, deferredAlternate, malformedAlternate, otherStable],
    [
      ...weakPrimaries,
      primary,
      otherStable,
    ].map((memory) => ({ wordId: memory.wordId, unitId: memory.unitId, clozeEligible: memory.wordId === "format-filter" })),
    "recommended",
    now,
    () => 0.5,
  );

  assert.equal(plan.find((item) => item.wordId === "format-filter")?.format, "jp-to-zh");
});

test("adaptive practice never selects cloze for an ineligible example", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const primary = createWordMemory("word", "n4-1-1", now, "jp_to_meaning");
  primary.reviewCount = 2;
  const plan = buildPracticePlan(
    [primary],
    [{ wordId: "word", unitId: "n4-1-1", clozeEligible: false }],
    "cloze",
    now,
    () => 0.5,
  );
  assert.equal(plan[0].format, "zh-to-jp");
  assert.equal(plan[0].skill, "meaning_to_jp");
});

test("custom practice preserves the requested format while recommended plans use primary refs", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const memories = ["a", "b"].map((wordId) => {
    const memory = createWordMemory(wordId, "n4-1-1", now, "jp_to_meaning");
    memory.reviewCount = 1;
    return memory;
  });
  const plan = buildPracticePlan(memories, [
    { wordId: "a", unitId: "n4-1-1", clozeEligible: true },
    { wordId: "b", unitId: "n4-1-1", clozeEligible: true },
  ], "cloze", now, () => 0.5);
  assert.ok(plan.every((item) => item.format === "cloze"));
  assert.ok(plan.every((item) => item.itemId === makePracticeItemId(item.wordId, item.format)));
});

test("adaptive practice caps untrained alternate skills at thirty percent", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const memories = Array.from({ length: 10 }, (_, index) => {
    const memory = createWordMemory(`word-${index}`, "n4-1-1", now, "jp_to_meaning");
    memory.reviewCount = 1;
    return memory;
  });
  const words = memories.map((memory) => ({ wordId: memory.wordId, unitId: memory.unitId, clozeEligible: true }));
  const plan = buildPracticePlan(memories, words, "recommended", now, () => 0.5);
  assert.ok(plan.filter((item) => item.format !== "jp-to-zh").length <= Math.ceil(plan.length * 0.3));
  assert.ok(plan.every((item, index) => index < 2 || item.format !== plan[index - 1].format || item.format !== plan[index - 2].format));
});

test("practice session storage round-trips valid sessions and rejects malformed state", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const session = {
    version: 2,
    mode: "jp-to-zh",
    items: [{ itemId: "word::jp-to-zh", wordId: "word", unitId: "n4-1-1", format: "jp-to-zh", skill: "jp_to_meaning" }],
    index: 0,
    results: [],
    retryItemIds: [],
  };
  writePracticeSession(storage, session);
  assert.deepEqual(readPracticeSession(storage), session);

  const legacy = {
    version: 1,
    format: "jp-to-zh",
    wordRefs: [{ wordId: "word", unitId: "n4-1-1" }],
    index: 0,
    results: [],
    retryWordIds: [],
  };
  values.set(PRACTICE_SESSION_KEY, JSON.stringify(legacy));
  assert.deepEqual(readPracticeSession(storage), session);
  values.set(PRACTICE_SESSION_KEY, JSON.stringify({ ...session, index: 1 }));
  assert.equal(readPracticeSession(storage), null);
  values.set(PRACTICE_SESSION_KEY, JSON.stringify({
    ...session,
    retryItemIds: ["missing::jp-to-zh"],
  }));
  assert.equal(readPracticeSession(storage), null);
});

test("practice is a primary route and home starts there", async () => {
  const nav = await readFile(new URL("../app/components/AppNav.tsx", import.meta.url), "utf8");
  const home = await readFile(new URL("../app/home/page.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8");
  assert.match(nav, /href: "\/practice"/);
  assert.match(home, /href="\/practice"/);
  assert.match(page, /今日推薦/);
  assert.match(page, /SyncAccountCard/);
});

test("practice hooks switch active format per item and use composite retry completion", async () => {
  const practiceHook = await readFile(new URL("../app/hooks/usePracticeSession.ts", import.meta.url), "utf8");
  const reviewHook = await readFile(new URL("../app/hooks/useReviewSession.ts", import.meta.url), "utf8");
  assert.match(practiceHook, /const primaryQueueRefs/);
  assert.match(practiceHook, /createClozeSentence/);
  assert.match(reviewHook, /const activeReviewFormat/);
  assert.match(reviewHook, /schedulePracticeRetry\(practiceItems/);
  assert.match(reviewHook, /if \(reviewIndex >= reviewWords\.length - 1 && !retryScheduled\)/);
});

test("buildMetaSchedule returns one due item from one due and nine stable cards without filler", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const dueMemory = createWordMemory("due-word", "unit-1", now, "jp_to_meaning");
  dueMemory.reviewCount = 3;
  dueMemory.fsrsCard.due = new Date("2026-08-19T00:00:00Z").toISOString();
  dueMemory.fsrsCard.stability = 2;
  dueMemory.fsrsCard.difficulty = 5;

  const stableMemories = Array.from({ length: 9 }, (_, i) => {
    const mem = createWordMemory(`stable-${i}`, "unit-1", now, "jp_to_meaning");
    mem.reviewCount = 5;
    mem.fsrsCard.due = new Date("2026-09-01T00:00:00Z").toISOString();
    mem.fsrsCard.stability = 30;
    mem.fsrsCard.difficulty = 3;
    return mem;
  });

  const candidates = buildMetaSchedule({
    memories: [dueMemory, ...stableMemories],
    masteries: [],
    attempts: [],
    limit: 10,
    now,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].wordId, "due-word");
  assert.equal(candidates[0].reason, "fsrs_due");
});

test("buildMetaSchedule prioritizes due before diagnostic and diagnostic before new skill", () => {
  const now = new Date("2026-08-20T00:00:00Z");

  // 1. Due card
  const dueMemory = createWordMemory("due-card", "unit-1", now, "jp_to_meaning");
  dueMemory.reviewCount = 2;
  dueMemory.fsrsCard.due = new Date("2026-08-19T00:00:00Z").toISOString();
  dueMemory.fsrsCard.stability = 1;

  // 2. Diagnostic card (vulnerable due to weaknessRisk)
  const diagMemory = createWordMemory("diag-card", "unit-1", now, "meaning_to_jp");
  diagMemory.reviewCount = 3;
  diagMemory.fsrsCard.due = new Date("2026-08-25T00:00:00Z").toISOString();
  diagMemory.fsrsCard.stability = 5;
  const diagMastery = {
    wordId: "diag-card",
    receptive: { skill: "jp_to_meaning", band: "likely_familiar", confidence: "medium", retrievabilityNow: 0.9, retrievabilityAtHorizon: 0.8, independentAttempts: 3, independentSuccesses: 3, assistedSuccesses: 0, recentIndependentFailures: 0, responseTrend: "stable", reasons: [] },
    productive: { skill: "meaning_to_jp", band: "uncertain", confidence: "medium", retrievabilityNow: 0.7, retrievabilityAtHorizon: 0.5, independentAttempts: 3, independentSuccesses: 1, assistedSuccesses: 0, recentIndependentFailures: 1, responseTrend: "slower", reasons: [] },
    contextual: { skill: "context_to_word", band: "unknown", confidence: "low", retrievabilityNow: null, retrievabilityAtHorizon: null, independentAttempts: 0, independentSuccesses: 0, assistedSuccesses: 0, recentIndependentFailures: 0, responseTrend: "unknown", reasons: [] },
    crossSkillDisagreement: false,
    unfamiliarityBand: "uncertain",
    weaknessRisk: "high",
    confidence: "medium",
    reasons: ["productive 保持率預測明顯下降"],
  };

  // 3. New skill acquisition card
  const newSkillMemory = createWordMemory("new-skill-card", "unit-1", now, "jp_to_meaning");
  newSkillMemory.reviewCount = 5;
  newSkillMemory.fsrsCard.due = new Date("2026-08-30T00:00:00Z").toISOString();
  newSkillMemory.fsrsCard.stability = 20;
  const newSkillMastery = {
    wordId: "new-skill-card",
    receptive: { skill: "jp_to_meaning", band: "likely_familiar", confidence: "high", retrievabilityNow: 0.95, retrievabilityAtHorizon: 0.85, independentAttempts: 5, independentSuccesses: 5, assistedSuccesses: 0, recentIndependentFailures: 0, responseTrend: "stable", reasons: [] },
    productive: { skill: "meaning_to_jp", band: "unknown", confidence: "low", retrievabilityNow: null, retrievabilityAtHorizon: null, independentAttempts: 0, independentSuccesses: 0, assistedSuccesses: 0, recentIndependentFailures: 0, responseTrend: "unknown", reasons: [] },
    contextual: { skill: "context_to_word", band: "unknown", confidence: "low", retrievabilityNow: null, retrievabilityAtHorizon: null, independentAttempts: 0, independentSuccesses: 0, assistedSuccesses: 0, recentIndependentFailures: 0, responseTrend: "unknown", reasons: [] },
    crossSkillDisagreement: false,
    unfamiliarityBand: "likely_familiar",
    weaknessRisk: "low",
    confidence: "high",
    reasons: [],
  };

  const schedule = buildMetaSchedule({
    memories: [newSkillMemory, diagMemory, dueMemory],
    masteries: [diagMastery, newSkillMastery],
    attempts: [],
    limit: 10,
    now,
  });

  assert.equal(schedule.length, 3);
  assert.equal(schedule[0].wordId, "due-card");
  assert.equal(schedule[0].reason, "fsrs_due");
  assert.equal(schedule[1].wordId, "diag-card");
  assert.equal(schedule[1].reason, "weakness_diagnostic");
  assert.equal(schedule[2].wordId, "new-skill-card");
  assert.equal(schedule[2].reason, "new_skill");
});

test("transitionLeechState correctly identifies cross-session struggling, cross-day leech, and recovery", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  // Case 1: 3 Again events in the SAME session do NOT become a leech
  const sameSessionAttempts = [
    { id: "e1", wordId: "w1", unitId: "u1", skill: "jp_to_meaning", reviewedAt: "2026-08-20T10:00:00Z", correct: false, recalledWithoutHint: true, hintLevel: 0, responseMs: 1500, errorTypes: [], predictedRecallBeforeReview: 0.5, fsrsRating: 1, reviewCountBefore: 1, sessionId: "sess-1" },
    { id: "e2", wordId: "w1", unitId: "u1", skill: "jp_to_meaning", reviewedAt: "2026-08-20T10:05:00Z", correct: false, recalledWithoutHint: true, hintLevel: 0, responseMs: 1500, errorTypes: [], predictedRecallBeforeReview: 0.5, fsrsRating: 1, reviewCountBefore: 2, sessionId: "sess-1" },
    { id: "e3", wordId: "w1", unitId: "u1", skill: "jp_to_meaning", reviewedAt: "2026-08-20T10:10:00Z", correct: false, recalledWithoutHint: true, hintLevel: 0, responseMs: 1500, errorTypes: [], predictedRecallBeforeReview: 0.5, fsrsRating: 1, reviewCountBefore: 3, sessionId: "sess-1" },
  ];
  const snapshot1 = transitionLeechState(undefined, sameSessionAttempts, now);
  assert.notEqual(snapshot1.state, "leech");

  // Case 2: Failures across sessions enter struggling
  const multiSessionAttempts = [
    ...sameSessionAttempts,
    { id: "e4", wordId: "w1", unitId: "u1", skill: "jp_to_meaning", reviewedAt: "2026-08-20T15:00:00Z", correct: false, recalledWithoutHint: true, hintLevel: 0, responseMs: 1500, errorTypes: [], predictedRecallBeforeReview: 0.5, fsrsRating: 1, reviewCountBefore: 4, sessionId: "sess-2" },
  ];
  const snapshot2 = transitionLeechState(snapshot1, multiSessionAttempts, now);
  assert.equal(snapshot2.state, "struggling");

  // Case 3: Failures across days enter leech
  const crossDayAttempts = [
    ...multiSessionAttempts,
    { id: "e5", wordId: "w1", unitId: "u1", skill: "jp_to_meaning", reviewedAt: "2026-08-21T10:00:00Z", correct: false, recalledWithoutHint: true, hintLevel: 0, responseMs: 1500, errorTypes: [], predictedRecallBeforeReview: 0.5, fsrsRating: 1, reviewCountBefore: 5, sessionId: "sess-3" },
  ];
  const snapshot3 = transitionLeechState(snapshot2, crossDayAttempts, new Date("2026-08-21T12:00:00Z"));
  assert.equal(snapshot3.state, "leech");

  // Case 4: Scaffold intervention moves to scaffolded
  const scaffoldAttempts = [
    ...crossDayAttempts,
    { id: "e6", wordId: "w1", unitId: "u1", skill: "jp_to_meaning", reviewedAt: "2026-08-21T10:05:00Z", correct: true, recalledWithoutHint: false, hintLevel: 2, usedHint: true, responseMs: 2000, errorTypes: [], predictedRecallBeforeReview: 0.5, fsrsRating: null, reviewCountBefore: 5, attemptKind: "scaffold", sessionId: "sess-3" },
  ];
  const snapshot4 = transitionLeechState(snapshot3, scaffoldAttempts, new Date("2026-08-21T12:00:00Z"));
  assert.equal(snapshot4.state, "scaffolded");

  // Case 5: Independent diagnostic after scaffold moves to recovering
  const recoveringAttempts = [
    ...scaffoldAttempts,
    { id: "e7", wordId: "w1", unitId: "u1", skill: "jp_to_meaning", reviewedAt: "2026-08-21T10:15:00Z", correct: true, recalledWithoutHint: true, hintLevel: 0, usedHint: false, responseMs: 1200, errorTypes: [], predictedRecallBeforeReview: 0.6, fsrsRating: 3, reviewCountBefore: 6, attemptKind: "diagnostic", sessionId: "sess-3" },
  ];
  const snapshot5 = transitionLeechState(snapshot4, recoveringAttempts, new Date("2026-08-21T12:00:00Z"));
  assert.equal(snapshot5.state, "recovering");

  // Case 6: Later spaced success moves to mastered
  const masteredAttempts = [
    ...recoveringAttempts,
    { id: "e8", wordId: "w1", unitId: "u1", skill: "jp_to_meaning", reviewedAt: "2026-08-23T10:00:00Z", correct: true, recalledWithoutHint: true, hintLevel: 0, usedHint: false, responseMs: 1000, errorTypes: [], predictedRecallBeforeReview: 0.8, fsrsRating: 3, reviewCountBefore: 7, attemptKind: "scheduled", sessionId: "sess-4" },
  ];
  const snapshot6 = transitionLeechState(snapshot5, masteredAttempts, new Date("2026-08-23T12:00:00Z"));
  assert.equal(snapshot6.state, "mastered");
});
