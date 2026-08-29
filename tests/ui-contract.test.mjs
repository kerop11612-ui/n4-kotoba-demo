import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
