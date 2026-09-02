import test from "node:test";
import assert from "node:assert/strict";
import { selectFocusedPrintWords } from "../src/spaced-repetition/print-recommendation.ts";

function word(id, number) {
  return {
    id,
    number,
    word: `單字${id}`,
    reading: `たんご${id}`,
    meaningZhTw: `意思${id}`,
    example: `例句${id}`,
    exampleZhTw: `例句意思${id}`,
    partOfSpeech: "名詞",
    chapterNumber: 1,
    chapterTitle: "第一章",
    sectionNumber: 1,
    sectionTitle: "第一節",
  };
}

test("focused print recommendation caps the list and prefers learned weak cards", () => {
  const words = Array.from({ length: 12 }, (_, index) => word(String(index + 1), index + 1));
  const now = new Date("2026-08-19T00:00:00.000Z");
  const memories = words.slice(0, 2).map((item) => ({
    wordId: item.id,
    unitId: "1-1",
    skill: "jp_to_meaning",
    reviewCount: 3,
    independentCorrectCount: 1,
    hintedCorrectCount: 0,
    lapseCount: 2,
    againStreak: 0,
    lastHintLevel: 2,
    lastRawRating: "again",
    lastFsrsRating: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    fsrsCard: {
      due: new Date("2026-08-18T00:00:00.000Z").toISOString(),
      stability: 1,
      difficulty: 7,
      state: 2,
      reps: 3,
      lapses: 2,
      scheduled_days: 1,
      elapsed_days: 1,
      last_elapsed_days: 1,
      learning_steps: 0,
      retrievability: 0.2,
      last_review: now.toISOString(),
    },
  }));

  const result = selectFocusedPrintWords(words, memories, now, () => 0.5);

  assert.ok(result.length <= 10);
  assert.deepEqual(result.slice(0, 2).map((item) => item.id), ["1", "2"]);
});

test("focused print recommendation uses weakest established active skill and does not prefer unseen alternate skills", () => {
  const targetWord = word("b-due", 2);
  const otherWord = word("a-unseen", 1);
  const now = new Date("2026-08-19T00:00:00.000Z");

  // targetWord has strong receptive (R=0.95), but weak due productive (R=0.1)
  const receptive = {
    wordId: targetWord.id,
    unitId: "1-1",
    skill: "jp_to_meaning",
    reviewCount: 5,
    independentCorrectCount: 5,
    hintedCorrectCount: 0,
    lapseCount: 0,
    againStreak: 0,
    lastHintLevel: 0,
    lastRawRating: "good",
    lastFsrsRating: 3,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    fsrsCard: {
      due: new Date("2026-08-30T00:00:00.000Z").toISOString(),
      stability: 10,
      difficulty: 3,
      state: 2,
      reps: 5,
      lapses: 0,
      scheduled_days: 10,
      elapsed_days: 1,
      last_elapsed_days: 1,
      learning_steps: 0,
      retrievability: 0.95,
      last_review: now.toISOString(),
    },
  };

  const productive = {
    wordId: targetWord.id,
    unitId: "1-1",
    skill: "meaning_to_jp",
    reviewCount: 3,
    independentCorrectCount: 0,
    hintedCorrectCount: 0,
    lapseCount: 3,
    againStreak: 0,
    lastHintLevel: 0,
    lastRawRating: "again",
    lastFsrsRating: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    fsrsCard: {
      due: new Date("2026-08-18T00:00:00.000Z").toISOString(),
      stability: 0.5,
      difficulty: 8,
      state: 2,
      reps: 3,
      lapses: 3,
      scheduled_days: 1,
      elapsed_days: 1,
      last_elapsed_days: 1,
      learning_steps: 0,
      retrievability: 0.1,
      last_review: new Date("2026-08-17T00:00:00.000Z").toISOString(),
    },
  };

  // otherWord has receptive that is unseen (reviewCount: 0)
  const unseenOther = {
    wordId: otherWord.id,
    unitId: "1-1",
    skill: "jp_to_meaning",
    reviewCount: 0,
    independentCorrectCount: 0,
    hintedCorrectCount: 0,
    lapseCount: 0,
    againStreak: 0,
    lastHintLevel: 0,
    lastRawRating: null,
    lastFsrsRating: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    fsrsCard: {
      due: now.toISOString(),
      stability: 0,
      difficulty: 0,
      state: 0,
      reps: 0,
      lapses: 0,
      scheduled_days: 0,
      elapsed_days: 0,
      last_elapsed_days: 0,
      learning_steps: 0,
      retrievability: 0,
      last_review: undefined,
    },
  };

  const result = selectFocusedPrintWords([otherWord, targetWord], [receptive, productive, unseenOther], now, () => 0.5);
  // targetWord with active weak productive skill should be prioritized over unseen otherWord
  assert.equal(result[0].id, "b-due");
});
