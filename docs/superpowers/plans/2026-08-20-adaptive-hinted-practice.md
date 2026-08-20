# Adaptive Hinted Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a default adaptive daily practice flow with per-card formats, progressive hints, reliable cloze fallback, delayed retry, versioned session recovery, and skill-aware summaries.

**Architecture:** Add a pure `practice-plan` module that chooses one format per queued word while preserving the existing focused FSRS order. Upgrade only practice persistence to version 2, then adapt the shared review hook to read the current practice item's format without changing unit-review behavior or the learning-event schema.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5.9, CSS Modules, Node test runner, `ts-fsrs` 5.4.

**Spec:** `docs/superpowers/specs/2026-08-20-adaptive-hinted-practice-design.md`

## Global Constraints

- Work from the current dirty tree: inspect `git diff -- <file>` before every edit and preserve all unrelated user changes.
- Use `apply_patch`; never replace a whole modified file merely to simplify the edit.
- Before editing Next/React UI, read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` and `node_modules/next/dist/docs/03-architecture/accessibility.md`.
- Do not add packages, deploy, create a Supabase project, modify global settings, or change the existing repository/event payload schema.
- Preserve the existing `MemoryRepository`, FSRS card format, unit-review session storage, vocabulary import/export/clear flows, and current visual language.
- Treat manual hints as `Again` for FSRS while reporting observed correctness separately.
- Keep 390px free of horizontal scrolling; every touch target is at least 44px with visible focus.
- Run `npm test` for every data, queue, session, or FSRS change.
- Update `TASK.md` only after all implementation and verification tasks pass.

## File Map

- Create `src/spaced-repetition/practice-plan.ts`: pure practice item model and adaptive format selection.
- Modify `src/spaced-repetition/practice-session-storage.ts`: version 2 persistence and version 1 normalization.
- Modify `src/spaced-repetition/review-session-queue.ts`: item-key retry helper while keeping the current word-ID helper for unit review.
- Modify `src/spaced-repetition/types.ts`: `HintKind` and optional hint-kind analytics fields only.
- Modify `app/hooks/usePracticeSession.ts`: build recommended/custom plans and expose plan statistics.
- Modify `app/hooks/useReviewSession.ts`: make practice cards consume per-item format and persist the actual practice queue.
- Modify `app/components/ReviewPanel.tsx`: progressive hint controls, per-card format heading, and silent cloze fallback.
- Modify `app/practice/page.tsx` and `app/practice/practice.module.css`: recommended default and progressive custom controls.
- Modify `tests/practice-area.test.mjs`: plan and practice session contracts.
- Modify `tests/spaced-repetition.test.mjs`: hint-kind, cloze fallback, and composite retry contracts.

---

### Task 1: Introduce the pure practice-plan contract

**Files:**
- Create: `src/spaced-repetition/practice-plan.ts`
- Modify: `tests/practice-area.test.mjs`

**Interfaces:**
- Consumes: `buildPracticeQueue(...)`, `skillForReviewFormat(...)`, `currentRetrievability(...)`, `createClozeSentence(...)`.
- Produces: `PracticeMode`, `PracticePlanWord`, `PracticePlanItem`, `makePracticeItemId(...)`, `buildPracticePlan(...)`.

- [ ] **Step 1: Add failing contract tests**

Add imports and tests that express the exact public API:

```js
import { buildPracticePlan, makePracticeItemId } from "../src/spaced-repetition/practice-plan.ts";

test("adaptive practice keeps focused word order and chooses an eligible weak skill", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const primary = createWordMemory("word", "n4-1-1", now, "jp_to_meaning");
  primary.reviewCount = 3;
  primary.fsrsCard.due = "2026-08-19T00:00:00Z";
  const productive = createWordMemory("word", "n4-1-1", now, "meaning_to_jp");
  productive.reviewCount = 1;
  productive.fsrsCard.stability = 0.2;

  const plan = buildPracticePlan(
    [primary, productive],
    [{ wordId: "word", unitId: "n4-1-1", clozeEligible: true }],
    "recommended",
    now,
    () => 0.5,
  );

  assert.equal(plan[0].format, "zh-to-jp");
  assert.equal(plan[0].skill, "meaning_to_jp");
  assert.equal(plan[0].itemId, makePracticeItemId("word", "zh-to-jp"));
});

test("adaptive practice never selects cloze for an ineligible example", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const primary = createWordMemory("word", "n4-1-1", now, "jp_to_meaning");
  primary.reviewCount = 2;
  const plan = buildPracticePlan(
    [primary],
    [{ wordId: "word", unitId: "n4-1-1", clozeEligible: false }],
    "cloze",
    now,
    () => 0.5,
  );
  assert.equal(plan[0].format, "zh-to-jp");
  assert.equal(plan[0].skill, "meaning_to_jp");
});

test("adaptive practice caps untrained alternate skills at thirty percent", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const memories = Array.from({ length: 10 }, (_, index) => {
    const memory = createWordMemory(`word-${index}`, "n4-1-1", now, "jp_to_meaning");
    memory.reviewCount = 1;
    return memory;
  });
  const words = memories.map((memory) => ({ wordId: memory.wordId, unitId: memory.unitId, clozeEligible: true }));
  const plan = buildPracticePlan(memories, words, "recommended", now, () => 0.5);
  assert.ok(plan.filter((item) => item.format !== "jp-to-zh").length <= Math.ceil(plan.length * 0.3));
  assert.ok(plan.every((item, index) => index < 2 || item.format !== plan[index - 1].format || item.format !== plan[index - 2].format));
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: FAIL because `practice-plan.ts` does not exist.

- [ ] **Step 3: Implement the model and deterministic selection**

Create the module with these exact exported types and signature:

```ts
import { buildPracticeQueue, skillForReviewFormat } from "./practice-queue.ts";
import { currentRetrievability } from "./retrievability.ts";
import type { MemorySkill, ReviewFormat, WordMemoryRecord } from "./types.ts";

export type PracticeMode = "recommended" | ReviewFormat;

export type PracticePlanWord = {
  wordId: string;
  unitId: string;
  clozeEligible: boolean;
};

export type PracticePlanItem = {
  itemId: string;
  wordId: string;
  unitId: string;
  format: ReviewFormat;
  skill: MemorySkill;
};

export function makePracticeItemId(wordId: string, format: ReviewFormat): string {
  return `${wordId}::${format}`;
}

export function buildPracticePlan(
  memories: WordMemoryRecord[],
  words: readonly PracticePlanWord[],
  mode: PracticeMode,
  now = new Date(),
  random: () => number = Math.random,
  recentWordIds: readonly string[] = [],
): PracticePlanItem[] {
  const wordById = new Map(words.map((word) => [word.wordId, word]));
  const baseFormat: ReviewFormat = mode === "recommended" ? "jp-to-zh" : mode;
  const refs = buildPracticeQueue(memories, baseFormat, now, random, recentWordIds);
  const memoryByKey = new Map(memories.map((memory) => [`${memory.wordId}:${memory.skill}`, memory]));
  const newSkillLimit = Math.ceil(refs.length * 0.3);
  const newSkillSlots = new Set(
    Array.from({ length: newSkillLimit }, (_, index) => Math.min(refs.length - 1, 2 + index * 3)),
  );
  let newSkillCount = 0;

  return refs.flatMap((ref, index) => {
    const word = wordById.get(ref.wordId);
    if (!word) return [];
    let format: ReviewFormat = baseFormat;
    if (mode === "recommended") {
      const weakestEstablished = chooseWeakestEstablishedFormat(ref.wordId, word.clozeEligible, memoryByKey, now);
      if (weakestEstablished !== "jp-to-zh") {
        format = weakestEstablished;
      } else if (newSkillSlots.has(index)) {
        const choices: ReviewFormat[] = word.clozeEligible ? ["zh-to-jp", "cloze"] : ["zh-to-jp"];
        format = choices[newSkillCount % choices.length];
        newSkillCount += 1;
      } else {
        format = "jp-to-zh";
      }
    }
    if (format === "cloze" && !word.clozeEligible) format = "zh-to-jp";
    return [{
      itemId: makePracticeItemId(ref.wordId, format),
      wordId: ref.wordId,
      unitId: ref.unitId,
      format,
      skill: skillForReviewFormat(format),
    }];
  });
}

function chooseWeakestEstablishedFormat(
  wordId: string,
  clozeEligible: boolean,
  memoryByKey: ReadonlyMap<string, WordMemoryRecord>,
  now: Date,
): ReviewFormat {
  const formats: ReviewFormat[] = clozeEligible
    ? ["jp-to-zh", "zh-to-jp", "cloze"]
    : ["jp-to-zh", "zh-to-jp"];
  return formats
    .map((format) => ({
      format,
      memory: memoryByKey.get(`${wordId}:${skillForReviewFormat(format)}`),
    }))
    .filter((candidate) => candidate.memory && candidate.memory.reviewCount > 0)
    .sort((a, b) => currentRetrievability(a.memory!, now) - currentRetrievability(b.memory!, now))[0]?.format
    ?? "jp-to-zh";
}
```

This assigns new-skill cards to every third queue position, so the existing due/weak word order never changes while long same-format runs are avoided. Established alternate skills are not counted against the 30% introduction cap because they already have their own FSRS evidence.

- [ ] **Step 4: Run the focused tests**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the pure planner**

```bash
git add src/spaced-repetition/practice-plan.ts tests/practice-area.test.mjs
git commit -m "feat: add adaptive practice planner"
```

### Task 2: Upgrade practice persistence without losing version 1 sessions

**Files:**
- Modify: `src/spaced-repetition/practice-session-storage.ts`
- Modify: `tests/practice-area.test.mjs`

**Interfaces:**
- Consumes: `PracticePlanItem` from Task 1 and existing `StoredReviewSessionResult`.
- Produces: normalized `StoredPracticeSession` version 2 from both version 1 and version 2 JSON.

- [ ] **Step 1: Replace the existing round-trip test with explicit migration tests**

Add assertions for:

```js
test("practice session migrates version one and round-trips version two", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  values.set(PRACTICE_SESSION_KEY, JSON.stringify({
    version: 1,
    format: "jp-to-zh",
    wordRefs: [{ wordId: "word", unitId: "n4-1-1" }],
    index: 0,
    results: [],
    retryWordIds: [],
  }));
  const migrated = readPracticeSession(storage);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.items, [{
    itemId: "word::jp-to-zh",
    wordId: "word",
    unitId: "n4-1-1",
    format: "jp-to-zh",
    skill: "jp_to_meaning",
  }]);

  writePracticeSession(storage, { ...migrated, retryItemIds: ["word::jp-to-zh"] });
  assert.deepEqual(readPracticeSession(storage), { ...migrated, retryItemIds: ["word::jp-to-zh"] });
});
```

Also test rejection of an item whose `skill` does not match `format`, an out-of-range index, and a retry ID absent from `items`.

- [ ] **Step 2: Run the test and verify it fails on version 2 expectations**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: FAIL because the reader still returns version 1.

- [ ] **Step 3: Implement the normalized version 2 schema**

Use this public type:

```ts
export type StoredPracticeSession = {
  version: 2;
  mode: PracticeMode;
  items: PracticePlanItem[];
  index: number;
  results: StoredReviewSessionResult[];
  retryItemIds: string[];
};
```

Keep a private `StoredPracticeSessionV1` type. `readPracticeSession` must parse unknown JSON, validate version 2 first, then validate and convert version 1 with `makePracticeItemId` and `skillForReviewFormat`. Do not rewrite localStorage during read; the existing next save performs the migration. Keep the storage key unchanged so old sessions remain discoverable.

- [ ] **Step 4: Run practice and complete test suites**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit session compatibility**

```bash
git add src/spaced-repetition/practice-session-storage.ts tests/practice-area.test.mjs
git commit -m "feat: migrate practice sessions to per-card formats"
```

### Task 3: Make delayed retry use composite practice item IDs

**Files:**
- Modify: `src/spaced-repetition/review-session-queue.ts`
- Modify: `tests/spaced-repetition.test.mjs`

**Interfaces:**
- Consumes: arrays of `PracticePlanItem` and an `itemId`.
- Produces: `schedulePracticeRetry(items, currentIndex, item, shouldRetry, retryItemIds)`.

- [ ] **Step 1: Add failing retry tests**

```js
test("practice retry preserves the failed format and waits for two other cards", () => {
  const items = [
    { itemId: "a::cloze", wordId: "a", unitId: "u", format: "cloze", skill: "context_to_word" },
    { itemId: "b::jp-to-zh", wordId: "b", unitId: "u", format: "jp-to-zh", skill: "jp_to_meaning" },
    { itemId: "c::zh-to-jp", wordId: "c", unitId: "u", format: "zh-to-jp", skill: "meaning_to_jp" },
  ];
  const plan = schedulePracticeRetry(items, 0, items[0], true, []);
  assert.equal(plan.items[3].itemId, "a::cloze");
  assert.deepEqual(plan.retryItemIds, ["a::cloze"]);
  assert.equal(schedulePracticeRetry(plan.items, 3, items[0], true, plan.retryItemIds).scheduled, false);
});
```

- [ ] **Step 2: Run and confirm the missing-export failure**

Run: `node --experimental-strip-types --test tests/spaced-repetition.test.mjs`

Expected: FAIL because `schedulePracticeRetry` is not exported.

- [ ] **Step 3: Add the item-based helper without changing unit retry**

Implement the same insertion rule as the current helper (`currentIndex + 3`, capped at queue length), but deduplicate with `item.itemId`. Return `{ items, retryItemIds, scheduled }`. Leave `scheduleReviewRetry` intact for non-practice unit reviews.

- [ ] **Step 4: Run FSRS and practice tests**

Run: `npm test`

Expected: all tests PASS, including existing word-ID retry tests.

- [ ] **Step 5: Commit composite retry**

```bash
git add src/spaced-repetition/review-session-queue.ts tests/spaced-repetition.test.mjs
git commit -m "feat: retry practice cards by word and format"
```

### Task 4: Record progressive hint kinds while preserving FSRS semantics

**Files:**
- Modify: `src/spaced-repetition/types.ts`
- Modify: `src/spaced-repetition/fsrs-adapter.ts`
- Modify: `src/sync/learning-events.ts`
- Modify: `tests/spaced-repetition.test.mjs`
- Modify: `tests/learning-sync.test.mjs`

**Interfaces:**
- Produces: `HintKind`, optional `hintKinds` in review context/history/event payloads.
- Preserves: `hintLevel`, `usedHint`, `answerRevealed`, and current `mapOutcomeToFsrsRating` behavior.

- [ ] **Step 1: Add failing event and rating tests**

Use this exact union:

```ts
export type HintKind = "sentence-cloze" | "sentence-full" | "length" | "kana-1" | "kana-2" | "audio";
```

Add a test that calls `reviewWordMemory` with `correct: true`, `usedHint: true`, `hintKinds: ["kana-1"]`; assert history/event preserve the array and `fsrsRating === Rating.Again`. Add a sync round-trip fixture containing `hintKinds: ["length", "kana-1"]` and assert it is not removed during normalization.

- [ ] **Step 2: Run and verify type/data failures**

Run: `npm test`

Expected: FAIL because `hintKinds` is not propagated.

- [ ] **Step 3: Thread optional hint kinds through existing structures**

Add `hintKinds?: HintKind[]` to `ReviewContext`, `ReviewHistoryRecord`, and the event payload type that is already serialized by `createLearningReviewEvent`. Copy arrays defensively (`[...context.hintKinds]`). Do not make the field required and do not increment the repository schema version; old local and remote events must remain valid.

- [ ] **Step 4: Run data and type validation**

Run: `npm test`

Expected: PASS.

Run: `npm run check:types`

Expected: PASS.

- [ ] **Step 5: Commit analytics compatibility**

```bash
git add src/spaced-repetition/types.ts src/spaced-repetition/fsrs-adapter.ts src/sync/learning-events.ts tests/spaced-repetition.test.mjs tests/learning-sync.test.mjs
git commit -m "feat: record progressive practice hints"
```

### Task 5: Connect per-card plans to the shared review engine

**Files:**
- Modify: `app/hooks/usePracticeSession.ts`
- Modify: `app/hooks/useReviewSession.ts`
- Modify: `tests/practice-area.test.mjs`

**Interfaces:**
- Consumes: `PracticeMode`, `PracticePlanItem[]`, version 2 session, `schedulePracticeRetry`.
- Produces: `practiceMode`, current per-card `reviewFormat`, resumable actual item queue, and skill-split summary.

- [ ] **Step 1: Add source-contract tests before touching the hooks**

In `tests/practice-area.test.mjs`, read both hook source files and assert the practice hook imports `buildPracticePlan`, the review hook derives `currentPracticeItem`, and practice persistence writes `version: 2`, `items`, and `retryItemIds`. This project does not currently include a React hook test harness, so keep hook integration coverage source-focused and put behavioral logic in the already tested pure modules.

- [ ] **Step 2: Run and verify the source-contract failure**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: FAIL on the missing per-card integration markers.

- [ ] **Step 3: Build the plan only after vocabulary words load**

In `usePracticeSession`, replace the page-level `format` state with `practiceMode: PracticeMode`, defaulting to `"recommended"`. Load eligible vocabulary from the primary focused refs, derive each word's `clozeEligible` using `createClozeSentence(word.example, [word.word, word.reading]).replaced`, and call `buildPracticePlan`. For custom modes, keep the existing behavior through the plan builder. Expose counts derived from plan items, not from stale refs.

- [ ] **Step 4: Adapt practice scope without rewriting unit review**

Change `PracticeReviewScope` to:

```ts
export type PracticeReviewScope = {
  mode: PracticeMode;
  items: PracticePlanItem[];
  readSession: () => StoredPracticeSession | null;
  writeSession: (session: StoredPracticeSession) => void;
  clearSession: () => void;
};
```

Inside `useReviewSession`, retain `reviewWordIds` and unit-review logic. Add practice-only `practiceItems` state. Derive:

```ts
const currentPracticeItem = practiceScope ? practiceItems[reviewIndex] : null;
const activeReviewFormat = currentPracticeItem?.format ?? reviewFormat;
```

Use `activeReviewFormat` for prompt rendering, shortcut handling, cloze checking, `skillForReviewFormat`, review context, and result recording. Keep `reviewFormat` as the selected global format for unit reviews. Derive practice `reviewWords` from `practiceItems.map(item => item.wordId)` and unit `reviewWords` from `reviewWordIds`.

- [ ] **Step 5: Persist and restore the actual practice queue**

When practice starts, copy `practiceScope.items` into `practiceItems`. When retry is needed, call `schedulePracticeRetry`, update `practiceItems`, and persist those items. On pause/effect save, write `{ version: 2, mode, items: practiceItems, index, results, retryItemIds }`. On resume, filter missing words, validate each cloze again, convert invalid cloze cards to `zh-to-jp` with a recomputed `itemId`/skill, restore results by `wordId + reviewFormat`, and resume the saved index. Repository commit failure must leave index and retry arrays unchanged.

- [ ] **Step 6: Build a non-misleading summary**

Extend `ReviewSessionSummary` with:

```ts
independentCorrect: number;
assistedCorrect: number;
needsReview: number;
byFormat: Record<ReviewFormat, { completed: number; independentCorrect: number; assistedCorrect: number }>;
```

Compute independent success from `correct && !usedHint && !answerRevealed`; assisted success from `correct && usedHint`; needs review from unique `wordId + reviewFormat` items requiring retry. Retain all old summary fields so unit UI does not break.

- [ ] **Step 7: Run type, practice, and full tests**

Run: `npm run check:types`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 8: Commit review-engine integration**

```bash
git add app/hooks/usePracticeSession.ts app/hooks/useReviewSession.ts tests/practice-area.test.mjs
git commit -m "feat: run practice with per-card formats"
```

### Task 6: Implement the progressive hint and cloze experience

**Files:**
- Modify: `app/components/ReviewPanel.tsx`
- Modify: `app/hooks/useReviewSession.ts`
- Modify: `app/demo.module.css`
- Modify: `tests/spaced-repetition.test.mjs`

**Interfaces:**
- Consumes: active per-card format, `HintKind[]`, current cloze attempt state.
- Produces: consistent hint ladders and no visible technical cloze fallback.

- [ ] **Step 1: Add pure hint-ladder tests**

Move format-specific ladder decisions out of JSX into `src/spaced-repetition/review-hints.ts` with:

```ts
export type ReviewHintState = {
  level: HintLevel;
  kinds: HintKind[];
  answerVisible: boolean;
};

export function nextReviewHint(
  format: ReviewFormat,
  state: ReviewHintState,
  options: { hasSecondKana: boolean; hasAudio: boolean; clozeAttempts: number },
): ReviewHintState;
```

Tests must assert the exact ladders from the spec, including skipping unavailable second-kana/audio steps and never revealing a cloze answer before the second failed submission.

- [ ] **Step 2: Run and confirm the missing-module failure**

Run: `node --experimental-strip-types --test tests/spaced-repetition.test.mjs`

Expected: FAIL because `review-hints.ts` does not exist.

- [ ] **Step 3: Implement the pure ladder and use it in the hook**

Create `review-hints.ts`, then replace inline numeric transitions in keyboard and button handlers with `nextReviewHint`. Store `reviewHintKinds` in the hook, reset it with every card, and pass it into `ReviewContext`. Do not auto-play audio; audio plays only from the explicit hint button.

- [ ] **Step 4: Simplify ReviewPanel rendering**

Add a visible format label (`日文 → 中文`, `中文 → 日文`, or `例句填空`) inside the card heading. Render controls from the current ladder state. Remove the user-facing `此例句無法自動挖空` block: the planner/resume normalization must have converted such cards before rendering. Keep a defensive render fallback to the `zh-to-jp` prompt without changing the persisted FSRS skill during render.

- [ ] **Step 5: Stabilize mobile interactions**

In `app/demo.module.css`, reserve a minimum action area height, keep primary controls at least 44px, and ensure long Japanese text wraps. After advancing a card, focus the review card heading; when a cloze card opens, focus its input. Respect `prefers-reduced-motion` and do not add animated width/height transitions.

- [ ] **Step 6: Run checks**

Run: `npm run check:types`

Expected: PASS.

Run: `npm run lint:app`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit progressive hints**

```bash
git add src/spaced-repetition/review-hints.ts app/hooks/useReviewSession.ts app/components/ReviewPanel.tsx app/demo.module.css tests/spaced-repetition.test.mjs
git commit -m "feat: add progressive practice hints"
```

### Task 7: Present recommended practice and an accessible custom mode

**Files:**
- Modify: `app/practice/page.tsx`
- Modify: `app/practice/practice.module.css`
- Modify: `app/components/ReviewPanel.tsx`
- Modify: `tests/practice-area.test.mjs`

**Interfaces:**
- Consumes: `practiceMode`, plan statistics, extended completion summary.
- Produces: default recommended CTA, expandable custom selection, and skill-aware completion view.

- [ ] **Step 1: Add page source-contract tests**

Assert the page contains `今日最佳練習`, native `<details>`/`<summary>` for `自訂練習`, the three existing format values, and summary labels `獨立答對`, `提示後完成`, `需要再看`.

- [ ] **Step 2: Run and verify copy failures**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: FAIL because the new mode and summary labels are absent.

- [ ] **Step 3: Replace the always-visible select with recommended-first controls**

The primary action card shows recommendation evidence such as `包含 6 個到期、4 個待加強`; state explicitly that categories may overlap. Use a native `<details>` for custom practice and retain the existing `<select>` inside it. Changing the custom format rebuilds the preview but must not mutate an already running or saved session without an explicit `重新開始` action.

- [ ] **Step 4: Render the split completion summary**

For practice, show the three outcome groups and a compact by-format list. For unit review, retain the existing completion view. Do not display one aggregate percentage across self-rated and objectively checked formats.

- [ ] **Step 5: Complete 390px CSS**

Make the CTA full-width below 700px, preserve the existing color tokens and radii, keep `<summary>` at least 44px, and ensure the four metric cells remain a 2-column grid at 390px. Do not increase navigation item count.

- [ ] **Step 6: Run source and app checks**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: PASS.

Run: `npm run check:types && npm run lint:app`

Expected: PASS.

- [ ] **Step 7: Commit the recommended-first UI**

```bash
git add app/practice/page.tsx app/practice/practice.module.css app/components/ReviewPanel.tsx tests/practice-area.test.mjs
git commit -m "feat: present recommended adaptive practice"
```

### Task 8: Verify behavior, accessibility, and task handoff

**Files:**
- Modify: `TASK.md`

**Interfaces:**
- Consumes: completed Tasks 1–7.
- Produces: verified implementation status and remaining external acceptance work.

- [ ] **Step 1: Run focused and full automated validation**

Run: `npm test`

Expected: all tests PASS with no skipped practice/FSRS tests.

Run: `npm run check:types`

Expected: PASS.

Run: `npm run lint:app`

Expected: PASS.

Run: `npm run build`

Expected: production build PASS.

- [ ] **Step 2: Perform 390px browser acceptance**

At `/practice`, verify: no horizontal overflow; empty state remains usable; recommended/custom controls are keyboard-accessible; every control is at least 44px; all three formats show the correct ladder; cloze first/second failure behavior; retry appears only after two other cards when available; pause/reload/resume preserves the exact format and position; completion counts match the performed actions.

- [ ] **Step 3: Perform 1440px and regression acceptance**

Verify the practice layout does not become excessively wide, unit review still uses one selected format, answer reveal is not counted as a manual hint, explicit hint use still maps to FSRS `Again`, and offline repository failure does not advance the card.

- [ ] **Step 4: Inspect the final diff for user-change preservation**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended files from this plan plus the user's pre-existing dirty files; no generated `.next` or cache artifacts staged.

- [ ] **Step 5: Update TASK.md with facts only**

Replace the current status with the adaptive practice behavior actually verified, the exact passing command results, and the next external acceptance step. Preserve the existing Supabase/deployment caveats. Do not claim `npm run verify` passed if the known `.worktrees` generated-artifact lint issue remains.

- [ ] **Step 6: Commit verification metadata**

```bash
git add TASK.md
git commit -m "docs: record adaptive practice completion"
```
