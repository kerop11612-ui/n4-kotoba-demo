import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatSkillMastery, getPracticeReasonLabels } from "../app/components/learningPresentation.ts";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("learning surfaces expose one local primary action without AI chat wiring", async () => {
  const [home, library, recommendation] = await Promise.all([
    source("app/home/page.tsx"),
    source("app/page.tsx"),
    source("app/components/LearningRecommendationCard.tsx"),
  ]);
  assert.doesNotMatch(home, /AiChat|useAiChat|onAskWhy|AI 助教/);
  assert.doesNotMatch(library, /AiChat|useAiChat|onAskWhy|AI 助教/);
  assert.doesNotMatch(recommendation, /onAskWhy|為什麼推薦/);
  assert.match(home, /開始今日學習|建立今日學習計畫/);
});

test("small navigation and empty-state controls have touch-sized targets", async () => {
  const [homeCss, demoCss, favorites] = await Promise.all([
    source("app/home/home.module.css"),
    source("app/demo.module.css"),
    source("app/favorites/page.tsx"),
  ]);
  assert.match(homeCss, /\.sectionHeading a[^{]*\{[^}]*min-height:\s*44px/s);
  assert.match(demoCss, /\.wordFocusFilterButton[^\{]*\{[^}]*min-height:\s*44px/s);
  assert.match(demoCss, /\.favoriteOpenLink[^\{]*\{[^}]*min-height:\s*44px/s);
  assert.match(favorites, /validFavoriteIds\.size\s*>\s*0\s*&&/);
  assert.match(favorites, /前往單字庫收藏單字/);
  assert.doesNotMatch(favorites, /<Link className=\{styles\.unitMapLink\} href="\/">開始學習<\/Link>/);
});

test("bridge and package no longer expose the chat endpoint", async () => {
  const [server, runtime, client, pkg] = await Promise.all([
    source("scripts/ai-bridge/server.mjs"),
    source("scripts/ai-bridge/runtime.mjs"),
    source("src/ai/local-ai-client.ts"),
    source("package.json"),
  ]);
  assert.doesNotMatch(server, /v1\/chat|chatAdapter|readChatRequest/);
  assert.doesNotMatch(runtime, /chat-adapter|chatAdapter/);
  assert.doesNotMatch(client, /chatJapanese|AiChat/);
  assert.doesNotMatch(pkg, /ai-chat\.test|dev:ai-chat/);
});

test("skill mastery labels distinguish missing, accumulating, and forecast evidence", () => {
  const skillSnapshot = {
    skill: "jp_to_meaning",
    band: "unknown",
    confidence: "low",
    retrievabilityNow: null,
    retrievabilityAtHorizon: null,
    independentAttempts: 0,
    independentSuccesses: 0,
    assistedSuccesses: 0,
    recentIndependentFailures: 0,
    responseTrend: "unknown",
    reasons: [],
  };

  assert.equal(formatSkillMastery(skillSnapshot), "尚未練習");
  assert.equal(formatSkillMastery({ ...skillSnapshot, band: "uncertain", independentAttempts: 1 }), "資料累積中");
  assert.equal(formatSkillMastery({
    ...skillSnapshot,
    band: "likely_familiar",
    confidence: "medium",
    retrievabilityAtHorizon: 0.824,
  }), "82%");
});

test("practice reason labels use actual reasons, deduplicate, and omit missing reasons", () => {
  assert.deepEqual(getPracticeReasonLabels([]), []);
  assert.deepEqual(getPracticeReasonLabels([
    { itemId: "a", wordId: "a", unitId: "u", format: "jp-to-zh", skill: "jp_to_meaning" },
  ]), []);
  assert.deepEqual(getPracticeReasonLabels([
    { itemId: "a", wordId: "a", unitId: "u", format: "jp-to-zh", skill: "jp_to_meaning", reason: "fsrs_due" },
    { itemId: "b", wordId: "b", unitId: "u", format: "zh-to-jp", skill: "meaning_to_jp", reason: "weakness_diagnostic" },
    { itemId: "c", wordId: "c", unitId: "u", format: "cloze", skill: "context_to_word", reason: "weakness_diagnostic" },
  ]), ["已到複習時間", "需要診斷"]);
});

test("WordCard and practice page use real memory guidance data", async () => {
  const [wordCard, practicePage] = await Promise.all([
    source("app/components/WordCard.tsx"),
    source("app/practice/page.tsx"),
  ]);

  assert.match(wordCard, /看懂（日→中）/);
  assert.match(wordCard, /想得出來（中→日）/);
  assert.match(wordCard, /語境運用/);
  assert.doesNotMatch(wordCard, /<strong>資料不足<\/strong>/);
  assert.match(wordCard, /mastery\.receptive/);
  assert.match(wordCard, /mastery\.productive/);
  assert.match(wordCard, /mastery\.contextual/);
  assert.match(practicePage, /安排原因/);
  assert.match(practicePage, /getPracticeReasonLabels\(practiceItems\)/);
  assert.match(practicePage, /reasonLabels\.length\s*>\s*0/);
  assert.match(practicePage, /reasonLabels\.map/);
});

test("mastery disclosure and practice reasons have mobile-safe styles", async () => {
  const [demoCss, practiceCss] = await Promise.all([
    source("app/demo.module.css"),
    source("app/practice/practice.module.css"),
  ]);
  assert.match(demoCss, /\.wordSkillsSummary[^\{]*\{[^}]*min-height:\s*44px/s);
  assert.match(demoCss, /\.wordSkillsSummary:focus-visible/);
  assert.match(demoCss, /\.wordSkillRow[^\{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s);
  assert.match(practiceCss, /\.reasonTag[^\{]*\{[^}]*font-size:\s*12px/s);
});

test("word card keeps secondary metadata quiet on the first read", async () => {
  const [wordCard, demoCss] = await Promise.all([
    source("app/components/WordCard.tsx"),
    source("app/demo.module.css"),
  ]);
  assert.doesNotMatch(wordCard, /<span className=\{styles\.wordMastery\}>/);
  assert.match(wordCard, /className=\{styles\.wordNumber\}/);
  assert.match(wordCard, /aria-label=\{manualMastered \? `取消標記/);
  assert.match(wordCard, /manualMastered \? "已學會" : "標記已學會"/);
  assert.match(demoCss, /@media \(max-width: 440px\)[\s\S]*?\.wordNumber\s*\{[\s\S]*?display:\s*none/s);
  assert.match(demoCss, /\.manualMasteryButton[^\{]*\{[^}]*font-size:\s*11px/s);
});

test("print settings prioritize core choices and collapse advanced display options", async () => {
  const [printPage, printCss] = await Promise.all([
    source("app/print/page.tsx"),
    source("app/print/print.module.css"),
  ]);
  assert.match(printPage, /快速選擇/);
  assert.match(printPage, /進階顯示/);
  assert.match(printPage, /settingsPrimaryAction/);
  assert.match(printCss, /\.settingsGroups[^\{]*\{[^}]*grid-template-columns:\s*1fr\s+1fr/s);
  assert.match(printCss, /\.advancedSettings\s+\.settingsGroup[^\{]*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(printCss, /\.settingsPrimaryAction[^\{]*\{[^}]*min-height:\s*44px/s);
});

test("A4 print layout keeps headings readable and handwriting rows consistent", async () => {
  const printCss = await source("app/print/print.module.css");
  assert.match(printCss, /@page[\s\S]*?size:\s*A4\s+portrait;[\s\S]*?margin:\s*12mm\s+14mm/s);
  assert.match(printCss, /\.sheetHeader h1[^\{]*\{[^}]*font-size:\s*22px/s);
  assert.match(printCss, /\.questionRow[^\{]*\{[^}]*min-height:\s*10mm/s);
  assert.match(printCss, /\.answerLine[^\{]*\{[^}]*height:\s*20px/s);
  assert.match(printCss, /\.answerList li[^\{]*\{[^}]*padding:\s*6px\s+0/s);
});
