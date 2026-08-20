# N4 Practice Area and Three-Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first `/practice` area backed by the existing FSRS data and synchronize one owner's learning history safely across three devices with Supabase Email OTP.

**Architecture:** Keep the browser repository as the immediate/offline data source. Represent review and manual-mastery changes as immutable learning events, store them in a per-user local outbox, and merge them through a Supabase table protected by RLS; reconstruct current FSRS cards by replaying the merged event stream. The practice page builds a cross-unit queue from already-learned words and reuses the existing review card/session behavior.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5.9, IndexedDB/localStorage, `ts-fsrs`, Supabase Auth/Postgres, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-20-practice-three-device-sync-design.md`

## Global Constraints

- Executor target is Luna with high reasoning; follow this plan sequentially and stop at any failed verification instead of continuing on assumptions.
- Read `TASK.md` and the relevant guides under `node_modules/next/dist/docs/` before code changes.
- Preserve all existing uncommitted user changes; never reset, discard, or reformat unrelated files.
- This is a single-owner system used on three devices; do not add profiles, registration UX, social login, roles, or an admin panel.
- Codex/ChatGPT authentication remains isolated inside the AI bridge and must not be reused for app identity.
- Do not deploy, create the user's Supabase project, or place secret/service keys in the repository or browser bundle.
- Preserve `MemoryRepositoryData` export shape and existing vocabulary JSON/API formats.
- Keep 390px free of horizontal scrolling, all touch targets at least 44px, and visible keyboard focus.
- Use tests first for every behavior change. Run `npm test` for all data/FSRS changes.
- Commit only the files for the completed task. If the existing dirty tree overlaps a task, review the diff and stage exact paths only.

---

### Task 1: Add the Supabase contract and safe configuration boundary

**Files:**
- Create: `supabase/migrations/202608200001_create_learning_events.sql`
- Create: `.env.example`
- Create: `tests/sync-contract.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces table `public.learning_events` and browser variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Later tasks may only use the publishable key in client code; no service/secret key is allowed.

- [ ] **Step 1: Add the failing SQL contract test**

```js
// tests/sync-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("learning_events migration is owner-scoped and append-only", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608200001_create_learning_events.sql", import.meta.url), "utf8");
  assert.match(sql, /primary key \(user_id, event_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\) = user_id/i);
  assert.match(sql, /for select/i);
  assert.match(sql, /for insert/i);
  assert.match(sql, /for delete/i);
  assert.doesNotMatch(sql, /for update/i);
});
```

- [ ] **Step 2: Register the test and verify the expected failure**

Add `tests/sync-contract.test.mjs` to the existing `npm test` command in `package.json`.

Run: `node --test tests/sync-contract.test.mjs`

Expected: FAIL with `ENOENT` for the migration file.

- [ ] **Step 3: Add the exact append-only table and RLS policies**

```sql
-- supabase/migrations/202608200001_create_learning_events.sql
create table public.learning_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  device_id text not null,
  event_type text not null check (event_type in ('review', 'manual_mastery', 'memory_snapshot')),
  word_id text not null,
  unit_id text not null,
  skill text not null check (skill in ('jp_to_meaning', 'meaning_to_jp', 'kanji_to_reading', 'audio_to_meaning', 'context_to_word')),
  occurred_at timestamptz not null,
  payload jsonb not null,
  server_seq bigint generated always as identity,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create unique index learning_events_user_server_seq_idx
  on public.learning_events (user_id, server_seq);

alter table public.learning_events enable row level security;

create policy "owner selects learning events"
  on public.learning_events for select
  to authenticated using (auth.uid() = user_id);

create policy "owner inserts learning events"
  on public.learning_events for insert
  to authenticated with check (auth.uid() = user_id);

create policy "owner deletes learning events"
  on public.learning_events for delete
  to authenticated using (auth.uid() = user_id);
```

- [ ] **Step 4: Add public configuration documentation and the client dependency**

```dotenv
# .env.example
# Supabase publishable values are safe to expose; RLS protects user rows.
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

Run: `npm install @supabase/supabase-js`

Expected: `package.json` and `package-lock.json` contain the same resolved Supabase client version.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/sync-contract.test.mjs`

Expected: PASS.

```powershell
git add -- package.json package-lock.json .env.example tests/sync-contract.test.mjs supabase/migrations/202608200001_create_learning_events.sql
git commit -m "feat: define owner learning sync contract"
```

---

### Task 2: Define immutable learning events and deterministic FSRS replay

**Files:**
- Create: `src/sync/learning-events.ts`
- Create: `src/sync/replay-learning-events.ts`
- Create: `tests/learning-sync.test.mjs`
- Modify: `src/spaced-repetition/types.ts`
- Modify: `src/spaced-repetition/fsrs-adapter.ts`
- Modify: `app/hooks/useReviewSession.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `LearningEvent`, `ReviewLearningEvent`, `ManualMasteryLearningEvent`, `MemorySnapshotLearningEvent`.
- Produces `createLearningEventId(randomUUID?: () => string): string`.
- Produces `reviewHistoryToLearningEvent(history, deviceId): ReviewLearningEvent`.
- Produces `seedLearningEvents(data, deviceId): LearningEvent[]`.
- Produces `replayLearningEvents(events): MemoryRepositoryData`.

- [ ] **Step 1: Write failing replay and deduplication tests**

```js
// tests/learning-sync.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { createWordMemory, reviewWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { reviewHistoryToLearningEvent } from "../src/sync/learning-events.ts";
import { replayLearningEvents } from "../src/sync/replay-learning-events.ts";

test("merged review events are deduplicated and replayed in time order", () => {
  const base = createWordMemory("n4-0001", "n4-1-1", new Date("2026-08-01T00:00:00Z"));
  const first = reviewWordMemory(base, "good", 0, new Date("2026-08-02T00:00:00Z"), 1000, { eventId: "event-a", reviewFormat: "jp-to-zh" });
  const second = reviewWordMemory(first.memory, "again", 0, new Date("2026-08-03T00:00:00Z"), 1200, { eventId: "event-b", reviewFormat: "jp-to-zh" });
  const events = [
    reviewHistoryToLearningEvent(second.history, "phone"),
    reviewHistoryToLearningEvent(first.history, "pc"),
    reviewHistoryToLearningEvent(first.history, "phone"),
  ];
  const data = replayLearningEvents(events);
  assert.equal(data.memories["n4-0001:jp_to_meaning"].reviewCount, 2);
  assert.equal(data.memories["n4-0001:jp_to_meaning"].lastRawRating, "again");
  assert.equal(data.history.length, 2);
});

test("manual mastery and Again follow the merged event timeline", () => {
  const events = [
    { version: 1, id: "manual", deviceId: "phone", type: "manual_mastery", wordId: "n4-0001", unitId: "n4-1-1", skill: "jp_to_meaning", occurredAt: "2026-08-02T00:00:00Z", payload: { mastered: true } },
    { version: 1, id: "again", deviceId: "pc", type: "review", wordId: "n4-0001", unitId: "n4-1-1", skill: "jp_to_meaning", occurredAt: "2026-08-03T00:00:00Z", payload: { rawRating: "again", hintLevel: 0, reviewFormat: "jp-to-zh", responseTimeMs: 1000, correct: false, usedHint: false, answerRevealed: false } },
  ];
  const data = replayLearningEvents(events);
  assert.equal(data.memories["n4-0001:jp_to_meaning"].manualMastered, false);
});
```

- [ ] **Step 2: Register and run the tests**

Add `tests/learning-sync.test.mjs` to `npm test`.

Run: `node --experimental-strip-types --test tests/learning-sync.test.mjs`

Expected: FAIL because the sync modules and `ReviewContext.eventId` do not exist.

- [ ] **Step 3: Add the public event union**

```ts
// src/sync/learning-events.ts
import type { HintLevel, MemoryRepositoryData, MemorySkill, ReviewFormat, ReviewHistoryRecord, ReviewRating, WordMemoryRecord } from "../spaced-repetition/types.ts";

type LearningEventBase = {
  version: 1;
  id: string;
  deviceId: string;
  wordId: string;
  unitId: string;
  skill: MemorySkill;
  occurredAt: string;
};

export type ReviewLearningEvent = LearningEventBase & {
  type: "review";
  payload: Pick<ReviewHistoryRecord, "rawRating" | "hintLevel" | "answerCorrect" | "answerAttempts" | "usedHint" | "answerRevealed" | "responseTimeMs" | "correct" | "recalledWithoutHint" | "errorTypes" | "confusedWordIds"> & {
    reviewFormat: ReviewFormat;
  };
};

export type ManualMasteryLearningEvent = LearningEventBase & {
  type: "manual_mastery";
  payload: { mastered: boolean };
};

export type MemorySnapshotLearningEvent = LearningEventBase & {
  type: "memory_snapshot";
  payload: { memory: WordMemoryRecord };
};

export type LearningEvent = ReviewLearningEvent | ManualMasteryLearningEvent | MemorySnapshotLearningEvent;

export function createLearningEventId(randomUUID: () => string = () => crypto.randomUUID()): string {
  return randomUUID();
}
```

Implement `reviewHistoryToLearningEvent` by copying the listed payload fields, and implement `seedLearningEvents` with these rules:

1. Convert every valid history record to one `review` event using its existing `id`. Normalize missing legacy formats from the skill: `meaning_to_jp` → `zh-to-jp`, `context_to_word` → `cloze`, all others → `jp-to-zh`.
2. Add one deterministic `memory_snapshot` event only when a memory's `reviewCount` is greater than the number of matching history rows, or when the current memory is manually mastered and no explicit manual event exists in the source data.
3. Use ID `snapshot:${wordId}:${skill}:${updatedAt}` so repeated first-sync attempts deduplicate.

- [ ] **Step 4: Make newly-created review IDs globally unique without breaking legacy callers**

Add to `ReviewContext`:

```ts
eventId?: string;
```

Change `reviewWordMemory` to use:

```ts
const eventId = reviewContext?.eventId
  ?? `${memory.wordId}:${skill}:${memory.reviewCount + 1}:${memory.updatedAt}`;
```

In `useReviewSession`, pass `eventId: createLearningEventId()` in every new `ReviewContext`. The fallback remains only for old tests/imported call sites.

- [ ] **Step 5: Implement deterministic replay**

`replayLearningEvents` must:

1. Deduplicate by `id`.
2. Group by `wordId:skill`.
3. Select the latest `memory_snapshot` by `occurredAt`, then `id`.
4. Start from the snapshot memory, or `createWordMemory(wordId, unitId, firstEventDate, skill)`.
5. Apply only non-snapshot events after the chosen snapshot time in ascending `occurredAt`, then `id` order.
6. For a review, call `reviewWordMemory` with the event's raw rating/context and its `id`; append the returned history/event.
7. For manual mastery, call `setManualMastery(memory, payload.mastered, new Date(occurredAt))`.
8. Return schema version 2 data with histories/events deduplicated by ID.

- [ ] **Step 6: Verify all FSRS tests and commit**

Run: `node --experimental-strip-types --test tests/learning-sync.test.mjs tests/spaced-repetition.test.mjs`

Expected: PASS.

```powershell
git add -- src/sync/learning-events.ts src/sync/replay-learning-events.ts src/spaced-repetition/types.ts src/spaced-repetition/fsrs-adapter.ts app/hooks/useReviewSession.ts tests/learning-sync.test.mjs package.json
git commit -m "feat: replay immutable learning events"
```

---

### Task 3: Isolate guest and owner caches and persist the sync outbox

**Files:**
- Create: `src/sync/local-sync-state.ts`
- Modify: `src/storage/memory-repository.ts`
- Modify: `src/storage/indexeddb-memory-repository.ts`
- Modify: `src/storage/repository-factory.ts`
- Modify: `tests/learning-sync.test.mjs`

**Interfaces:**
- Produces `RepositoryNamespace = "guest" | \`user:${string}\``.
- Changes `createMemoryRepository(storage?, indexedDB?, namespace = "guest"): MemoryRepository`.
- Produces `LocalSyncStateStore` with `read(userId)`, `write(userId, state)`, `enqueue(userId, events)`, and `clear(userId)`.
- Produces `LocalSyncState { version: 1; deviceId; lastServerSeq; knownEvents; outbox }`.

- [ ] **Step 1: Add failing namespace and outbox tests**

```js
test("repository namespaces do not expose another user's local data", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const guest = createMemoryRepository(storage, null, "guest");
  const owner = createMemoryRepository(storage, null, "user:owner-1");
  await guest.migrate();
  await guest.saveWordMemory(createWordMemory("guest-word", "n4-1-1"));
  await owner.migrate();
  assert.equal(await owner.getWordMemory("guest-word"), null);
});

test("outbox enqueue is idempotent by event id", () => {
  const store = new LocalSyncStateStore(memoryStorage);
  store.enqueue("owner-1", [event, event]);
  assert.equal(store.read("owner-1").outbox.length, 1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --experimental-strip-types --test tests/learning-sync.test.mjs`

Expected: FAIL because namespace and outbox APIs are missing.

- [ ] **Step 3: Add repository namespaces while retaining legacy migration**

- `LocalStorageMemoryRepository` accepts a second `storageKey` argument. Default guest storage continues reading `jlpt-spaced-repetition-memory-v1`; user storage uses `jlpt-spaced-repetition-memory-v1:user:<id>` and must never inspect legacy guest keys.
- `IndexedDbMemoryRepositoryOptions` gains `namespace`; replace constant `STATE_KEY` access with instance key `namespace === "guest" ? "state" : \`state:${namespace}\``.
- Only guest `migrate()` imports the old localStorage data when IndexedDB has no state. User namespaces begin empty.
- `createMemoryRepository` forwards the namespace without changing existing two-argument callers.

- [ ] **Step 4: Implement local sync state**

Use one metadata key per user: `n4-kotoba-sync-v1:<userId>`. Generate and persist one device ID under `n4-kotoba-device-v1`. Validate parsed objects; corrupted metadata returns a fresh state without touching learning data. Deduplicate `knownEvents` and `outbox` by event ID on every write.

- [ ] **Step 5: Verify and commit**

Run: `node --experimental-strip-types --test tests/learning-sync.test.mjs tests/spaced-repetition.test.mjs`

Expected: PASS, including existing localStorage and IndexedDB repository tests.

```powershell
git add -- src/sync/local-sync-state.ts src/storage/memory-repository.ts src/storage/indexeddb-memory-repository.ts src/storage/repository-factory.ts tests/learning-sync.test.mjs
git commit -m "feat: isolate owner cache and sync outbox"
```

---

### Task 4: Implement the Supabase event store and offline-first coordinator

**Files:**
- Create: `src/sync/cloud-event-store.ts`
- Create: `src/sync/supabase-client.ts`
- Create: `src/sync/supabase-event-store.ts`
- Create: `src/sync/sync-coordinator.ts`
- Modify: `tests/learning-sync.test.mjs`

**Interfaces:**
- Produces `CloudEventRow { event; serverSeq }`.
- Produces `CloudEventStore.upload(userId, events): Promise<void>`, `pull(userId, afterSeq, limit): Promise<CloudEventRow[]>`, and `clear(userId): Promise<void>`.
- Produces `SyncStatus = "local" | "syncing" | "synced" | "pending" | "error"`.
- Produces `SyncCoordinator.start(userId, repository)`, `record(event)`, `syncNow()`, `replaceWithImport(data)`, `reset()`, and `stop()`.

- [ ] **Step 1: Add failing coordinator tests with a fake cloud store**

```js
test("failed upload keeps local review in the outbox", async () => {
  const cloud = new FakeCloudEventStore({ uploadError: new Error("offline") });
  const coordinator = new SyncCoordinator({ cloud, stateStore, deviceId: "phone" });
  await coordinator.start("owner", repository);
  await coordinator.record(reviewEvent);
  await assert.rejects(coordinator.syncNow());
  assert.deepEqual(stateStore.read("owner").outbox.map(item => item.id), [reviewEvent.id]);
  assert.equal(coordinator.status, "error");
});

test("successful sync uploads idempotently, pulls pages, and rebuilds local data", async () => {
  const cloud = new FakeCloudEventStore({ rows: [{ event: remoteEvent, serverSeq: 1 }] });
  const coordinator = new SyncCoordinator({ cloud, stateStore, deviceId: "phone" });
  await coordinator.start("owner", repository);
  await coordinator.record(localEvent);
  await coordinator.syncNow();
  const data = await repository.exportData();
  assert.equal(data.history.length, 2);
  assert.equal(stateStore.read("owner").outbox.length, 0);
  assert.equal(stateStore.read("owner").lastServerSeq, 1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --experimental-strip-types --test tests/learning-sync.test.mjs`

Expected: FAIL because the cloud store and coordinator are missing.

- [ ] **Step 3: Add a testable cloud interface and Supabase adapter**

```ts
// src/sync/cloud-event-store.ts
import type { LearningEvent } from "./learning-events.ts";

export type CloudEventRow = { event: LearningEvent; serverSeq: number };
export interface CloudEventStore {
  upload(userId: string, events: LearningEvent[]): Promise<void>;
  pull(userId: string, afterSeq: number, limit: number): Promise<CloudEventRow[]>;
  clear(userId: string): Promise<void>;
}
```

The Supabase adapter must map camelCase events to the migration columns, insert with `upsert(..., { onConflict: "user_id,event_id", ignoreDuplicates: true })`, pull in ascending `server_seq`, and reject malformed payloads before replay.

`getSupabaseClient()` returns `null` when either public variable is missing; it must not throw during SSR/tests.

- [ ] **Step 4: Implement serialized synchronization**

`syncNow()` must reuse one in-flight promise so two tabs/clicks cannot run concurrent replay. In order:

1. Mark `syncing`.
2. Upload the current outbox.
3. Pull pages of 500 rows until fewer than 500 are returned.
4. Union pulled rows, known events, and outbox by event ID.
5. Call `replayLearningEvents` and `repository.importData`.
6. Persist the new cursor and known events; remove only successfully uploaded IDs from outbox.
7. Mark `synced`; on failure preserve outbox and mark `error`.

`start()` seeds local events once with `seedLearningEvents`, then syncs. `record()` writes the event to known events and outbox before scheduling a non-blocking `syncNow()`. `replaceWithImport()` clears the owner's cloud rows, replaces local data, reseeds, and synchronizes. `reset()` clears cloud first, then local and sync metadata; if cloud deletion fails, leave local data unchanged.

- [ ] **Step 5: Verify and commit**

Run: `node --experimental-strip-types --test tests/learning-sync.test.mjs`

Expected: PASS for offline, paging, deduplication, import replacement, and reset failure cases.

```powershell
git add -- src/sync/cloud-event-store.ts src/sync/supabase-client.ts src/sync/supabase-event-store.ts src/sync/sync-coordinator.ts tests/learning-sync.test.mjs
git commit -m "feat: synchronize learning events offline first"
```

---

### Task 5: Add the single-owner auth/provider boundary

**Files:**
- Create: `app/providers/LearningDataProvider.tsx`
- Create: `app/hooks/useLearningData.ts`
- Create: `app/components/SyncAccountCard.tsx`
- Create: `app/components/SyncAccountCard.module.css`
- Modify: `app/layout.tsx`
- Modify: `app/hooks/useUnitMemory.ts`
- Modify: `app/home/page.tsx`
- Modify: `tests/sync-contract.test.mjs`

**Interfaces:**
- Produces `useLearningData(): { repository; user; authStatus; syncStatus; pendingCount; sendOtp(email); verifyOtp(email, token); retrySync(); signOut() }`.
- Existing consumers receive one provider-owned local repository in this task; cloud mutation interception is added in Task 8.

- [ ] **Step 1: Add failing static integration checks**

Extend `tests/sync-contract.test.mjs` to assert:

```js
test("learning data provider wraps the app and unit hooks consume it", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const hook = await readFile(new URL("../app/hooks/useUnitMemory.ts", import.meta.url), "utf8");
  assert.match(layout, /LearningDataProvider/);
  assert.match(hook, /useLearningData/);
  assert.doesNotMatch(hook, /createMemoryRepository\(/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/sync-contract.test.mjs`

Expected: FAIL until the provider is wired.

- [ ] **Step 3: Implement the provider state machine**

The provider must:

- Create a guest repository when Supabase is unavailable or signed out.
- Listen to `supabase.auth.onAuthStateChange`. On first sign-in, copy the validated guest snapshot into the empty `user:<user.id>` repository, switch the UI to that owner repository, then call `coordinator.start()`.
- Merge any pre-existing owner cache, copied guest data, and cloud events. Clear guest only after the first cloud synchronization succeeds; if it fails, keep the owner copy active with pending/error status and retain guest as recovery data.
- Keep the owner repository active when the network fails but the Supabase session is still locally valid.
- On sign-out, stop the coordinator, reset the owner cache, clear its sync metadata, and create a fresh guest repository.
- Never expose the access/refresh token through context.

Use Email OTP methods:

```ts
await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
await supabase.auth.verifyOtp({ email, token, type: "email" });
```

`shouldCreateUser: false` is mandatory for the single-owner UI. The owner account must be created once in Supabase before new signups are disabled.

- [ ] **Step 4: Add the accessible account/sync card**

States and copy are fixed:

- Local: `目前只保存在這台裝置` with email field and `寄送驗證碼`.
- OTP sent: six-digit input with `inputMode="numeric"`, `autoComplete="one-time-code"`, and `確認登入`.
- Syncing: `正在合併三台裝置的學習紀錄…`.
- Synced: `已同步` plus `登出`.
- Pending/error: `有 N 筆待同步` or `同步失敗，學習紀錄仍保存在本機` plus `重新同步`.

All inputs require visible labels; async buttons are disabled while submitting and errors use `role="alert"`.

- [ ] **Step 5: Replace page-local repository creation**

- Wrap `<body>` children with `LearningDataProvider` in `app/layout.tsx`.
- `useUnitMemory` obtains the repository from `useLearningData` and reloads when its repository identity changes.
- `/home` obtains the same repository instead of calling `createMemoryRepository()`.

- [ ] **Step 6: Verify and commit**

Run: `npm run check:types`

Run: `node --test tests/sync-contract.test.mjs`

Expected: both PASS.

```powershell
git add -- app/providers/LearningDataProvider.tsx app/hooks/useLearningData.ts app/components/SyncAccountCard.tsx app/components/SyncAccountCard.module.css app/layout.tsx app/hooks/useUnitMemory.ts app/home/page.tsx tests/sync-contract.test.mjs
git commit -m "feat: add single-owner learning sync"
```

---

### Task 6: Build the cross-unit practice queue and independent session storage

**Files:**
- Create: `src/spaced-repetition/practice-queue.ts`
- Create: `src/spaced-repetition/practice-session-storage.ts`
- Create: `tests/practice-area.test.mjs`
- Modify: `src/spaced-repetition/types.ts`
- Modify: `app/hooks/useReviewSession.ts`
- Modify: `src/spaced-repetition/review-session-storage.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `skillForReviewFormat(format): MemorySkill` in shared spaced-repetition code.
- Produces `PracticeWordRef { wordId; unitId }`.
- Produces `buildPracticeQueue(memories, format, now?, random?, recentWordIds?): PracticeWordRef[]`.
- Produces `PRACTICE_SESSION_KEY` and validated `StoredPracticeSession`.
- Extends review session input with an explicit unit/practice scope and storage key; existing unit behavior remains the default.

- [ ] **Step 1: Write failing global queue tests**

```js
// tests/practice-area.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { createWordMemory } from "../src/spaced-repetition/fsrs-adapter.ts";
import { buildPracticeQueue } from "../src/spaced-repetition/practice-queue.ts";

test("practice queue spans units, excludes unseen words, and prioritizes due words", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const due = createWordMemory("due", "n4-2-1", now);
  due.reviewCount = 2;
  due.fsrsCard.due = "2026-08-19T00:00:00Z";
  const learned = createWordMemory("learned", "n4-1-1", now);
  learned.reviewCount = 1;
  learned.fsrsCard.due = "2026-09-01T00:00:00Z";
  const unseen = createWordMemory("unseen", "n4-3-1", now);
  const queue = buildPracticeQueue([learned, unseen, due], "jp-to-zh", now, () => 0.5);
  assert.deepEqual(queue.map(item => item.wordId), ["due", "learned"]);
  assert.deepEqual(new Set(queue.map(item => item.unitId)), new Set(["n4-1-1", "n4-2-1"]));
});

test("alternate formats use learned primary records for initial priority", () => {
  const primary = createWordMemory("word", "n4-1-1", new Date(), "jp_to_meaning");
  primary.reviewCount = 3;
  assert.equal(buildPracticeQueue([primary], "zh-to-jp").length, 1);
});
```

- [ ] **Step 2: Register and run the tests**

Add `tests/practice-area.test.mjs` to `npm test`.

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: FAIL because the practice modules do not exist.

- [ ] **Step 3: Implement the queue without introducing new words**

Export `skillForReviewFormat` from a shared module and remove the private copy in `useReviewSession`.

`buildPracticeQueue` must:

1. Treat only `jp_to_meaning` memories with `reviewCount > 0` as learned word eligibility.
2. Exclude manually mastered words unless `isManualMasteryDue` is true.
3. For the chosen skill, use its reviewed memory when available; otherwise use the primary memory only for queue priority.
4. Call the existing focused queue ordering and map results to unique `{ wordId, unitId }` references.
5. Preserve its adaptive 5/8/10 limit and recent-word avoidance; never add a word lacking primary learning evidence.

- [ ] **Step 4: Add independent validated session storage**

```ts
export type StoredPracticeSession = {
  version: 1;
  format: ReviewFormat;
  wordRefs: PracticeWordRef[];
  index: number;
  results: StoredReviewSessionResult[];
  retryWordIds: string[];
};
export const PRACTICE_SESSION_KEY = "n4-kotoba-active-practice-v1";
```

Reject malformed formats, duplicate/empty IDs, out-of-range indexes, and invalid results. Keep the existing `n4-kotoba-active-review-v2` reader unchanged for old unit sessions.

- [ ] **Step 5: Generalize session execution only where required**

Update `useReviewSession` so a card's new memory derives `unitId` from the word itself (`getUnitId(word.chapterNumber, word.sectionNumber)`), not the page's selected unit. Add injected queue references and persistence callbacks for practice scope; default unit callers retain current queue building and storage behavior. Do not duplicate the full hook.

- [ ] **Step 6: Verify and commit**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs tests/spaced-repetition.test.mjs`

Expected: PASS, including old unit session resume tests.

```powershell
git add -- src/spaced-repetition/practice-queue.ts src/spaced-repetition/practice-session-storage.ts src/spaced-repetition/types.ts src/spaced-repetition/review-session-storage.ts app/hooks/useReviewSession.ts tests/practice-area.test.mjs package.json
git commit -m "feat: add cross-unit practice sessions"
```

---

### Task 7: Build the `/practice` experience and wire navigation

**Files:**
- Create: `app/practice/page.tsx`
- Create: `app/practice/practice.module.css`
- Create: `app/hooks/usePracticeSession.ts`
- Modify: `app/components/AppNav.tsx`
- Modify: `app/components/AppNav.module.css`
- Modify: `app/components/ReviewPanel.tsx`
- Modify: `app/home/page.tsx`
- Modify: `tests/practice-area.test.mjs`

**Interfaces:**
- Adds `AppNavItem` value `practice` and route `/practice`.
- `usePracticeSession` consumes the shared repository, practice queue/storage, `loadVocabularyUnits`, and existing review session behavior.
- `ReviewPanel` accepts customizable exit/completion labels while preserving current defaults.

- [ ] **Step 1: Add failing page and navigation contract tests**

```js
test("practice is a primary route and home starts there", async () => {
  const nav = await readFile(new URL("../app/components/AppNav.tsx", import.meta.url), "utf8");
  const home = await readFile(new URL("../app/home/page.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8");
  assert.match(nav, /href: "\/practice"/);
  assert.match(home, /href="\/practice"/);
  assert.match(page, /今日推薦/);
  assert.match(page, /SyncAccountCard/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: FAIL because `/practice` does not exist.

- [ ] **Step 3: Implement the practice data flow**

`usePracticeSession` must:

1. Wait for the active repository migration and initial signed-in merge; when offline with cached owner data, continue locally.
2. Export memories/history once per repository revision.
3. Build `PracticeWordRef[]` for the selected format.
4. Load only the unique units referenced by the queue using existing `loadVocabularyUnits`.
5. Restore queue order after loading word metadata.
6. Start/resume the generalized review session and commit through the shared repository so sync interception sees every result.
7. Return clear loading, empty, load-error, resume, reviewing, and complete states.

- [ ] **Step 4: Build the mobile-first page**

Before a session:

- Heading `練習區` and card eyebrow `今日推薦`.
- Show due count, weak count, actual queue length, and `estimateReviewMinutes(queue.length)`.
- Primary CTA is `開始 N 題`; if saved, use `繼續第 X / N 題` and show a secondary `重新開始`.
- Format select options remain exactly `日文回想中文`, `中文回想日文`, `例句填空` with default `jp-to-zh`.
- Render `SyncAccountCard` below the primary card.
- Empty state says `還沒有可練習的單字` and links to `/` with `先到單字庫學習`.

During a session, render only `ReviewPanel` and necessary status feedback. Completion returns to `/practice`, not the word list.

- [ ] **Step 5: Update navigation and responsive CSS**

- Place `練習` between `個人學習` and `單字庫`.
- At `max-width: 700px`, let `.nav` wrap; brand occupies the first row and `.links` the full second row with four equal-width links.
- Use `min-width: 0`, `grid-template-columns: repeat(4, minmax(0, 1fr))`, and no fixed page width.
- Preserve 44px link/input/button height, existing focus rings, semantic color tokens, and reduced-motion behavior.

- [ ] **Step 6: Update the home CTA without removing existing statistics**

Change both the main `開始今日學習` link and recommendation `onStart` to `/practice`. Keep chapter and unit browsing links unchanged.

- [ ] **Step 7: Verify and commit**

Run: `npm run check:types`

Run: `node --experimental-strip-types --test tests/practice-area.test.mjs`

Expected: PASS.

```powershell
git add -- app/practice/page.tsx app/practice/practice.module.css app/hooks/usePracticeSession.ts app/components/AppNav.tsx app/components/AppNav.module.css app/components/ReviewPanel.tsx app/home/page.tsx tests/practice-area.test.mjs
git commit -m "feat: add daily practice area"
```

---

### Task 8: Connect every mutation to synchronization and preserve data tools

**Files:**
- Create: `src/sync/syncing-memory-repository.ts`
- Modify: `app/providers/LearningDataProvider.tsx`
- Modify: `app/hooks/useUnitMemory.ts`
- Modify: `app/home/MemoryDataControls.tsx`
- Modify: `tests/learning-sync.test.mjs`

**Interfaces:**
- Produces `SyncingMemoryRepository implements MemoryRepository` wrapping the namespaced local repository and `SyncCoordinator`.
- No UI call site may need to call the coordinator after a normal repository mutation.

- [ ] **Step 1: Add failing repository-decorator tests**

```js
test("review commit remains local when cloud sync fails and can retry", async () => {
  const repository = new SyncingMemoryRepository(localRepository, coordinator);
  await repository.commitReview(result.memory, result.history, result.event);
  assert.equal((await localRepository.exportData()).history.length, 1);
  assert.deepEqual(stateStore.read("owner").outbox.map(item => item.id), [result.history.id]);
});

test("signed-in reset does not clear local data when cloud deletion fails", async () => {
  cloud.clearError = new Error("offline");
  await assert.rejects(repository.reset());
  assert.equal((await localRepository.exportData()).history.length, 1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --experimental-strip-types --test tests/learning-sync.test.mjs`

Expected: FAIL because the decorator is missing.

- [ ] **Step 3: Implement mutation interception**

- `commitReview`: commit locally first, convert the committed history to a review learning event with the coordinator device ID, enqueue, and trigger background sync. A cloud error must not reject the already-successful review.
- `saveWordMemory`: read the previous memory; after local save, enqueue `manual_mastery` only when `manualMastered` changed.
- `importData`: validate first, then delegate to `coordinator.replaceWithImport`; signed-out provider delegates directly to local import.
- `reset`: signed-in provider delegates to coordinator's cloud-first reset; signed-out provider resets locally.
- All read/history/event methods pass through unchanged.

- [ ] **Step 4: Ensure both unit and practice flows use the decorator**

The provider exposes only the decorated repository while signed in. Remove any direct `createMemoryRepository` remaining under `app/` except inside the provider. Confirm manual mastery in `useUnitMemory`, unit review, practice review, import, and reset all use the shared repository.

- [ ] **Step 5: Verify and commit**

Run: `rg -n "createMemoryRepository" app`

Expected: only `LearningDataProvider.tsx` contains the factory call.

Run: `npm test`

Expected: all tests PASS.

```powershell
git add -- src/sync/syncing-memory-repository.ts app/providers/LearningDataProvider.tsx app/hooks/useUnitMemory.ts app/home/MemoryDataControls.tsx tests/learning-sync.test.mjs
git commit -m "feat: sync every learning mutation"
```

---

### Task 9: Validate three-device behavior and update project status

**Files:**
- Modify: `TASK.md`
- Modify only if verification finds a directly related defect: files from Tasks 1–8

**Interfaces:**
- No new interfaces. This task proves the completed feature and records only current status/next steps.

- [ ] **Step 1: Run focused verification**

Run: `npm test`

Expected: all core, sync, and practice tests PASS.

Run: `npm run check:types`

Expected: PASS.

Run: `npm run lint:app`

Expected: PASS.

- [ ] **Step 2: Run the complete verification**

Run: `npm run verify`

Expected: tests, lint, type checks, and production build PASS.

- [ ] **Step 3: Perform local-mode browser acceptance**

Run: `npm run dev`

At 390px and 1440px verify:

- Four navigation links fit without horizontal scrolling.
- `/practice` excludes unseen words and starts the displayed number of questions.
- All three formats work; pause/reload/resume restores the correct card.
- Incorrect/hinted cards retry in the same round.
- Completion updates `/home` statistics and the original unit view.
- With Supabase variables absent, local practice remains fully usable and explains that sync is unavailable.

- [ ] **Step 4: Perform Supabase owner acceptance without deploying**

Using a user-provided development Supabase project:

1. Apply the checked-in migration.
2. Create the single owner email, then disable new-user signup.
3. Open three separate browser profiles and verify the same Email OTP account.
4. Review different words online on devices A/B; confirm device C receives both.
5. Take device B offline, review a word, reconnect, press retry if needed, and confirm all devices converge without losing either review.
6. Confirm one user's direct query cannot read rows with a different `user_id`.
7. Confirm sign-out removes the owner cache from that browser and shows an empty guest state.

- [ ] **Step 5: Update `TASK.md`**

Replace its current status with concise facts only:

- Practice route and cross-unit recommendation are complete.
- Single-owner Email OTP and three-device offline-first sync are complete.
- Exact verification commands and pass counts.
- Supabase migration/configuration is not deployed unless the user separately authorizes it.
- Next step is the user's real three-device acceptance and optional tuning of queue size.

- [ ] **Step 6: Review the final diff and commit**

Run: `git status --short`

Run: `git diff --check`

Expected: no whitespace errors; unrelated pre-existing changes remain unstaged.

```powershell
git add -- TASK.md
git commit -m "docs: record practice sync completion"
```
