import test from "node:test";
import assert from "node:assert/strict";
import {
  getPrintPageCount,
  selectQuestionWords,
} from "../app/print/print-utils.ts";

const words = Array.from({ length: 34 }, (_, index) => ({ id: `word-${index + 1}` }));

test("selectQuestionWords defaults to twenty and uses all when fewer are available", () => {
  assert.equal(selectQuestionWords(words, 20).length, 20);
  assert.equal(selectQuestionWords(words.slice(0, 8), 20).length, 8);
  assert.equal(selectQuestionWords(words, "all").length, 34);
});

test("getPrintPageCount matches the compact two-column practice page strategy", () => {
  assert.equal(getPrintPageCount({ mode: "practice", direction: "ja-to-zh", wordCount: 20, layout: "two-column", includeAnswerKey: true }), 2);
  assert.equal(getPrintPageCount({ mode: "practice", direction: "both", wordCount: 34, layout: "two-column", includeAnswerKey: true }), 3);
  assert.equal(getPrintPageCount({ mode: "practice", direction: "both", wordCount: 34, layout: "two-column", includeAnswerKey: false }), 2);
});
