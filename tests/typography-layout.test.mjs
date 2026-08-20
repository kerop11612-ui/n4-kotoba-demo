import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [globals, demoStyles, homeStyles] = await Promise.all([
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/demo.module.css", import.meta.url), "utf8"),
  readFile(new URL("../app/home/home.module.css", import.meta.url), "utf8"),
]);

test("學習介面使用清晰的日文無襯線字體與閱讀尺寸", () => {
  assert.match(globals, /--font-jp:\s*"Noto Sans JP"/);
  assert.match(globals, /--text-body:\s*16px/);
  assert.match(globals, /--leading-body:\s*1\.6/);
  assert.match(demoStyles, /\.exampleJapanese\s*\{[\s\S]*?font-size:\s*17px;/);
  assert.match(demoStyles, /\.exampleTranslation\s*\{[\s\S]*?font-size:\s*16px;/);
});

test("個人學習桌面統計維持平衡的三欄配置", () => {
  assert.match(homeStyles, /\.stats\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*1fr\)/);
});
