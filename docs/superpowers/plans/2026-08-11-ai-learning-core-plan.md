# AI Learning Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a zero-token 3-day learning analysis, one actionable recommendation, and a five-question mixed-format weak-word session on the existing unit and home pages.

**Architecture:** Keep all selection and scheduling deterministic in `src/spaced-repetition`. Add a focused queue contract that the existing review hook can execute without letting AI mutate FSRS. Render one reusable recommendation card; the AI adapter remains optional and local-only in this phase.

**Tech Stack:** Next.js 16.3 App Router static export, React 19.2, TypeScript 5.9, ts-fsrs 5.4, Node test runner, CSS Modules.

## Global Constraints

- Read the relevant Next.js 16 guide in `node_modules/next/dist/docs/` before editing App Router code.
- Preserve `output: "export"`, existing vocabulary JSON, FSRS behavior, local-first storage, and current UI.
- Analyze exactly the latest 3 calendar days; never use lifetime review count as period evidence.
- Send at most 5 weak items; produce at most 3 findings and 1 primary action.
- Weak practice contains 5 items by default and remains fully deterministic.
- All touch targets are at least 44px; verify 390px and 768px without horizontal scrolling.
- Do not add packages, deploy, or modify global configuration.

---

## File Map

- Modify `src/spaced-repetition/ai-learning-analysis.ts`: 3-day aggregation, reduced limits, semantic validation.
- Create `src/spaced-repetition/weak-practice.ts`: focused mixed-format queue builder.
- Modify `src/spaced-repetition/study-session.ts`: shared recommendation view model.
- Modify `app/hooks/useReviewSession.ts`: execute per-item formats and delayed retry.
- Create `app/hooks/useLearningRecommendation.ts`: compute local unit recommendation.
- Create `app/components/LearningRecommendationCard.tsx`: reusable card.
- Modify `app/page.tsx`, `app/home/page.tsx`, `app/demo.module.css`, `app/home/home.module.css`: integrate UI.
- Modify `tests/spaced-repetition.test.mjs`: pure behavior coverage.

### Task 1: Correct the 3-day analysis contract

**Files:**
- Modify: `src/spaced-repetition/ai-learning-analysis.ts:26-451`
- Test: `tests/spaced-repetition.test.mjs`

**Interfaces:**
- Produces: `buildAnalysisPeriod(now: Date, days?: number): { periodStart: string; periodEnd: string }`
- Produces: `validateLearningAnalysisForContext(value: unknown, input: LearningAnalysisInput): value is LearningAnalysis`
- Preserves: `aggregateLearningAnalysis`, `buildLearningAnalysisAgentContext`, `parseLearningAnalysisJson`

- [ ] **Step 1: Write failing period-evidence and output-limit tests**

```js
test("learning analysis uses period review count instead of lifetime count", () => {
  const input = aggregateLearningAnalysis([recentEvent], [memoryWith30Reviews], vocabulary, start, end, now);
  assert.equal(input.weakItems[0].periodReviewCount, 1);
  assert.equal(input.weakItems[0].lifetimeReviewCount, 30);
  assert.equal(detectLearningSignals(input)[0].type, "insufficient_evidence");
});

test("context validation rejects unknown word ids and more than one action", () => {
  assert.equal(validateLearningAnalysisForContext(analysisWithUnknownId, input), false);
  assert.equal(validateLearningAnalysisForContext(analysisWithTwoActions, input), false);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- --test-name-pattern="period review count|context validation"`  
Expected: FAIL because the new fields and validator do not exist.

- [ ] **Step 3: Split period and lifetime evidence and reduce limits**

```ts
export interface WeakLearningItem {
  // Keep the existing identity and signal fields, but replace `reviewCount`.
  periodReviewCount: number;
  lifetimeReviewCount: number;
}

export const AI_AGENT_POLICY = {
  minimumReviews: 3,
  maxWeakItems: 5,
  maxConfusedWordIds: 3,
  maxErrorTypes: 3,
} satisfies LearningAnalysisAgentPolicy;
```

Use `eventsForMemory.length` for `periodReviewCount`; use `memory?.reviewCount ?? periodReviewCount` for lifetime display only. Change all evidence gates and confidence calculations to `periodReviewCount`. Limit validation to 3 findings and 1 action.

- [ ] **Step 4: Add context-aware semantic validation**

```ts
export function validateLearningAnalysisForContext(
  value: unknown,
  input: LearningAnalysisInput,
): value is LearningAnalysis {
  if (!validateLearningAnalysis(value)) return false;
  const allowed = new Set(input.weakItems.flatMap((item) => [item.wordId, ...item.confusedWordIds]));
  return [...value.findings, ...value.recommendedActions].every((item) =>
    item.wordIds.every((id) => id.length > 0 && allowed.has(id)),
  );
}
```

Also reject empty reason/evidence strings and status contradictions. Make `parseLearningAnalysisJson` call the context-aware validator.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --test-name-pattern="learning analysis|AI analysis|AI agent"`  
Expected: all focused tests PASS.

```powershell
git add src/spaced-repetition/ai-learning-analysis.ts tests/spaced-repetition.test.mjs
git commit -m "fix: use recent evidence for learning analysis"
```

### Task 2: Build the deterministic weak-practice plan

**Files:**
- Create: `src/spaced-repetition/weak-practice.ts`
- Test: `tests/spaced-repetition.test.mjs`

**Interfaces:**
- Consumes: `LearningAnalysisInput`, `ReviewFormat`
- Produces: `WeakPracticeItem`, `WeakPracticePlan`, `buildWeakPracticePlan(input, unitWordIds, limit?)`

- [ ] **Step 1: Write failing selection tests**

```js
test("weak practice chooses five unit words with mixed formats", () => {
  const plan = buildWeakPracticePlan(input, new Set(input.weakItems.map((item) => item.wordId)));
  assert.equal(plan.items.length, 5);
  assert.deepEqual(new Set(plan.items.map((item) => item.format)), new Set(["jp-to-zh", "zh-to-jp", "cloze"]));
});
```

Add cases for excluding out-of-unit IDs, stable tie-breaking, fewer than five candidates, and no mutation of input.

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test -- --test-name-pattern="weak practice"`  
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the queue builder**

```ts
export type WeakPracticeItem = {
  queueId: string;
  wordId: string;
  format: ReviewFormat;
  reason: LearningFindingType;
  retryOf?: string;
};

export type WeakPracticePlan = {
  items: WeakPracticeItem[];
  evidenceCount: number;
};

export function buildWeakPracticePlan(
  input: LearningAnalysisInput,
  unitWordIds: ReadonlySet<string>,
  limit = 5,
): WeakPracticePlan;
```

Sort by retention ascending, hint rate descending, response time descending, then word ID. Cycle formats `jp-to-zh`, `zh-to-jp`, `cloze`; prefer `zh-to-jp` for hint dependency and `cloze` for context errors.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --test-name-pattern="weak practice"`  
Expected: PASS.

```powershell
git add src/spaced-repetition/weak-practice.ts tests/spaced-repetition.test.mjs
git commit -m "feat: build deterministic weak-word practice plans"
```

### Task 3: Execute mixed-format focused sessions

**Files:**
- Modify: `app/hooks/useReviewSession.ts:37-420`
- Modify: `app/page.tsx:86-330`
- Test: `tests/spaced-repetition.test.mjs`

**Interfaces:**
- Consumes: `WeakPracticeItem[]`
- Produces from hook: `activeReviewFormat: ReviewFormat`, `startFocusedReview(items: WeakPracticeItem[]): void`

- [ ] **Step 1: Extract and test delayed retry insertion**

Add pure helper to `src/spaced-repetition/weak-practice.ts`:

```ts
export function insertDelayedRetry(
  items: WeakPracticeItem[],
  failedIndex: number,
  delay = 2,
): WeakPracticeItem[];
```

Test that a failed item is inserted after two different items, is inserted at most once per original item, and keeps its format.

- [ ] **Step 2: Run the helper test and confirm RED**

Run: `npm test -- --test-name-pattern="delayed retry"`  
Expected: FAIL because helper is absent.

- [ ] **Step 3: Refactor the hook to queue items**

Replace `reviewWordIds` internal state with:

```ts
type ReviewQueueItem = { wordId: string; format: ReviewFormat; retryOf?: string };
const [reviewItems, setReviewItems] = useState<ReviewQueueItem[]>([]);
const activeReviewFormat = reviewItems[reviewIndex]?.format ?? reviewFormat;
```

Use `activeReviewFormat` for rendering, hints, answer checking, skills, persistence, and keyboard shortcuts. Existing standard sessions map word IDs to the selected global format. `startFocusedReview` maps `WeakPracticeItem[]` directly.

- [ ] **Step 4: Add delayed retry after a failed focused item**

After a successful atomic commit, when `correct === false`, update `reviewItems` with `insertDelayedRetry`. Do not insert another retry when the current item already has `retryOf`.

- [ ] **Step 5: Run core checks and commit**

Run: `npm run check:fast`  
Expected: TypeScript, app lint, and 45+ tests PASS.

```powershell
git add app/hooks/useReviewSession.ts app/page.tsx src/spaced-repetition/weak-practice.ts tests/spaced-repetition.test.mjs
git commit -m "feat: run mixed-format weak-word sessions"
```

### Task 4: Create recommendation models and hook

**Files:**
- Modify: `src/spaced-repetition/study-session.ts`
- Create: `app/hooks/useLearningRecommendation.ts`
- Test: `tests/spaced-repetition.test.mjs`

**Interfaces:**
- Produces: `LearningRecommendationViewModel`
- Produces: `buildHomeRecommendation(overview)`, `buildUnitRecommendation(input, plan)`
- Hook returns: `{ recommendation, weakPlan, source: "local", generatedAt }`

- [ ] **Step 1: Write failing recommendation-priority tests**

```js
assert.equal(buildHomeRecommendation(overloadedOverview).action, "reduce_new_cards");
assert.equal(buildUnitRecommendation(weakInput, plan).action, "weak_practice");
assert.equal(buildUnitRecommendation(insufficientInput, emptyPlan).source, "insufficient_evidence");
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- --test-name-pattern="recommendation"`  
Expected: FAIL because view model builders are absent.

- [ ] **Step 3: Implement pure builders and the client hook**

```ts
export type LearningRecommendationViewModel = {
  title: string;
  reason: string;
  action: "weak_practice" | "due_review" | "reduce_new_cards" | "learn_new" | "gather_evidence";
  evidenceLabel: string;
  confidencePercent: number | null;
};
```

The hook calls `aggregateLearningAnalysis` with `buildAnalysisPeriod(now, 3)`, current unit events/memories, then derives baseline and weak plan in `useMemo`.

- [ ] **Step 4: Run tests and commit**

Run: `npm run check:fast`  
Expected: PASS.

```powershell
git add src/spaced-repetition/study-session.ts app/hooks/useLearningRecommendation.ts tests/spaced-repetition.test.mjs
git commit -m "feat: derive actionable learning recommendations"
```

### Task 5: Add the recommendation card to home and unit pages

**Files:**
- Create: `app/components/LearningRecommendationCard.tsx`
- Modify: `app/page.tsx`
- Modify: `app/home/page.tsx`
- Modify: `app/demo.module.css`
- Modify: `app/home/home.module.css`

**Interfaces:**
- Consumes: `LearningRecommendationViewModel`
- Emits: `onStart`, optional `onAskWhy`

- [ ] **Step 1: Create the accessible component**

```tsx
type Props = {
  recommendation: LearningRecommendationViewModel;
  sourceLabel: "本機規則" | "AI 分析" | "快取";
  onStart: () => void;
  onAskWhy?: () => void;
};
```

Render exactly one primary recommendation, evidence, confidence, generated time, a 44px primary action, and optional ask-why action. Do not render an empty skeleton; render local output immediately.

- [ ] **Step 2: Integrate the unit card**

Place it after `MasterySummary`. Call `startFocusedReview(weakPlan.items)` for `weak_practice`; use existing review action for due review.

- [ ] **Step 3: Integrate the home card**

Replace only the content inside `continueCard` with `buildHomeRecommendation(overview)`; keep navigation and data controls intact.

- [ ] **Step 4: Verify responsive and keyboard behavior**

Run: `npm run dev`  
Check: 390px and 768px, no horizontal scroll; Tab reaches both actions; focus ring visible; actions are at least 44px.

- [ ] **Step 5: Run verification and commit**

Run: `npm run verify`  
Expected: lint, 45+ tests, TypeScript, and static production build PASS.

```powershell
git add app/components/LearningRecommendationCard.tsx app/page.tsx app/home/page.tsx app/demo.module.css app/home/home.module.css
git commit -m "feat: show local learning recommendations"
```

### Task 6: Update task status

**Files:**
- Modify: `TASK.md`

- [ ] **Step 1: Record only current state and next phase**

State that 3-day local analysis, five-question mixed weak practice, delayed retry, and recommendation cards are complete. Set the next step to the local Codex Bridge plan.

- [ ] **Step 2: Final verification and commit**

Run: `npm run verify`  
Expected: PASS.

```powershell
git add TASK.md
git commit -m "docs: record local learning coach progress"
```
