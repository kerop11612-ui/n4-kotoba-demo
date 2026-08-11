# Encrypted Two-Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize learning progress, favorites, preferences, and structured AI caches between two personal computers with device-side encryption and deterministic conflict convergence.

**Architecture:** Review events become the append-only source of truth. Each browser owns a non-extractable ECDSA device key and a shared non-extractable AES-GCM vault key in IndexedDB. A separate Cloudflare Worker stores ciphertext and public metadata only; devices verify, decrypt, merge, and replay locally. This plan creates and tests the Worker but does not deploy it.

**Tech Stack:** TypeScript, Web Crypto, IndexedDB, Node Web Crypto tests, Cloudflare Worker/D1-compatible JavaScript, existing FSRS adapter, Node test runner.

## Global Constraints

- Preserve local-first atomic commits; AI and sync never block an answer.
- D1 must never receive plaintext learning content, vault keys, device private keys, Codex credentials, or chat transcripts.
- Do not overwrite whole storage blobs. Merge append-only events and per-key records.
- Replay order is `reviewedAt`, then device sequence, then event ID.
- Decryption or signature failure quarantines the envelope and preserves current local state.
- Pairing codes are high entropy, single-use, short-lived, and shown with an offline recovery warning.
- Do not add packages, deploy, or modify global configuration.

---

## File Map

- Modify `src/spaced-repetition/types.ts`, `src/storage/memory-migration.ts`: sync-safe event identity/schema migration.
- Create `src/spaced-repetition/replay-review-events.ts`: deterministic FSRS replay.
- Create `src/sync/types.ts`, `src/sync/crypto.ts`, `src/sync/merge.ts`: envelopes, cryptography, convergence.
- Create `src/storage/sync-state-repository.ts`: device keys, cursor, outbox, quarantine.
- Create `src/sync/sync-client.ts`: signed push/pull/pairing/lease client.
- Create `sync-worker/worker.mjs`, `sync-worker/schema.sql`, `sync-worker/wrangler.toml.example`: undeployed Worker.
- Create `app/hooks/useDeviceSync.ts`, `app/components/SyncStatus.tsx`, `app/components/SyncPairingDialog.tsx`: UI.
- Modify `app/home/page.tsx`, `app/home/home.module.css`: sync management.
- Create `tests/sync-crypto.test.mjs`, `tests/sync-merge.test.mjs`, `tests/sync-worker.test.mjs`.

### Task 1: Upgrade review events for deterministic replay

**Files:** Modify `src/spaced-repetition/types.ts`, `src/storage/memory-migration.ts`, `tests/spaced-repetition.test.mjs`; create `src/spaced-repetition/replay-review-events.ts`.

```ts
export type SyncEventIdentity = {
  eventId: string;
  deviceId: string;
  deviceSequence: number;
};
export function compareReviewEvents(a: VocabularyReviewEvent, b: VocabularyReviewEvent): number;
export function replayReviewEvents(seed: WordMemoryRecord | null, events: VocabularyReviewEvent[]): WordMemoryRecord;
```

- [ ] **Step 1: Write RED migration and convergence tests**

Cover stable identity generation, legacy event migration, duplicate IDs, shuffled input, same timestamp tie-breaking, and two devices reaching identical memory.

- [ ] **Step 2: Implement schema migration and replay**

Assign deterministic legacy IDs from canonical legacy event fields. New events receive random `eventId`, stable local `deviceId`, and monotonic `deviceSequence`. Sort a copy; never mutate caller input. Replay through the existing FSRS transition function.

- [ ] **Step 3: Run required FSRS tests and commit**

Run: `npm test`  
Expected: all core and vocabulary tests PASS.

```powershell
git add src/spaced-repetition/types.ts src/storage/memory-migration.ts src/spaced-repetition/replay-review-events.ts tests/spaced-repetition.test.mjs
git commit -m "feat: make review events replayable across devices"
```

### Task 2: Implement vault encryption and device signatures

**Files:** Create `src/sync/types.ts`, `src/sync/crypto.ts`, `tests/sync-crypto.test.mjs`; modify `package.json`.

```ts
export async function createVault(): Promise<{ vaultId: string; vaultKey: CryptoKey }>;
export async function createDeviceIdentity(): Promise<DeviceIdentity>;
export async function encryptEnvelope(key: CryptoKey, header: EnvelopeHeader, value: unknown): Promise<EncryptedEnvelope>;
export async function decryptEnvelope<T>(key: CryptoKey, envelope: EncryptedEnvelope): Promise<T>;
export async function signSyncRequest(identity: DeviceIdentity, request: CanonicalSyncRequest): Promise<string>;
export async function verifySyncRequest(publicKey: JsonWebKey, request: CanonicalSyncRequest, signature: string): Promise<boolean>;
```

- [ ] **Step 1: Add RED round-trip and tamper tests**

Cover AES-GCM round trip, unique IVs, authenticated header, ciphertext tamper, wrong key, ECDSA verification, wrong device, canonical stability, and non-extractable imported runtime keys.

- [ ] **Step 2: Implement with `globalThis.crypto.subtle`**

Use AES-GCM 256 and ECDSA P-256/SHA-256. Include `vaultId`, `recordType`, `recordId`, `schemaVersion`, and `createdAt` as additional authenticated data. Export recovery material only while explicitly creating pairing, then import the normal stored key as non-extractable.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -- --test-name-pattern="sync crypto"`  
Expected: PASS.

```powershell
git add src/sync/types.ts src/sync/crypto.ts tests/sync-crypto.test.mjs package.json package-lock.json
git commit -m "feat: encrypt and sign device sync data"
```

### Task 3: Build merge rules and local sync state

**Files:** Create `src/sync/merge.ts`, `src/storage/sync-state-repository.ts`, `tests/sync-merge.test.mjs`.

```ts
export function mergeReviewEvents(local: VocabularyReviewEvent[], remote: VocabularyReviewEvent[]): VocabularyReviewEvent[];
export function mergeLwwRecords<T>(local: LwwRecord<T>[], remote: LwwRecord<T>[]): LwwRecord<T>[];
export interface SyncStateRepository {
  enqueue(records: PlainSyncRecord[]): Promise<void>;
  peekBatch(limit: number): Promise<OutboxRecord[]>;
  acknowledge(ids: string[], cursor: string): Promise<void>;
  quarantine(envelope: EncryptedEnvelope, reason: string): Promise<void>;
}
```

- [ ] **Step 1: Write RED idempotency and conflict tests**

Test duplicates, opposite merge direction, favorites/preferences tie-breaking by timestamp then device ID, cursor persistence, crash before acknowledge, and quarantine isolation.

- [ ] **Step 2: Implement pure merge and IndexedDB repository**

Use a dedicated IndexedDB database/version for device keys and sync state. Enqueue only after the existing local memory transaction succeeds; outbox failure sets pending status but never rolls back a correct local answer.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -- --test-name-pattern="sync merge|sync state"`  
Expected: PASS.

```powershell
git add src/sync/merge.ts src/storage/sync-state-repository.ts tests/sync-merge.test.mjs
git commit -m "feat: persist and merge encrypted sync changes"
```

### Task 4: Create the undeployed Cloudflare sync Worker

**Files:** Create `sync-worker/worker.mjs`, `sync-worker/schema.sql`, `sync-worker/wrangler.toml.example`, `tests/sync-worker.test.mjs`.

```text
POST /v1/vaults
POST /v1/pairing-invites
POST /v1/devices
POST /v1/records/push
GET  /v1/records/pull?cursor=...
POST /v1/analysis-leases
```

- [ ] **Step 1: Write RED Worker tests with an in-memory D1 fake**

Cover vault creation, single-use/expired invite, unknown device, ECDSA signature, timestamp skew, nonce replay, duplicate records, monotonic cursor, ciphertext opacity, lease contention, and per-device rate limit.

- [ ] **Step 2: Implement minimal Worker and schema**

Tables contain vault/device IDs, public JWK, invite hashes, nonce hashes, ciphertext envelope fields, cursor, timestamps, and lease keys. Validate signatures over method/path/timestamp/nonce/body hash. Never log request bodies or pairing secrets.

- [ ] **Step 3: Run tests and commit without deployment**

Run: `npm test -- --test-name-pattern="sync worker"`  
Expected: PASS.

```powershell
git add sync-worker tests/sync-worker.test.mjs
git commit -m "feat: add encrypted sync worker"
```

### Task 5: Implement pairing, push/pull, and daily analysis lease client

**Files:** Create `src/sync/sync-client.ts`; modify sync crypto/merge tests.

```ts
export class SyncClient {
  createPairingInvite(): Promise<PairingBundle>;
  joinPairing(bundle: PairingBundle): Promise<void>;
  pushPending(): Promise<SyncResult>;
  pullAndMerge(): Promise<SyncResult>;
  acquireAnalysisLease(day: string): Promise<"acquired" | "held-by-peer" | "offline">;
}
```

- [ ] **Step 1: Write RED two-device integration tests**

Simulate pairing, initial sync, offline answers, reconnect, concurrent reviews, favorites conflict, encrypted analysis cache sharing, one-winner lease, bad ciphertext, and retry after server error.

- [ ] **Step 2: Implement bounded batches and backoff**

Push 100 records per batch, debounce 2 seconds, pull on startup/visibility/final review/manual refresh, and use capped exponential backoff. Verify signatures before decrypting; decrypt all candidate records before applying one local merge transaction.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -- --test-name-pattern="two-device sync|analysis lease"`  
Expected: PASS.

```powershell
git add src/sync/sync-client.ts tests/sync-crypto.test.mjs tests/sync-merge.test.mjs
git commit -m "feat: sync and merge two encrypted devices"
```

### Task 6: Add pairing and low-distraction sync UI

**Files:** Create `app/hooks/useDeviceSync.ts`, `app/components/SyncStatus.tsx`, `app/components/SyncPairingDialog.tsx`; modify home page/CSS.

- [ ] **Step 1: Implement state machine and status UI**

```ts
type SyncUiStatus = "not-configured" | "syncing" | "synced" | "offline" | "merged" | "reauth-required" | "quarantined";
```

Expose manual refresh and pairing management without interrupting study. Show `衝突已合併` only when a merge actually occurred.

- [ ] **Step 2: Implement recovery-aware pairing dialog**

First device creates one high-entropy pairing/recovery code and requires acknowledgement that loss of all devices and code makes ciphertext unrecoverable. Second device imports it and registers its public key. Never render private device keys or Codex credentials.

- [ ] **Step 3: Verify accessibility and commit**

Inspect 390px/768px: no overflow, controls >=44px, dialog focus trap/Escape/return focus, and offline study remains usable.

```powershell
git add app/hooks/useDeviceSync.ts app/components/SyncStatus.tsx app/components/SyncPairingDialog.tsx app/home/page.tsx app/home/home.module.css
git commit -m "feat: add secure two-device pairing UI"
```

### Task 7: Verify, document configuration, and update status

**Files:** Modify `README.md`, `TASK.md`.

- [ ] **Step 1: Document local configuration only**

Explain D1 bindings from the example, Worker URL, second-PC pairing, offline recovery-code storage, and device disconnect. State that Cloudflare sees metadata but not plaintext. Do not publish secrets or deploy.

- [ ] **Step 2: Run full validation**

Run: `npm run verify`  
Expected: lint, all sync/core tests, TypeScript, and static build PASS.

Manually test two browser profiles: concurrent reviews converge, analysis lease has one winner, bridge/sync outages do not block answers, invalid ciphertext is quarantined.

- [ ] **Step 3: Update task and commit**

```powershell
git add README.md TASK.md
git commit -m "docs: explain encrypted two-device sync"
```
