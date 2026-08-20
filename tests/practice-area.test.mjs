import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { buildPracticeQueue } from "../src/spaced-repetition/practice-queue.ts";
import {
  PRACTICE_SESSION_KEY,
  readPracticeSession,
  writePracticeSession,
} from "../src/spaced-repetition/practice-session-storage.ts";

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

test("practice session storage round-trips valid sessions and rejects malformed state", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const session = {
    version: 1,
    format: "jp-to-zh",
    wordRefs: [{ wordId: "word", unitId: "n4-1-1" }],
    index: 0,
    results: [],
    retryWordIds: [],
  };
  writePracticeSession(storage, session);
  assert.deepEqual(readPracticeSession(storage), session);

  values.set(PRACTICE_SESSION_KEY, JSON.stringify({ ...session, index: 1 }));
  assert.equal(readPracticeSession(storage), null);
  values.set(PRACTICE_SESSION_KEY, JSON.stringify({
    ...session,
    wordRefs: [{ wordId: "word", unitId: "n4-1-1" }, { wordId: "word", unitId: "n4-2-1" }],
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
