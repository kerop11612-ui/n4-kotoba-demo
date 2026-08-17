import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const wordCard = await readFile(new URL("../app/components/WordCard.tsx", import.meta.url), "utf8");
const stylesheet = await readFile(new URL("../app/demo.module.css", import.meta.url), "utf8");

test("word and example translations use independent hover reveal zones", () => {
  assert.doesNotMatch(wordCard, /styles\.translationReveal(?!Zone)|顯示答案|隱藏答案/u);
  assert.equal((wordCard.match(/translationRevealZone/g) ?? []).length, 2);
  assert.match(stylesheet, /\.translationRevealZone:hover \.translationHidden/u);
  assert.match(stylesheet, /\.translationRevealZone:focus-within \.translationHidden/u);
  assert.doesNotMatch(stylesheet, /\.translationHidden:hover/u);
});
