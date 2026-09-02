import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const wordCard = await readFile(new URL("../app/components/WordCard.tsx", import.meta.url), "utf8");
const reviewPanel = await readFile(new URL("../app/components/ReviewPanel.tsx", import.meta.url), "utf8");
const practicePage = await readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8");
const stylesheet = await readFile(new URL("../app/demo.module.css", import.meta.url), "utf8");
const reviewStylesheet = await readFile(new URL("../app/components/review.module.css", import.meta.url), "utf8");

test("word and example translations use independent hover reveal zones", () => {
  assert.doesNotMatch(wordCard, /styles\.translationReveal(?!Zone)|顯示答案|隱藏答案/u);
  assert.equal((wordCard.match(/translationRevealZone/g) ?? []).length, 2);
  assert.match(stylesheet, /\.translationRevealZone:hover \.translationHidden/u);
  assert.match(stylesheet, /\.translationRevealZone:focus-within \.translationHidden/u);
  assert.doesNotMatch(stylesheet, /\.translationHidden:hover/u);
  assert.doesNotMatch(wordCard, /aria-hidden=\{translationHidden\}/u);
});

test("practice reading stays blurred until hover or touch reveal", () => {
  assert.match(reviewPanel, /className=\{styles\.reviewReading\}/u);
  assert.match(reviewPanel, /onPointerDown=\{\(event\) => \{/u);
  assert.match(reviewPanel, /event\.pointerType !== "mouse"/u);
  assert.match(reviewPanel, /setReadingRevealed\(true\)/u);
  assert.match(reviewPanel, /useState\(false\)/u);
  assert.match(practicePage, /<ReviewPanel\s+key=\{`\$\{activeReviewFormat \?\? reviewFormat\}/u);
  assert.doesNotMatch(reviewPanel, /onFocus(?:Capture)?=|onBlur(?:Capture)?=/u);
  assert.match(reviewStylesheet, /\.reviewReading\s*\{[^}]*filter:\s*blur\(/su);
  assert.match(reviewStylesheet, /\.reviewWord:hover \.reviewReading\s*\{[^}]*filter:\s*blur\(0\)/su);
});

test("practice reading keeps the kanji scale isolated from its nested reading", () => {
  assert.match(reviewStylesheet, /\.reviewWord > span\s*\{[^}]*font-size:\s*clamp\(48px, 9vw, 76px\)/su);
  assert.match(reviewStylesheet, /\.reviewWord small\s*\{[^}]*font-size:\s*14px/su);
  assert.match(reviewStylesheet, /\.reviewWord:hover > span\s*\{/u);
  assert.doesNotMatch(reviewStylesheet, /\.reviewWord span\s*\{/u);
});
