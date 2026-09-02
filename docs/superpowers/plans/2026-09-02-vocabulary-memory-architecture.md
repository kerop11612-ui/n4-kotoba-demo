# Vocabulary Memory Architecture — Compact Implementation Plan

> **For agentic workers:** Execute this plan in four work packages. Use test-driven development, preserve the dirty working tree, and stop for review only after each package—not after every file.

**Goal:** Preserve FSRS-6 as the per-skill scheduler while adding trustworthy evidence, receptive/productive/contextual mastery, weakness detection, a non-filler Meta Scheduler, and scaffolded leech recovery.

**Architecture:** Fix the evidence boundary first, derive all learning intelligence outside FSRS, then connect one pure Meta Scheduler to the existing practice flow. Keep the first release conservative: no new package, no HLR, no arbitrary 0–100 score, no cross-skill Stability propagation, and no physical IndexedDB store split.

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript 5.9, `ts-fsrs` 5.4.1/FSRS-6, existing IndexedDB/localStorage repositories, Node test runner, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-02-vocabulary-memory-architecture-design.md`

## Why Four Packages

```text
Package 1 — Trust the data
Evidence semantics + schema v3 + scheduler profile cutoff

Package 2 — Understand the word
Per-skill mastery + vocabulary mastery + weakness risk

Package 3 — Decide what to practise
Meta Scheduler + retry semantics + leech state + practice integration

Package 4 — Ship safely
UI + migration/replay regression + browser/full verification
```

The following are explicitly deferred because they do not block the first useful release:

- Splitting IndexedDB into multiple physical object stores.
- FSRS parameter optimization.
- HLR/logistic/Bayesian models.
- Frequency rank, cognate, transitivity-pair, and confusion-set datasets.
- A calibrated 0–100 unfamiliarity score.
- FSRS-7 or `ts-fsrs` beta upgrades.

## Global Constraints

- Read `TASK.md` first.
- The repository is already dirty. Before editing each package, run `git diff --` with that package's exact target paths and preserve all user changes.
- Use `apply_patch`; do not use reset, checkout, destructive commands, or whole-file replacement of dirty source files.
- Read the relevant Next.js 16.3 guide under `node_modules/next/dist/docs/` before changing React/App Router files.
- Do not add packages, deploy, modify Supabase, or alter global settings.
- Do not change FSRS Stability, Difficulty, forgetting curve, interval math, or another skill's card.
- Incorrect, hinted, or pre-response-revealed answers cannot become FSRS Hard/Good/Easy.
- Slow response is telemetry only; it cannot automatically change an FSRS grade.
- Early session retries are telemetry-only until the card's actual FSRS due time.
- `unknown` mastery is not 0% and not 100% unfamiliar.
- Recommended queues may contain fewer items than their limit; stable cards are not filler.
- Data/FSRS/queue changes require `npm test`.
- Keep 390px free of horizontal scrolling and interactive targets at least 44px.
- Commit only files belonging to the completed package. Never stage unrelated dirty files.
- When a target file already contains user changes, use `git add -p <exact-file>` and stage only the package's hunks; if clean separation is impossible, do not commit and report the overlap for user review.

---

## Work Package 1: Trustworthy Evidence and Deterministic Replay

**Outcome:** Every new attempt preserves what the learner actually did, only valid memory measurements update FSRS, legacy data remains importable, and future scheduler changes cannot silently reinterpret old history.

**Files:**

- Create `src/spaced-repetition/review-evidence.ts`
- Create `src/spaced-repetition/scheduler-profile.ts`
- Modify `src/spaced-repetition/types.ts`
- Modify `src/spaced-repetition/rating-mapper.ts`
- Modify `src/spaced-repetition/fsrs-config.ts`
- Modify `src/spaced-repetition/fsrs-adapter.ts`
- Modify `src/storage/memory-migration.ts`
- Modify `src/storage/memory-repository-utils.ts`
- Modify `src/sync/learning-events.ts`
- Modify `src/sync/replay-learning-events.ts`
- Modify `src/spaced-repetition/review-session-storage.ts`
- Modify `src/spaced-repetition/practice-session-storage.ts`
- Modify `app/hooks/useReviewSession.ts`
- Modify `tests/spaced-repetition.test.mjs`
- Modify `tests/learning-sync.test.mjs`
- Modify `tests/practice-area.test.mjs`

### Public contracts

Add these exact contracts:

```ts
export type ReviewAttemptKind = "scheduled" | "diagnostic" | "retry" | "scaffold";

export type RatingMappingReason =
  | "independent_rating"
  | "incorrect"
  | "manual_hint"
  | "answer_revealed"
  | "instruction_only"
  | "legacy_unknown";

export interface ReviewEvidenceInput {
  rawUserRating: ReviewRating;
  correct: boolean;
  usedHint: boolean;
  answerRevealedBeforeResponse: boolean;
  answerFeedbackShownAfterResponse: boolean;
  attemptKind: ReviewAttemptKind;
  fsrsUpdateEligible: boolean;
  responseTimeMs: number;
}

export interface ReviewEvidenceDecision {
  updatesFsrs: boolean;
  effectiveFsrsRating: 1 | 2 | 3 | 4 | null;
  reason: RatingMappingReason;
  recalledIndependently: boolean;
}

export function deriveReviewEvidence(input: ReviewEvidenceInput): ReviewEvidenceDecision;
```

The decision order is fixed:

```text
fsrsUpdateEligible = false → telemetry only
incorrect                  → Again
revealed before response   → Again
manual hint                → Again
otherwise                  → preserve raw rating
```

Add optional compatibility fields to review context/history/events:

```ts
rawUserRating?: ReviewRating;
effectiveFsrsRating?: 1 | 2 | 3 | 4 | null;
ratingMappingReason?: RatingMappingReason;
attemptKind?: ReviewAttemptKind;
answerRevealedBeforeResponse?: boolean;
answerFeedbackShownAfterResponse?: boolean;
scheduledAt?: string;
sessionId?: string;
schedulerProfileId?: string;
```

`ReviewHistoryRecord.fsrsRating` remains numeric because history contains actual FSRS measurements. `VocabularyReviewEvent.fsrsRating` becomes `1 | 2 | 3 | 4 | null` so telemetry-only retry/scaffold events do not fabricate Again.

### Scheduler profile

Create:

```ts
export const LEGACY_FSRS6_PROFILE = Object.freeze({
  id: "fsrs6-tsfsrs-5.4.1-default-r90-short-v1",
  algorithm: "FSRS-6" as const,
  packageName: "ts-fsrs" as const,
  packageVersion: "5.4.1",
  parameters: Object.freeze([...default_w]),
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: true,
  enableShortTerm: true,
  learningSteps: Object.freeze(["1m", "10m"]),
  relearningSteps: Object.freeze(["10m"]),
});

export const CURRENT_FSRS_PROFILE = LEGACY_FSRS6_PROFILE;
export function createSchedulerForProfile(profile: FsrsSchedulerProfile): FSRS;
```

All new events carry `schedulerProfileId`. Events without a profile use the legacy profile. Unknown future profile IDs fail explicitly. On first schema-v3 sync seed, create one deterministic memory snapshot cutoff per card; replay ignores older events and processes only post-cutoff events.

### Test-first checklist

- [ ] Add a table-driven test covering independent slow Good, hint+Good, reveal+Easy, incorrect+Good, and early retry/scaffold.
- [ ] Add a cloze test proving correct post-response feedback is not a pre-response reveal.
- [ ] Add a test proving slow independent Good stays FSRS Good and records `slow_recall` only.
- [ ] Add a test proving revealed Easy preserves raw Easy but uses FSRS Again.
- [ ] Add a test proving `reviewWordMemory` rejects telemetry-only decisions.
- [ ] Add a test for `createTelemetryOnlyReviewEvent(...)` returning no card/history mutation and a null FSRS rating.
- [ ] Add session tests proving `sessionId` survives pause/resume; legacy sessions receive one during normalization.
- [ ] Add v1/v2-to-v3 migration tests; missing reveal semantics become `legacy_unknown`, never inferred.
- [ ] Add replay tests for unordered/duplicate events, deterministic fuzz, cutoff snapshots, legacy profile fallback, and unknown profile rejection.

Run before implementation:

```bash
node --experimental-strip-types --test tests/spaced-repetition.test.mjs tests/learning-sync.test.mjs tests/practice-area.test.mjs
```

Expected: new tests FAIL for missing contracts or old semantics.

### Minimal implementation checklist

- [ ] Implement `deriveReviewEvidence` as a pure decision table.
- [ ] Route `fsrs-adapter` through that decision before calling `scheduler.next`.
- [ ] Export `createTelemetryOnlyReviewEvent(memory, input, context, now)`; it never mutates or returns a card/history.
- [ ] Remove the hook's `slow Good → Hard` rewrite.
- [ ] Split pre-response answer reveal from ordinary post-response feedback.
- [ ] Make `rating-mapper.ts` a compatibility wrapper over the same decision table; remove contradictory hint semantics.
- [ ] Generate/persist one `sessionId` per session and restore it after reload.
- [ ] Set `scheduledAt` from the card's due timestamp before the attempt.
- [ ] Raise memory schema to v3 while accepting v1/v2 and rejecting v4+.
- [ ] Persist raw/effective rating, mapping reason, attempt kind, reveal timing, session ID, scheduled time, and profile ID in new events.
- [ ] Create scheduler instances from explicit profiles during replay.
- [ ] Seed deterministic cutoff snapshots before any future profile transition.

### Package verification

```bash
npm run check:types
npm test
```

Expected: type check and all tests PASS. Do not continue if legacy import, sync replay, or evidence tests fail.

Commit:

```bash
git add src/spaced-repetition/review-evidence.ts src/spaced-repetition/scheduler-profile.ts
git add src/spaced-repetition/types.ts src/spaced-repetition/rating-mapper.ts src/spaced-repetition/fsrs-config.ts src/spaced-repetition/fsrs-adapter.ts
git add src/storage/memory-migration.ts src/storage/memory-repository-utils.ts
git add src/sync/learning-events.ts src/sync/replay-learning-events.ts
git add src/spaced-repetition/review-session-storage.ts src/spaced-repetition/practice-session-storage.ts app/hooks/useReviewSession.ts
git add tests/spaced-repetition.test.mjs tests/learning-sync.test.mjs tests/practice-area.test.mjs
git commit -m "feat: establish trustworthy versioned review evidence"
```

**Review gate:** Show the decision table, schema migration results, replay fixture results, and `git status` before Package 2.

---

## Work Package 2: Per-Skill Mastery and Predictive Weakness

**Outcome:** One vocabulary exposes independent receptive, productive, and contextual states with confidence; unfamiliarity and weakness risk are separate and explainable.

**Files:**

- Create `src/spaced-repetition/skill-mastery.ts`
- Create `src/spaced-repetition/vocabulary-mastery.ts`
- Modify `src/spaced-repetition/types.ts`
- Modify `src/spaced-repetition/mastery.ts`
- Modify `src/spaced-repetition/unit-stats.ts`
- Modify `src/spaced-repetition/print-recommendation.ts`
- Modify `tests/spaced-repetition.test.mjs`
- Modify `tests/print-recommendation.test.mjs`

### Public contracts

```ts
export type MasteryBand = "unknown" | "likely_unfamiliar" | "uncertain" | "likely_familiar";
export type EvidenceConfidence = "low" | "medium" | "high";
export type ResponseTrend = "unknown" | "stable" | "slower" | "faster";

export interface SkillMasterySnapshot {
  skill: "jp_to_meaning" | "meaning_to_jp" | "context_to_word";
  band: MasteryBand;
  confidence: EvidenceConfidence;
  retrievabilityNow: number | null;
  retrievabilityAtHorizon: number | null;
  independentAttempts: number;
  independentSuccesses: number;
  assistedSuccesses: number;
  recentIndependentFailures: number;
  responseTrend: ResponseTrend;
  reasons: string[];
}

export interface VocabularyMastery {
  wordId: string;
  receptive: SkillMasterySnapshot;
  productive: SkillMasterySnapshot;
  contextual: SkillMasterySnapshot;
  crossSkillDisagreement: boolean;
  unfamiliarityBand: MasteryBand;
  weaknessRisk: "unknown" | "low" | "medium" | "high";
  confidence: EvidenceConfidence;
  reasons: string[];
}
```

Use one versioned policy object:

```ts
export const MASTERY_POLICY_V1 = Object.freeze({
  horizonDays: 30,
  mediumEvidenceAttempts: 3,
  highEvidenceAttempts: 8,
  recentWindow: 5,
  minimumTrendSamples: 3,
  highRiskSignalFamilies: 2,
});
```

These are operational defaults kept in one module, not universal claims. Do not duplicate them in UI/queue code.

### Required behavior

```text
jp_to_meaning   → receptive
meaning_to_jp   → productive
context_to_word → contextual
```

- Unseen skill returns `unknown`, `low`, and null retrievability.
- Assisted success does not increment independent success.
- Response trend uses valid independent attempts of the same skill/format; hinted/revealed/scaffold attempts are excluded.
- One skill never replaces or averages away another skill.
- Vocabulary unfamiliarity is the weakest established skill band; all-unknown remains unknown.
- Cross-skill disagreement requires one likely-familiar and one established weak/uncertain skill.
- High weakness risk requires at least two different signal families and medium/high confidence.
- A recent actual failure affects current unfamiliarity; it is not described only as future weakness.
- No 0–100 score is produced in this package.

### Test-first checklist

- [ ] Unseen skill remains unknown rather than 0%.
- [ ] Hinted/revealed success counts as assisted only.
- [ ] Three independent times produce a trend; insufficient samples remain unknown.
- [ ] Strong receptive plus weak productive produces disagreement and preserves both states.
- [ ] Missing contextual evidence stays unknown.
- [ ] A single slow response cannot produce high weakness risk.
- [ ] Two independent signal families can produce high risk when confidence is sufficient.
- [ ] Unit stats no longer select the highest-review-count skill as overall vocabulary truth.
- [ ] Print recommendation returns one word while using its weakest established active skill.

Run before implementation:

```bash
node --experimental-strip-types --test tests/spaced-repetition.test.mjs tests/print-recommendation.test.mjs
```

Expected: new tests FAIL.

### Minimal implementation checklist

- [ ] Implement pure `calculateSkillMastery(memory, attempts, now, policy)`.
- [ ] Filter exact `wordId + skill` evidence before calculating a snapshot.
- [ ] Treat FSRS R/current+future as one signal family, not separate weighted inputs.
- [ ] Compare recent independent response medians; do not restore an 8-second threshold.
- [ ] Implement `calculateVocabularyMastery(wordId, memories, attempts, now)` using explicit skill mapping.
- [ ] Return weakness signals/reasons with the risk level.
- [ ] Keep old `calculateMasterySnapshot()` exports as deprecated receptive/skill compatibility adapters so existing screens compile during migration.
- [ ] Group unit stats by word and retain per-skill snapshots.
- [ ] Make print recommendation skill-aware without allowing unseen alternate skills to outrank actually due cards.

### Package verification

```bash
npm run check:types
npm test
```

Expected: PASS.

Commit:

```bash
git add src/spaced-repetition/skill-mastery.ts src/spaced-repetition/vocabulary-mastery.ts
git add src/spaced-repetition/types.ts src/spaced-repetition/mastery.ts src/spaced-repetition/unit-stats.ts src/spaced-repetition/print-recommendation.ts
git add tests/spaced-repetition.test.mjs tests/print-recommendation.test.mjs
git commit -m "feat: model vocabulary mastery by retrieval skill"
```

**Review gate:** Demonstrate a fixture where receptive is familiar, productive is unfamiliar, contextual is unknown, and weakness risk has explicit reasons.

---

## Work Package 3: Meta Scheduler, Retry Semantics, and Leech Recovery

**Outcome:** Recommended practice selects due/diagnostic/weak/new-skill work without stable filler, does not double-update early retries, and routes persistent failures through scaffolded recovery.

**Files:**

- Create `src/spaced-repetition/meta-scheduler.ts`
- Create `src/spaced-repetition/leech-state.ts`
- Modify `src/spaced-repetition/types.ts`
- Modify `src/spaced-repetition/review-queue.ts`
- Modify `src/spaced-repetition/practice-queue.ts`
- Modify `src/spaced-repetition/practice-plan.ts`
- Modify `src/spaced-repetition/review-session-queue.ts`
- Modify `src/sync/learning-events.ts`
- Modify `app/hooks/usePracticeSession.ts`
- Modify `app/hooks/useReviewSession.ts`
- Modify `tests/practice-area.test.mjs`
- Modify `tests/spaced-repetition.test.mjs`

### Scheduler contracts

```ts
export type MetaScheduleReason =
  | "fsrs_due"
  | "weakness_diagnostic"
  | "unfamiliar_skill"
  | "cross_skill_diagnostic"
  | "new_skill"
  | "leech_scaffold";

export interface MetaScheduleCandidate {
  itemId: string;
  wordId: string;
  unitId: string;
  skill: MemorySkill;
  format: ReviewFormat;
  attemptKind: ReviewAttemptKind;
  reason: MetaScheduleReason;
  dueAt: string | null;
  retrievability: number | null;
}

export function buildMetaSchedule(input: {
  memories: readonly WordMemoryRecord[];
  masteries: readonly VocabularyMastery[];
  attempts: readonly VocabularyReviewEvent[];
  limit: number;
  now: Date;
  random?: () => number;
}): MetaScheduleCandidate[];
```

Sorting is lexicographic, not weighted:

```ts
type PriorityTuple = readonly [
  reasonRank: number,
  dueTime: number,
  retrievability: number,
  recentPenalty: number,
  tieBreak: number,
];
```

Priority order:

```text
fsrs_due
weakness_diagnostic
unfamiliar_skill
cross_skill_diagnostic
leech_scaffold (capped)
new_skill
```

Stable cards with no reason are not candidates. The queue may be shorter than `limit`.

### Leech contracts

```ts
export type LeechState = "normal" | "struggling" | "leech" | "scaffolded" | "recovering" | "mastered";

export interface LeechSnapshot {
  state: LeechState;
  enteredAt: string;
  independentFailuresAcrossSessions: number;
  independentFailuresAcrossDays: number;
  failedSkills: MemorySkill[];
  recurringConfusedWordIds: string[];
  reasons: string[];
}

export function transitionLeechState(
  previous: LeechSnapshot | undefined,
  attempts: readonly VocabularyReviewEvent[],
  now: Date,
): LeechSnapshot;
```

### Test-first checklist

- [ ] One due plus nine stable cards returns one item, not ten.
- [ ] Due always precedes diagnostic; diagnostic precedes new skill.
- [ ] Productive success may suppress optional receptive practice but never a receptive due card.
- [ ] Recommended mode uses Meta Scheduler; explicit custom modes keep the chosen format.
- [ ] A retry item keeps word, skill, format, reason, scheduled time, and gains `attemptKind: "retry"`.
- [ ] Early retry creates a telemetry-only event and leaves card/reviewCount unchanged.
- [ ] Due retry updates FSRS normally.
- [ ] Three Again events in one session do not automatically become a leech.
- [ ] Failures across sessions enter struggling; cross-day/cross-skill persistence can enter leech.
- [ ] Scaffold event has null FSRS rating and no card/history mutation.
- [ ] Independent diagnostic after scaffold enters recovering; a later spaced success enters mastered.
- [ ] Failure from recovering/mastered returns to struggling.

Run before implementation:

```bash
node --experimental-strip-types --test tests/practice-area.test.mjs tests/spaced-repetition.test.mjs
```

Expected: new tests FAIL.

### Minimal implementation checklist

- [ ] Define `MetaScheduleReason` in `types.ts`; history/events accept optional `selectionReason`.
- [ ] Build candidates once per word/skill and sort with the tuple.
- [ ] Use random only for exact ties and keep tests deterministic through injected random.
- [ ] Apply cross-skill suppression only to optional non-due work; never mutate cards.
- [ ] Extend `PracticePlanItem` with attempt kind, reason, and scheduled time.
- [ ] Update `schedulePracticeRetry` to mark the copied item as retry without deciding FSRS eligibility.
- [ ] In `useReviewSession`, set `fsrsUpdateEligible` for retry only when `due <= now`.
- [ ] Early retry uses `createTelemetryOnlyReviewEvent` + `appendReviewEvent`; due retry uses `reviewWordMemory` + `commitReview`.
- [ ] Implement the pure leech transition reducer using unique session IDs and dates.
- [ ] Legacy attempts without session IDs may increase uncertainty but cannot alone prove cross-session recurrence.
- [ ] Scaffold completion produces only a telemetry event with null FSRS grade.
- [ ] Limit scaffold items to one per short recommended session.
- [ ] Stop using `againStreak >= 3` as the sole queue predicate; retain the field only for compatibility.
- [ ] Connect recommended practice to `buildMetaSchedule` while preserving custom practice.

### Package verification

```bash
npm run check:types
npm test
```

Expected: PASS.

Commit:

```bash
git add src/spaced-repetition/meta-scheduler.ts src/spaced-repetition/leech-state.ts src/spaced-repetition/types.ts
git add src/spaced-repetition/review-queue.ts src/spaced-repetition/practice-queue.ts src/spaced-repetition/practice-plan.ts src/spaced-repetition/review-session-queue.ts
git add src/sync/learning-events.ts app/hooks/usePracticeSession.ts app/hooks/useReviewSession.ts
git add tests/practice-area.test.mjs tests/spaced-repetition.test.mjs
git commit -m "feat: schedule diagnostic practice and leech recovery"
```

**Review gate:** Demonstrate a due-only queue, an early telemetry-only retry, one cross-skill diagnostic, and one leech recovery transition.

---

## Work Package 4: Product Integration and Release Verification

**Outcome:** Users see three-direction mastery and clear recommendation reasons without false precision; old data/sync remains safe; full automated and browser verification passes.

**Files:**

- Modify `app/components/WordCard.tsx`
- Modify `app/components/MasterySummary.tsx`
- Modify `app/practice/page.tsx`
- Modify `app/demo.module.css` only if necessary
- Modify `app/practice/practice.module.css` only if necessary
- Modify `tests/ui-contract.test.mjs`
- Modify `tests/practice-area.test.mjs`
- Modify `tests/learning-sync.test.mjs`
- Modify `tests/spaced-repetition.test.mjs`
- Modify `TASK.md` after verification only

### Required UI behavior

Expose fixed Traditional Chinese labels:

```text
看懂（日→中）
想得出來（中→日）
語境運用
資料不足
安排原因
需要診斷
改用提示練習
```

- Each skill shows a band, confidence, and evidence count.
- Unknown displays `資料不足`, not 0%.
- Do not show one skill's percentage as overall vocabulary mastery.
- Recommendation reasons come from fixed mappings of reason codes, not generated text.
- Scaffold copy states that it is teaching practice and not an independent recall success.
- Keep detailed statistics expandable to preserve the compact mobile layout.

### Test-first checklist

- [ ] Add source/UI contract tests for all labels and no false overall percentage.
- [ ] Add an end-to-end replay fixture with three skills, legacy cutoff, independent success, hint, reveal, early retry, due retry, and scaffold.
- [ ] Replay unordered duplicate events from two devices and assert exact final cards.
- [ ] Assert receptive familiar + productive unfamiliar + contextual unknown remains visible after replay.
- [ ] Assert top scheduler reason and leech state after replay.
- [ ] Cover invalid dates, unknown profile, duplicate IDs, all-stable, all-unknown, manual mastery due, and queue limits 0/1/15.

Run before implementation:

```bash
node --experimental-strip-types --test tests/ui-contract.test.mjs tests/practice-area.test.mjs tests/learning-sync.test.mjs tests/spaced-repetition.test.mjs
```

Expected: new tests FAIL.

### Minimal implementation checklist

- [ ] Read relevant Next.js 16.3 client/accessibility guidance before editing UI.
- [ ] Calculate mastery/schedule in hooks or pure modules; do not place policy logic in JSX.
- [ ] Render the three skill rows with band/confidence/evidence.
- [ ] Render recommendation and diagnostic/scaffold explanations from reason codes.
- [ ] Preserve current visual tokens and existing navigation.
- [ ] At 390px, ensure rows wrap, details controls remain at least 44px, focus remains visible, and no horizontal overflow appears.
- [ ] Preserve print, favorites, backup import/export, manual mastery, audio, keyboard shortcuts, guest storage, and signed-in sync.

### Automated release verification

Run separately so failures are attributable:

```bash
npm run check:types
npm run lint:app
npm test
npm run build
git diff --check
git status --short
```

Expected:

- Type check PASS.
- App lint reports 0 errors and 0 warnings.
- All tests PASS with none skipped.
- Production build PASS.
- No whitespace errors.
- No generated cache/output staged.

### Browser acceptance

At `390×844` verify:

- No horizontal scrolling.
- Touch targets are at least 44px.
- Reveal then Good/Easy preserves raw rating but records FSRS Again.
- Slow independent Good stays FSRS Good and records slow telemetry only.
- Correct cloze feedback is not treated as a pre-response reveal.
- Recommended practice contains only due/diagnostic/weak/new/scaffold reasons, not stable filler.
- Three skills may show different mastery bands.
- Pause/reload/resume preserves session ID, item kind, reason, format, and profile.

At `1440px` verify:

- Layout remains readable and not excessively wide.
- Existing unit review and custom practice still work.
- Print, favorites, backup, sync, manual mastery, audio, and keyboard shortcuts regressions are absent.

### Finish

- [ ] Update `TASK.md` with exact passing command results and browser dimensions.
- [ ] Record deferred work: physical IndexedDB split, Japanese feature telemetry, calibration dataset, and personalized parameters.
- [ ] Do not claim `npm run check` or `npm run verify` passed unless those exact commands were run successfully.

Commit:

```bash
git add app/components/WordCard.tsx app/components/MasterySummary.tsx app/practice/page.tsx
git add tests/ui-contract.test.mjs tests/practice-area.test.mjs tests/learning-sync.test.mjs tests/spaced-repetition.test.mjs TASK.md
git add app/demo.module.css app/practice/practice.module.css
git commit -m "feat: present and verify vocabulary memory guidance"
```

If a listed CSS file did not change, do not stage it.

## Definition of Done

- Raw behavior and effective FSRS evidence are separate.
- Hint, pre-response reveal, incorrect answer, early retry, and scaffold cannot inflate FSRS Stability.
- Slow response never directly changes the FSRS grade.
- Legacy data imports safely and profile-aware replay is deterministic.
- Receptive, productive, and contextual mastery remain independent and confidence-aware.
- Unfamiliarity and weakness risk are separate and explainable.
- Cross-skill evidence never changes another card's Stability/Difficulty.
- Recommended practice does not use stable cards as filler.
- Leech handling includes scaffold and recovery, not only Again streak.
- Required tests, type check, app lint, build, mobile acceptance, and desktop regression pass.
- `TASK.md` contains verified current state and deferred next steps only.

## Deferred Follow-Up Plan

Create a separate plan only after this release has trustworthy interday telemetry:

1. Split IndexedDB snapshots/events into physical stores if measured write size warrants it.
2. Collect Japanese features without modifying FSRS Difficulty.
3. Establish default-profile log loss and calibration baselines.
4. Compare optimized FSRS parameters and HLR/logistic alternatives using chronological validation.
5. Add a 0–100 unfamiliarity score only if it represents a calibrated probability and improves decisions.
