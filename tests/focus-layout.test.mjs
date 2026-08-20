import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const toolbar = await readFile(new URL("../app/components/LearningToolbar.tsx", import.meta.url), "utf8");
const masterySummary = await readFile(new URL("../app/components/MasterySummary.tsx", import.meta.url), "utf8");
const stylesheet = await readFile(new URL("../app/demo.module.css", import.meta.url), "utf8");
const aiFabStyles = await readFile(new URL("../app/components/AiChatFab.module.css", import.meta.url), "utf8");
const nav = await readFile(new URL("../app/components/AppNav.tsx", import.meta.url), "utf8");
const wordCard = await readFile(new URL("../app/components/WordCard.tsx", import.meta.url), "utf8");
const audioPlayer = await readFile(new URL("../app/components/AudioPlayer.tsx", import.meta.url), "utf8");

test("learning toolbar puts one primary study action before secondary controls", () => {
  assert.ok(toolbar.indexOf("reviewStartButton") < toolbar.indexOf("searchField"));
  assert.ok(page.indexOf("<LearningRecommendationCard") < page.indexOf("<LearningToolbar"));
  assert.match(toolbar, /更多設定/u);
  assert.match(toolbar, /aria-label="學習設定與工具"/u);

  const panelStart = toolbar.indexOf("showDisplaySettings &&");
  assert.ok(panelStart >= 0);
  assert.ok(toolbar.indexOf("exportButton", panelStart) > panelStart);
  assert.ok(toolbar.indexOf("reviewModeField", panelStart) > panelStart);
});

test("mastery statistics use progressive disclosure", () => {
  assert.match(masterySummary, /<details/u);
  assert.match(masterySummary, /<summary/u);
  assert.match(masterySummary, /masteryDetailGrid/u);
});

test("focus layout reduces desktop card density and hides AI distraction during review", () => {
  assert.match(stylesheet, /\.cardGrid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/u);
  assert.match(page, /\{!reviewing && !aiChat\.isOpen && <AiChatFab/u);
  assert.match(page, /open=\{aiChat\.isOpen && !reviewing\}/u);
  assert.match(stylesheet, /\.partOfSpeech\s*\{[^}]*font-size:\s*11px/u);
  assert.match(stylesheet, /\.exampleTranslation\s*\{[^}]*font-size:\s*16px/u);
  assert.match(aiFabStyles, /@media \(max-width: 767px\)[\s\S]*?\.fab\s*\{[^}]*display:\s*none/u);
});

test("personal study entry and manual mastery controls remain visible", () => {
  assert.match(nav, /href: "\/home", key: "home", label: "個人學習"/u);
  assert.match(wordCard, /manualMasteryButton/u);
  assert.match(wordCard, /標記已學會/u);
  assert.match(wordCard, /aria-pressed=\{manualMastered\}/u);
});

test("example cards keep a stable preview without an expansion control", () => {
  assert.doesNotMatch(wordCard, /isExampleLong|isExampleExpanded|onToggleExample|exampleMore/u);
  assert.doesNotMatch(page, /expandedExamples|toggleExample|isExampleExpanded/u);
  assert.doesNotMatch(stylesheet, /\.exampleExpanded|\.exampleMore/u);
  assert.match(stylesheet, /\.exampleBlock\s*\{[\s\S]*?height:\s*168px/u);
  assert.match(stylesheet, /\.exampleJapanese\s*\{[\s\S]*?-webkit-line-clamp:\s*2/u);
  assert.match(stylesheet, /\.exampleTranslation\s*\{[\s\S]*?-webkit-line-clamp:\s*1/u);
});

test("audio player keeps controls compact, explicit, and touch friendly", () => {
  assert.match(audioPlayer, /第 \$\{audioIndex \+ 1\} \/ \$\{audioLength\} 項/u);
  assert.match(audioPlayer, /結束播放/u);
  assert.match(audioPlayer, /<span>重複<\/span>/u);
  assert.match(stylesheet, /\.playerButton\s*\{[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/u);
  assert.match(stylesheet, /\.playerMainButton\s*\{[\s\S]*?width:\s*52px[\s\S]*?height:\s*52px/u);
  assert.match(stylesheet, /\.playerStop\s*\{[\s\S]*?min-height:\s*44px/u);
  assert.match(stylesheet, /\.settingSegments button\s*\{[\s\S]*?min-height:\s*44px/u);
  assert.match(stylesheet, /\.settingsRate select\s*\{[\s\S]*?min-height:\s*44px/u);
  assert.match(stylesheet, /\.playerProgressMeta\s*\{[\s\S]*?font-size:\s*12px/u);
  assert.match(stylesheet, /@media \(max-width: 920px\) and \(min-width: 441px\)[\s\S]*?\.playerProgressWrap\s*\{[\s\S]*?grid-column:\s*1 \/ 3/u);
});
