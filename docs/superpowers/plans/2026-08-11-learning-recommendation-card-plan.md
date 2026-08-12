# Learning Recommendation Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首頁與單元頁顯示 deterministic-first 的單一學習建議卡，並用既有複習流程執行主要行動。

**Architecture:** 將 recommendation view model 與排序規則放在純函式，React hook 只組合目前頁面的 memory、event 與 vocabulary。共用 `LearningRecommendationCard` 負責呈現來源、證據、信心與兩個可及性操作；首頁與單元頁各自提供 action callback，不新增聊天抽屜或 FSRS 邏輯。

**Tech Stack:** Next.js 16.3 App Router、React 19、TypeScript 5.9、CSS Modules、Node test runner、既有 `MemoryRepository` 與 `useReviewSession`。

## Global Constraints

- 維持 `output: "export"`、local-first storage、既有 FSRS 與 vocabulary data format。
- 首頁與單元頁各顯示一張卡；AI 未連線時立即顯示 deterministic recommendation。
- 建議 action 只能建立既有 review flow，不修改 FSRS 欄位或排程。
- 證據不足時不呼叫 AI，`confidencePercent` 為 `null`，並顯示可執行的資料累積入口。
- 所有操作控制至少 44px；390px 與 768px 不得水平捲動；focus ring 必須清楚。
- 本輪不做聊天抽屜、不新增套件、不部署、不修改全域設定。

## File Map

- Modify `src/spaced-repetition/study-session.ts`: recommendation view model 與純函式 priority rules。
- Create `app/hooks/useLearningRecommendation.ts`: home/unit data composition and memoization。
- Create `app/components/LearningRecommendationCard.tsx`: accessible shared card。
- Modify `app/home/page.tsx`, `app/home/home.module.css`: home recommendation integration。
- Modify `app/page.tsx`, `app/demo.module.css`: unit recommendation integration。
- Modify `app/hooks/useReviewSession.ts`: expose a focused-review starter that accepts existing word IDs and keeps the selected format。
- Modify `tests/spaced-repetition.test.mjs`: recommendation priority and focused-review contract tests。

---

### Task 1: 建立 recommendation view model 與 pure builders

**Files:**
- Modify: `src/spaced-repetition/study-session.ts`
- Create: `app/hooks/useLearningRecommendation.ts`
- Modify: `tests/spaced-repetition.test.mjs`

**Interfaces:**
- Produces `LearningRecommendationViewModel`。
- Produces `buildHomeRecommendation(overview)` and `buildUnitRecommendation(input, weakPlan)`。
- Hook returns `{ recommendation, source, generatedAt, weakPlan }`。

- [ ] **Step 1: 寫 failing priority tests**

```js
assert.equal(buildHomeRecommendation({ dashboard: { dueToday: 2, weakWords: 1, suggestedNewWords: 5, estimatedMinutes: 2, reviewedWords: 4 } }).action, "due_review");
assert.equal(buildHomeRecommendation({ dashboard: { dueToday: 101, weakWords: 1, suggestedNewWords: 5, estimatedMinutes: 30, reviewedWords: 4 } }).action, "reduce_new_cards");
assert.equal(buildUnitRecommendation(weakInput, weakPlan).action, "weak_practice");
assert.equal(buildUnitRecommendation(insufficientInput, { items: [], evidenceCount: 1 }).confidencePercent, null);
```

- [ ] **Step 2: 執行 RED**

Run: `node --experimental-strip-types --test --test-name-pattern="recommendation" tests/spaced-repetition.test.mjs`

Expected: FAIL，因為 view model builders 尚未存在。

- [ ] **Step 3: 實作純函式與 hook**

使用以下固定 view model：

```ts
export type LearningRecommendationViewModel = {
  title: string;
  reason: string;
  action: "weak_practice" | "due_review" | "reduce_new_cards" | "learn_new" | "gather_evidence";
  evidenceLabel: string;
  confidencePercent: number | null;
};
```

首頁 priority 為 `due_review` → `reduce_new_cards` → `weak_practice` → `learn_new`；單元頁 priority 為有足夠 evidence 的 weak practice → due review → learn new → gather evidence。hook 必須以 `useMemo` 建立目前頁面的 deterministic result，不等待 `useAiCoach` 才產生卡片。

- [ ] **Step 4: 執行 focused tests**

Run: `node --experimental-strip-types --test --test-name-pattern="recommendation" tests/spaced-repetition.test.mjs`

Expected: PASS。

### Task 2: 建立共用可及性建議卡

**Files:**
- Create: `app/components/LearningRecommendationCard.tsx`
- Modify: `app/demo.module.css`
- Modify: `app/home/home.module.css`

**Interfaces:**
- Consumes `LearningRecommendationViewModel`、`sourceLabel`、`generatedAt`、`onStart`、optional `onAskWhy`。

- [ ] **Step 1: 先建立元件 contract 與 type check 失敗點**

元件必須 render `article` with `aria-labelledby`, source badge, title, reason, evidence, confidence, generated time, primary action and secondary `為什麼推薦？` button。

- [ ] **Step 2: 實作 mobile-first CSS**

390px 預設單欄、按鈕上下排列；768px 以上文字區與操作區可左右排列。沿用既有 `--surface`、`--line`、`--accent`、`--muted` tokens；不使用 emoji 作圖示、不依賴 hover；所有按鈕 `min-height: 44px`。

- [ ] **Step 3: 執行 type/lint**

Run: `npm run check:types && npm run lint:app -- --quiet`

Expected: PASS。

### Task 3: 接到首頁與單元頁並驗證互動

**Files:**
- Modify: `app/home/page.tsx`
- Modify: `app/page.tsx`
- Modify: `app/hooks/useReviewSession.ts`
- Modify: `tests/spaced-repetition.test.mjs`
- Modify: `TASK.md`

- [ ] **Step 1: 寫 focused review starter test**

驗證 `startFocusedReview(wordIds)` 只接受目前 vocabulary 可用的 IDs，設定 `reviewMode` 為 unit、保留既有 `reviewFormat`，並通過原有 `reviewWordMemory`／`commitReview` 流程。

- [ ] **Step 2: 實作並接線**

首頁使用 `buildHomeRecommendation(overview)`，主要 action 導向既有 `studyHref`；單元頁使用目前 `memoryRecords`、`reviewEvents` 與 `unitWords` 建立 recommendation，`weak_practice` 呼叫 `startFocusedReview(weakPlan.items.map(item => item.wordId))`，`due_review` 呼叫既有 `toggleReview`。`onAskWhy` 本輪只顯示非阻塞訊息「聊天抽屜將於下一輪加入」。

- [ ] **Step 3: 執行完整驗證**

Run: `npm run verify`

Expected: all tests, lint, TypeScript and static build PASS。

Run manual checks at 390px and 768px: both pages show one card, Tab reaches both actions, primary action starts existing review flow, no horizontal scroll, bridge stopped does not block study.

- [ ] **Step 4: 更新 TASK.md**

記錄首頁／單元頁 recommendation card 已完成，下一步保留為聊天抽屜與真正 Codex App Server integration；不得宣稱聊天已完成。
