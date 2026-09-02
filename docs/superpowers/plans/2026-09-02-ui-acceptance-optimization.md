# UI Acceptance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓單字卡三技能掌握度與練習推薦原因只顯示真實資料，並使新增介面在 390px 手機寬度符合觸控與可及性要求。

**Architecture:** 保留現有 React Client Component 與 FSRS 資料模型，在頁面層計算既有 `VocabularyMastery`，由純呈現函式轉成繁體中文狀態，再交給元件渲染。練習原因直接由現有 `PracticePlanItem.reason` 建立去重標籤；沒有排程原因就不渲染區塊，不在 UI 猜測原因。

**Tech Stack:** Next.js 16.3 App Router、React 19、TypeScript 5.9、CSS Modules、Node.js built-in test runner

**Spec:** `docs/superpowers/specs/2026-09-02-ui-acceptance-optimization-design.md`

## Global Constraints

- 使用繁體中文，結論優先。
- 先讀 `TASK.md`，只檢查與任務直接相關的檔案。
- 採用：檢查 → 最小修改 → 聚焦測試。
- 保留既有 UI、資料格式與功能；不做推測性重構。
- 未明確要求時，不部署、不新增套件、不修改全域設定。
- UI 修改必須在 390px 寬度無水平捲動，互動式觸控目標至少 44px，焦點狀態清楚。
- 修改前完整閱讀 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`、`node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` 與 `node_modules/next/dist/docs/03-architecture/accessibility.md`。
- 不修改 `.worktrees/`、`.next/`、`out/` 或 ESLint 全域設定。

## File Map

- Create: `app/components/learningPresentation.ts` — 三技能狀態與排程原因的純呈現函式。
- Modify: `app/page.tsx` — 建立每個單字的完整 `VocabularyMastery`。
- Modify: `app/components/WordCard.tsx` — 使用完整三技能快照，不再硬編資料不足。
- Modify: `app/demo.module.css` — 掌握度細項的手機優先樣式、44px summary 與焦點狀態。
- Modify: `app/practice/page.tsx` — 只渲染實際 `practiceItems.reason`。
- Modify: `app/practice/practice.module.css` — 推薦原因標籤的可讀性與換行。
- Modify: `tests/ui-contract.test.mjs` — 以純函式行為與必要結構取代固定文字存在測試。
- Modify: `TASK.md` — 記錄真實完成狀態、驗證結果與下一步。

---

### Task 1: 真實三技能掌握度

**Files:**
- Create: `app/components/learningPresentation.ts`
- Modify: `app/page.tsx`
- Modify: `app/components/WordCard.tsx`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Consumes: `calculateVocabularyMastery(wordId, memories, events, now): VocabularyMastery`
- Produces: `formatSkillMastery(snapshot: SkillMasterySnapshot): string`
- Produces: `WordCardProps.mastery: VocabularyMastery`

- [ ] **Step 1: 閱讀專案與 Next.js 規則**

Run:

```powershell
Get-Content -Raw TASK.md
Get-Content -Raw node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
Get-Content -Raw node_modules/next/dist/docs/01-app/01-getting-started/11-css.md
Get-Content -Raw node_modules/next/dist/docs/03-architecture/accessibility.md
```

Expected: 確認本工作維持 Client Component、CSS Modules 與原生可及性語意，不使用已棄用 API。

- [ ] **Step 2: 先寫呈現行為測試**

在 `tests/ui-contract.test.mjs` 匯入 `formatSkillMastery`，以最小 `SkillMasterySnapshot` fixture 驗證三種輸出：

```js
import { formatSkillMastery } from "../app/components/learningPresentation.ts";

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

test("skill mastery labels distinguish missing, accumulating, and forecast evidence", () => {
  assert.equal(formatSkillMastery(skillSnapshot), "尚未練習");
  assert.equal(formatSkillMastery({ ...skillSnapshot, band: "uncertain", independentAttempts: 1 }), "資料累積中");
  assert.equal(formatSkillMastery({
    ...skillSnapshot,
    band: "likely_familiar",
    confidence: "medium",
    retrievabilityAtHorizon: 0.824,
  }), "30 天保持率 82%");
});
```

同一測試檔再以 source assertion 驗證 `WordCard` 不包含兩行固定 `<strong>資料不足</strong>`，並包含 `mastery.receptive`、`mastery.productive`、`mastery.contextual`。

- [ ] **Step 3: 執行測試並確認先失敗**

Run:

```powershell
node --experimental-strip-types --test tests/ui-contract.test.mjs
```

Expected: FAIL，原因是 `app/components/learningPresentation.ts` 尚不存在或未匯出 `formatSkillMastery`。

- [ ] **Step 4: 建立最小呈現函式**

建立 `app/components/learningPresentation.ts`：

```ts
import type { MetaScheduleReason } from "../../src/spaced-repetition/meta-scheduler";
import type { SkillMasterySnapshot } from "../../src/spaced-repetition/skill-mastery";
import type { PracticePlanItem } from "../../src/spaced-repetition/practice-plan";

export function formatSkillMastery(snapshot: SkillMasterySnapshot): string {
  if (snapshot.band === "unknown") return "尚未練習";
  if (snapshot.confidence === "low" || snapshot.retrievabilityAtHorizon === null) return "資料累積中";
  return `30 天保持率 ${Math.round(snapshot.retrievabilityAtHorizon * 100)}%`;
}

const PRACTICE_REASON_LABELS: Record<MetaScheduleReason, string> = {
  fsrs_due: "已到複習時間",
  weakness_diagnostic: "需要診斷",
  unfamiliar_skill: "優先加強",
  cross_skill_diagnostic: "技能表現不一致",
  new_skill: "練習新技能",
  leech_scaffold: "改用提示練習",
};

export function getPracticeReasonLabels(items: readonly PracticePlanItem[]): string[] {
  return [...new Set(items.flatMap((item) => item.reason ? [PRACTICE_REASON_LABELS[item.reason]] : []))];
}
```

本步只建立純函式；Task 2 才接上練習頁。

- [ ] **Step 5: 在頁面層計算完整 mastery**

在 `app/page.tsx` 匯入 `calculateVocabularyMastery`，於 `visibleWords` 建立後加入：

```ts
const vocabularyMasteryByWord = useMemo(
  () => new Map(unitWords.map((word) => [
    word.id,
    calculateVocabularyMastery(word.id, memoryRecords, reviewEvents, statsNow),
  ])),
  [memoryRecords, reviewEvents, statsNow, unitWords],
);
```

渲染 `WordCard` 時增加：

```tsx
mastery={vocabularyMasteryByWord.get(word.id)!}
```

保留原本 `memory={memoryRecords[getMemoryKey(word.id, "jp_to_meaning")]}`，因為手動已學會與主要學習狀態仍依賴它。

- [ ] **Step 6: 讓 WordCard 渲染三個真實快照**

在 `app/components/WordCard.tsx`：

```ts
import { formatSkillMastery } from "./learningPresentation";
import type { VocabularyMastery } from "../../src/spaced-repetition/vocabulary-mastery";
```

將 `mastery: VocabularyMastery` 加入 props，並以固定順序陣列渲染：

```tsx
{[
  ["看懂（日→中）", mastery.receptive],
  ["想得出來（中→日）", mastery.productive],
  ["語境運用", mastery.contextual],
].map(([label, snapshot]) => (
  <div className={styles.wordSkillRow} key={label as string}>
    <span>{label as string}</span>
    <strong>{formatSkillMastery(snapshot as typeof mastery.receptive)}</strong>
  </div>
))}
```

若 TypeScript 對 tuple 推論不穩定，先宣告具名且有明確型別的 `skillRows`，不要保留型別斷言於 JSX。

- [ ] **Step 7: 執行聚焦測試與型別檢查**

Run:

```powershell
node --experimental-strip-types --test tests/ui-contract.test.mjs
npm run check:types
```

Expected: 兩個指令皆 PASS。

- [ ] **Step 8: 提交可獨立審查的變更**

```powershell
git add app/components/learningPresentation.ts app/components/WordCard.tsx app/page.tsx tests/ui-contract.test.mjs
git commit -m "fix: show truthful per-skill mastery"
```

如果執行環境不允許提交，保留變更並在交付報告註明未建立 commit。

---

### Task 2: 真實練習推薦原因

**Files:**
- Modify: `app/practice/page.tsx`
- Modify: `app/components/learningPresentation.ts`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Consumes: `practiceItems: PracticePlanItem[]`（由 `usePracticeSession()` 既有回傳值提供）
- Consumes: `PracticePlanItem.reason?: MetaScheduleReason`
- Produces: `getPracticeReasonLabels(items: readonly PracticePlanItem[]): string[]`

- [ ] **Step 1: 先寫推薦原因行為測試**

在 `tests/ui-contract.test.mjs` 新增：

```js
import { formatSkillMastery, getPracticeReasonLabels } from "../app/components/learningPresentation.ts";

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
```

更新舊的 source assertion：不再要求 `app/practice/page.tsx` 直接包含「需要診斷／改用提示練習」，改為要求 `getPracticeReasonLabels(practiceItems)`、`reasonLabels.length > 0` 與 `reasonLabels.map`。

- [ ] **Step 2: 執行測試並確認頁面合約先失敗**

Run:

```powershell
node --experimental-strip-types --test tests/ui-contract.test.mjs
```

Expected: FAIL，因為練習頁仍使用固定標籤，沒有條件渲染實際原因。

- [ ] **Step 3: 將 practiceItems 接到推薦卡**

在 `app/practice/page.tsx`：

```ts
import { getPracticeReasonLabels } from "../components/learningPresentation";
```

從 `usePracticeSession()` 解構 `practiceItems`，並在 `hasResume` 前建立：

```ts
const reasonLabels = getPracticeReasonLabels(practiceItems);
```

以真實原因取代固定標籤：

```tsx
{reasonLabels.length > 0 && (
  <div className={styles.recommendationReasonBlock} aria-label="安排原因">
    <span className={styles.reasonLabel}>安排原因</span>
    {reasonLabels.map((label) => (
      <span className={styles.reasonTag} key={label}>{label}</span>
    ))}
  </div>
)}
```

不要為沒有 `reason` 的項目推測原因；這種狀態直接隱藏整個區塊。

- [ ] **Step 4: 執行聚焦測試**

Run:

```powershell
node --experimental-strip-types --test tests/ui-contract.test.mjs tests/practice-area.test.mjs
npm run check:types
```

Expected: 所有測試與型別檢查 PASS，既有練習排程順序不變。

- [ ] **Step 5: 提交可獨立審查的變更**

```powershell
git add app/components/learningPresentation.ts app/practice/page.tsx tests/ui-contract.test.mjs
git commit -m "fix: render actual practice reasons"
```

如果執行環境不允許提交，保留變更並在交付報告註明未建立 commit。

---

### Task 3: 手機樣式、可及性與發布前驗證

**Files:**
- Modify: `app/demo.module.css`
- Modify: `app/practice/practice.module.css`
- Modify: `tests/ui-contract.test.mjs`
- Modify: `TASK.md`

**Interfaces:**
- Consumes: `wordSkillsDetails`、`wordSkillsSummary`、`wordSkillsGrid`、`wordSkillRow` class names
- Consumes: `recommendationReasonBlock`、`reasonLabel`、`reasonTag` class names
- Produces: 390px 無水平捲動、summary 至少 44px、清楚的鍵盤焦點與可讀標籤

- [ ] **Step 1: 先補 CSS 合約測試**

在 `tests/ui-contract.test.mjs` 讀取 `app/demo.module.css` 與 `app/practice/practice.module.css`，加入：

```js
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
```

- [ ] **Step 2: 執行測試並確認先失敗**

Run:

```powershell
node --experimental-strip-types --test tests/ui-contract.test.mjs
```

Expected: FAIL，原因是 `wordSkills*` 樣式目前不存在，`.reasonTag` 仍為 11px。

- [ ] **Step 3: 補齊掌握度細項樣式**

在 `app/demo.module.css` 的單字卡區塊新增：

```css
.wordSkillsDetails {
  margin: 0 18px 18px;
  border-top: 1px solid var(--line-soft);
}

.wordSkillsSummary {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  list-style: none;
}

.wordSkillsSummary::-webkit-details-marker { display: none; }
.wordSkillsSummary::after { content: "＋"; color: var(--accent); }
.wordSkillsDetails[open] .wordSkillsSummary::after { content: "－"; }
.wordSkillsSummary:focus-visible {
  border-radius: 6px;
  outline: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.wordSkillsGrid {
  display: grid;
  gap: 0;
  padding: 2px 0 10px;
}

.wordSkillRow {
  min-height: 40px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-top: 1px dashed var(--line-soft);
  color: var(--muted);
  font-size: 13px;
}

.wordSkillRow strong {
  color: var(--ink);
  font-size: 12px;
  text-align: right;
}
```

在既有手機 media query 中，若 390px 實測長文字擠壓，將 `.wordSkillRow` 改為單欄並保留 8px gap；只有實測發生擠壓才加入。

- [ ] **Step 4: 提高推薦標籤可讀性**

在 `app/practice/practice.module.css` 將 `.reasonTag` 調整為：

```css
.reasonTag {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line, #d9d0c4);
  border-radius: 999px;
  padding: 3px 10px;
  background: var(--surface-raised, #f9f7f2);
  color: var(--ink, #17212b);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
}
```

標籤是資訊文字而非控制元件，因此不強制 44px；互動式 `<summary>`、按鈕與連結仍須至少 44px。

- [ ] **Step 5: 執行程式層驗證**

Run:

```powershell
node --experimental-strip-types --test tests/ui-contract.test.mjs tests/practice-area.test.mjs
npm run check:types
npm run lint:app
npm test
npm run build
```

Expected: 全部 PASS。不要把 `npm run check` 的 `.worktrees/**/.next` 與 `.worktrees/**/out` 既有 lint 問題誤判為本次 UI 回歸，也不要在本計劃內修改全域 ESLint ignore。

- [ ] **Step 6: 進行 390×844 瀏覽器驗收**

啟動或沿用 `npm run dev`，在首頁與 `/practice` 逐項確認：

```text
首頁：document.documentElement.scrollWidth <= window.innerWidth
練習頁：document.documentElement.scrollWidth <= window.innerWidth
掌握度 summary：getBoundingClientRect().height >= 44
展開後：三項技能皆有標籤與由快照產生的值
鍵盤 Tab：summary、主要按鈕與自訂練習控制均有清楚焦點
空 reason：安排原因區塊不存在
有 reason：只顯示實際原因，重複原因只顯示一次
```

截取首頁掌握度展開狀態與練習推薦卡各一張畫面供審查。

- [ ] **Step 7: 更新 TASK.md**

將「固定標籤」改成「依 `PracticePlanItem.reason` 條件顯示」，並記錄：

```markdown
- 三技能掌握度已連接 `VocabularyMastery` 真實快照。
- 練習原因只由實際排程 reason 產生，無 reason 時不顯示。
- 390×844 無水平捲動，掌握度 summary 高度至少 44px。
- 驗證：check:types、lint:app、npm test、build 全數通過。
- 已知工具問題：npm run check 仍會掃描 .worktrees 產物，本次未修改全域 lint 設定。
```

- [ ] **Step 8: 提交最終樣式與驗證紀錄**

```powershell
git add app/demo.module.css app/practice/practice.module.css tests/ui-contract.test.mjs TASK.md
git commit -m "fix: polish mastery and practice guidance UI"
```

如果執行環境不允許提交，保留變更並在交付報告列出所有修改檔案與完整驗證結果。

---

## Final Review Checklist

- [ ] `WordCard` 不再把 productive/contextual 寫死為「資料不足」。
- [ ] 百分比只在有 30 天預測且信心度至少 medium 時顯示。
- [ ] 練習頁沒有固定假原因，且未推測缺失的 `reason`。
- [ ] `wordSkills*` 四個 CSS Module class 均有定義。
- [ ] 390×844 無水平捲動，所有互動式控制至少 44px。
- [ ] 沒有新增依賴、改資料格式、改 FSRS 演算法或修改全域設定。
- [ ] 聚焦測試、型別、app/src lint、完整測試與 build 均通過。

