# Codex AI Bridge and Chat Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe loopback bridge to the signed-in local Codex App Server, daily cached learning analysis, on-demand error explanations, and a responsive Japanese chat drawer without exposing credentials or tool execution.

**Architecture:** A dependency-free Node process owns App Server stdio and exposes only bounded localhost HTTP operations. The browser keeps deterministic learning output available at all times, validates every AI result against its submitted context, and stores only structured caches locally. Chat sends at most six recent turns and never changes FSRS.

**Tech Stack:** Node.js built-ins, Codex App Server JSONL protocol, Next.js 16.3 static export, React 19.2, Web Crypto, Node test runner, CSS Modules.

## Global Constraints

- Read the installed Codex App Server schema and relevant Next.js client-component guide before editing.
- Keep `output: "export"`; do not create a Next.js server route for Codex.
- Bind only `127.0.0.1`; validate Origin, nonce, body size, operation name, and timeout.
- Reject approvals, tool calls, shell access, filesystem mutation, MCP, and web search.
- Never send Codex/ChatGPT credentials, sync keys, full storage exports, or events outside the 3-day period to the browser or cloud.
- Learning analysis uses at most 5 weak items, 3 findings, and 1 action, and at most one new AI analysis per local calendar day.
- Chat sends at most 6 recent turns and asks for 3 concise points by default.
- Do not add packages, deploy, or modify global settings.

---

## File Map

- Create `scripts/ai-bridge/app-server-client.mjs`: JSONL stdio client and turn lifecycle.
- Create `scripts/ai-bridge/server.mjs`: loopback HTTP boundary and NDJSON streaming.
- Create `scripts/ai-bridge/prompt-contracts.mjs`: fixed system prompts and response envelopes.
- Create `src/ai/local-ai-client.ts`: typed browser client.
- Create `src/ai/ai-request-router.ts`: zero-token routing and context trimming.
- Create `src/ai/ai-cache.ts`: canonical SHA-256 keys and structured caches.
- Create `app/hooks/useAiCoach.ts`: deterministic-first orchestration.
- Create `app/components/AiChatDrawer.tsx`, `app/components/AiConnectionStatus.tsx`: UI.
- Modify `app/components/LearningRecommendationCard.tsx`, pages, CSS modules: entry points.
- Modify `N4-Kotoba-Demo.cmd`, `package.json`: launch bridge and include tests.
- Create `tests/ai-bridge.test.mjs`, `tests/ai-routing.test.mjs`: protocol and browser-policy tests.

### Task 1: Freeze the supported App Server protocol subset

**Files:** Create `scripts/ai-bridge/prompt-contracts.mjs`, `tests/ai-bridge.test.mjs`; modify `package.json`.

- [ ] **Step 1: Inspect the installed protocol instead of relying on memory**

```powershell
codex app-server generate-json-schema --out output/codex-app-server-schema --experimental
rg 'initialize|thread/start|turn/start|turn/completed|agentMessage|approval' output/codex-app-server-schema
```

Record exact installed method/event names in fixtures. Keep generated schema under ignored `output/`; do not commit it.

- [ ] **Step 2: Add failing contract tests and test scripts**

Add the new test files explicitly to `npm test`. Test that prompts allow only `analyze-learning`, `chat-japanese`, and `explain-error`; demand JSON for structured operations; prohibit FSRS mutation/tools; and cap analysis/chat input.

```js
assert.deepEqual(ALLOWED_OPERATIONS, ["analyze-learning", "chat-japanese", "explain-error"]);
assert.equal(buildChatMessages(turns).length <= 12, true);
assert.equal(buildAnalysisPrompt(context).includes("maxWeakItems=5"), true);
```

- [ ] **Step 3: Run RED, implement fixed contracts, then run GREEN**

Run: `npm test -- --test-name-pattern="AI bridge contract|chat context limit"`  
Expected before implementation: FAIL. Expected after implementation: PASS.

```powershell
git add scripts/ai-bridge/prompt-contracts.mjs tests/ai-bridge.test.mjs package.json package-lock.json
git commit -m "test: define bounded Codex bridge contracts"
```

### Task 2: Implement a testable JSONL App Server client

**Files:** Create `scripts/ai-bridge/app-server-client.mjs`; modify `tests/ai-bridge.test.mjs`.

```js
export class AppServerClient {
  constructor({ spawnProcess, timeoutMs = 45_000 }) {}
  async initialize() {}
  async startThread({ model }) {}
  async *runTurn({ threadId, input, signal }) {}
  async close() {}
}
```

- [ ] **Step 1: Write failing fake-process tests**

Cover initialize handshake, request ID correlation, split stdout chunks, delta streaming, completed turn, malformed JSON, timeout, process exit, abort, and inbound approval/tool requests.

- [ ] **Step 2: Run RED**

Run: `npm test -- --test-name-pattern="AppServerClient"`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement JSONL framing and strict event handling**

Spawn `codex app-server --stdio`; write one JSON object per line. Resolve responses by ID and surface only agent-text deltas plus terminal usage/model metadata. If App Server requests approval or a tool, deny when the installed schema supports it, terminate the turn, and return `forbidden_tool_request`.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- --test-name-pattern="AppServerClient"`  
Expected: PASS.

```powershell
git add scripts/ai-bridge/app-server-client.mjs tests/ai-bridge.test.mjs
git commit -m "feat: add safe Codex app-server client"
```

### Task 3: Expose a loopback-only HTTP bridge

**Files:** Create `scripts/ai-bridge/server.mjs`; modify `tests/ai-bridge.test.mjs`.

```text
GET  /v1/status
POST /v1/session
POST /v1/analyze
POST /v1/chat
POST /v1/explain-error
POST /v1/cancel
```

- [ ] **Step 1: Write failing boundary tests**

Test bind host, allowed origins (`http://localhost:3000`, `http://127.0.0.1:3000`), short-lived session nonce, 32 KiB body limit, JSON content type, unknown route, expiry, cancellation, and NDJSON terminal records.

- [ ] **Step 2: Run RED and implement with Node built-ins**

Use `node:http`, `node:crypto`, and `AbortController`. `/v1/session` issues an in-memory random nonce only to an allowed Origin. All other POST routes require `X-N4-AI-Session`; errors must not expose command lines, paths, or credentials.

```json
{"type":"delta","text":"..."}
{"type":"done","model":"...","usage":{"inputTokens":0,"outputTokens":0}}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test -- --test-name-pattern="loopback bridge"`  
Expected: PASS.

```powershell
git add scripts/ai-bridge/server.mjs tests/ai-bridge.test.mjs
git commit -m "feat: expose bounded loopback AI bridge"
```

### Task 4: Add token-efficient browser routing and caches

**Files:** Create `src/ai/local-ai-client.ts`, `src/ai/ai-request-router.ts`, `src/ai/ai-cache.ts`, `tests/ai-routing.test.mjs`.

```ts
export type AiOperation = "analyze-learning" | "chat-japanese" | "explain-error";
export function routeAiRequest(input: RouteInput): { route: "local" | "ai"; reason: string };
export function trimChatContext(turns: ChatTurn[], maxTurns?: number): ChatTurn[];
export async function buildAnalysisCacheKey(input: CacheKeyInput): Promise<string>;
export class LocalAiClient { status(): Promise<AiStatus>; stream(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiChunk>; }
```

- [ ] **Step 1: Write RED tests**

Local-route dictionary lookup, vocabulary search, queue creation, statistics, and fixed hints. AI-route comparisons, explanations, analysis, and open questions. Verify six-turn trimming, canonical key stability, version/date sensitivity, and error-explanation signature reuse.

- [ ] **Step 2: Implement routing and Web Crypto SHA-256 cache keys**

Canonicalize recursively sorted object keys. Persist complete structured results only; never cache partial streams as valid. Store chat locally up to 30 messages, but exclude it from sync contracts.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -- --test-name-pattern="AI request router|AI cache|chat context"`  
Expected: PASS.

```powershell
git add src/ai tests/ai-routing.test.mjs
git commit -m "feat: route and cache AI requests efficiently"
```

### Task 5: Orchestrate deterministic-first AI analysis

**Files:** Create `app/hooks/useAiCoach.ts`; modify `src/spaced-repetition/ai-learning-analysis.ts`, `tests/spaced-repetition.test.mjs`.

- [ ] **Step 1: Add RED tests for result acceptance**

Cover daily cache hit, offline fallback, timeout fallback, malformed JSON, unknown word ID, more than 3 findings, more than 1 action, and partial stream rejection.

- [ ] **Step 2: Implement deterministic-first hook state**

```ts
type AiCoachState = {
  recommendation: LearningRecommendationViewModel;
  source: "local" | "ai" | "cache";
  status: "idle" | "connecting" | "streaming" | "offline" | "error";
  generatedAt: string;
};
```

Render local output immediately. Call AI only with sufficient evidence and no valid daily cache. Parse once after terminal chunk, apply context-aware validation, then atomically replace display/cache.

- [ ] **Step 3: Run focused tests and commit**

Run: `npm run check:fast`  
Expected: PASS.

```powershell
git add app/hooks/useAiCoach.ts src/spaced-repetition/ai-learning-analysis.ts tests/spaced-repetition.test.mjs
git commit -m "feat: add deterministic-first AI coach orchestration"
```

### Task 6: Build the chat drawer and error-explanation entry points

**Files:** Create `app/components/AiChatDrawer.tsx`, `app/components/AiConnectionStatus.tsx`; modify recommendation card, pages, and CSS modules.

- [ ] **Step 1: Read Next client-component guidance**

Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`; keep browser APIs in client components.

- [ ] **Step 2: Implement accessible drawer behavior**

Mobile opens from bottom; desktop from right. Include context label, streamed response, Stop, Retry, Clear, connection status, preset questions, focus trap, Escape close, and focus restoration. Mark responses `依據你的學習紀錄` or `一般日文說明`.

- [ ] **Step 3: Add on-demand “為什麼錯？”**

Show local correct answer first. Only the explicit button calls `explain-error`; cache by `wordId + skill + normalizedAnswer + errorTypes + promptVersion`. Never feed explanation into rating.

- [ ] **Step 4: Verify responsive behavior and commit**

Run `npm run dev`; inspect 390px/768px for no overflow, controls >=44px, Escape/focus return, and working study with bridge stopped.

```powershell
git add app/components app/page.tsx app/home/page.tsx app/demo.module.css app/home/home.module.css
git commit -m "feat: add AI chat drawer and error explanations"
```

### Task 7: Launch both local processes and finish verification

**Files:** Modify `N4-Kotoba-Demo.cmd`, `package.json`, `TASK.md`.

- [ ] **Step 1: Add local scripts and launcher health check**

Add `dev:ai-bridge`; make the Windows launcher start the hidden bridge, wait for `/v1/status`, then start Next. Preserve port-collision handling and show actionable Codex-not-installed/not-signed-in messages.

- [ ] **Step 2: Run full verification**

Run: `npm run verify`  
Expected: lint, all tests, TypeScript, and static export PASS.

- [ ] **Step 3: Update status and commit**

Update `TASK.md` with completed AI bridge/chat status and set encrypted device sync as next.

```powershell
git add N4-Kotoba-Demo.cmd package.json package-lock.json TASK.md
git commit -m "feat: launch the local Codex learning assistant"
```
