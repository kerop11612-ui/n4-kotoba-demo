# AI Chat Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首頁與單元頁加入可及性的 AI 聊天抽屜，支援本機對話保存、串流／停止／重試／清除，並透過既有 loopback bridge 提供安全 fallback。

**Architecture:** 以 `src/ai/chat.ts` 定義可序列化的 chat request、訊息與 NDJSON record，純函式負責輸入限制、最近 6 輪與最近 30 則保存。`LocalAiClient` 只負責 bridge transport；`useAiChat` 管理頁面狀態與 AbortController；`AiChatDrawer` 只負責呈現與鍵盤互動。bridge 的 `/v1/chat` 只接受已驗證 session 與白名單欄位，沒有 chat adapter 時回傳可理解的 fallback，不影響原有 `/v1/analyze`。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Node `node:test`、既有 NDJSON loopback bridge、CSS Modules、localStorage。

## Global Constraints

- 使用繁體中文 UI 文案；保留現有學習資料格式與 FSRS 行為。
- 不新增套件、不部署、不修改全域設定，不把 Codex token、API key、同步金鑰或完整 storage export 傳給瀏覽器以外的服務。
- Chat request 問題最多 500 個 Unicode 字元；送往 bridge 的歷史最多最近 6 輪；本機保存最多 30 則訊息。
- AI 失敗、逾時、停止或 bridge 不存在時，單字瀏覽、複習、FSRS 排程與本機保存必須繼續可用。
- 390px 使用底部近全高 drawer，768px 使用右側 drawer；不得產生水平捲動。
- 抽屜互動按鈕最小高度 44px；開啟時焦點進入輸入框，Escape 關閉並返回觸發按鈕。
- 每個 production 行為先新增會失敗的測試，再寫最小實作；每個任務完成後執行聚焦測試。

---

### Task 1: Chat transport contract and loopback bridge

**Files:**
- Create: `src/ai/chat.ts`
- Modify: `src/ai/local-ai-client.ts`
- Modify: `scripts/ai-bridge/server.mjs`
- Create: `scripts/ai-bridge/chat-adapter.mjs`
- Modify: `tests/ai-learning-adapter.test.mjs`
- Create: `tests/ai-chat.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `src/ai/chat.ts` produces `AiChatMessage`, `AiChatContext`, `AiChatRequest`, `AiChatRecord`, `normalizeChatQuestion`, `buildChatRequest`, `appendChatMessage`, and `toBridgeMessages`.
- `LocalAiClient.chatJapanese(request, signal?)` consumes `AiChatRequest` and yields `AiChatRecord`.
- `startAiBridgeServer({ adapter, chatAdapter })` accepts an optional `chatAdapter.chat(request, { signal })`; existing analysis behavior remains unchanged.
- `createChatAdapter({ model, timeoutMs, clock })` produces `chat(request, { signal })`, yielding `{type:"delta", text}` followed by `{type:"done", model, completedAt}` or `{type:"fallback", reason}`.

- [ ] **Step 1: Write failing pure contract tests**

Add `tests/ai-chat.test.mjs` with assertions for these exact behaviors:

```js
test("buildChatRequest rejects blank and overlong questions", () => {
  assert.throws(() => buildChatRequest({ context, messages: [], question: "   " }), /question_required/);
  assert.throws(() => buildChatRequest({ context, messages: [], question: "a".repeat(501) }), /question_too_long/);
});

test("buildChatRequest sends only the latest six conversation turns", () => {
  const request = buildChatRequest({ context, messages: twelveMessages, question: "比較兩個單字" });
  assert.equal(request.messages.length, 6);
  assert.equal(request.question, "比較兩個單字");
  assert.equal(Object.hasOwn(request, "storageExport"), false);
});

test("appendChatMessage trims local history to thirty messages", () => {
  const next = appendChatMessage(Array.from({ length: 30 }, messageAt), messageAt(30));
  assert.equal(next.length, 30);
  assert.equal(next[0].id, "message-1");
  assert.equal(next.at(-1).id, "message-30");
});
```

Use a context object containing only `scope`, `label`, `unitId`, `recentPeriodLabel`, and recommendation summary. Define helpers in the test file so the test does not depend on React or a browser.

- [ ] **Step 2: Run the pure tests and verify the expected RED failure**

Run:

```powershell
npm test -- --test-name-pattern "ChatRequest|chat history"
```

Expected: FAIL because `src/ai/chat.ts` and its named exports do not yet exist. Do not change production code until this failure is observed.

- [ ] **Step 3: Implement the minimal pure chat contract**

Create the exact types and functions:

```ts
export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type AiChatContext = {
  scope: "home" | "unit";
  label: string;
  unitId?: string;
  recentPeriodLabel: string;
  recommendation?: { title: string; reason: string; evidenceLabel: string };
};

export type AiChatRequest = {
  context: AiChatContext;
  messages: Array<Pick<AiChatMessage, "role" | "text">>;
  question: string;
};

export type AiChatRecord =
  | { type: "delta"; text: string }
  | { type: "done"; model?: string; completedAt?: string }
  | { type: "fallback"; reason: string };

export function normalizeChatQuestion(value: string): string;
export function buildChatRequest(input: { context: AiChatContext; messages: AiChatMessage[]; question: string }): AiChatRequest;
export function appendChatMessage(messages: AiChatMessage[], message: AiChatMessage): AiChatMessage[];
export function toBridgeMessages(messages: AiChatMessage[]): AiChatRequest["messages"];
```

Trim input, reject blank／overlong text, copy only whitelisted context fields, and retain the latest six messages before the new question is sent. Do not add localStorage or React behavior in this task.

- [ ] **Step 4: Run the pure tests and verify GREEN**

Run:

```powershell
npm test -- --test-name-pattern "ChatRequest|chat history"
```

Expected: all new pure contract tests pass.

- [ ] **Step 5: Write failing client and bridge transport tests**

Add tests covering:

```js
test("LocalAiClient.chatJapanese sends the bounded request and parses delta records", async () => {
  const records = [];
  for await (const record of client.chatJapanese(request)) records.push(record);
  assert.deepEqual(records, [
    { type: "delta", text: "先複習" },
    { type: "done", model: "codex-default", completedAt: "2026-08-11T00:00:00.000Z" },
  ]);
  assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)).sort(), ["context", "messages", "question"]);
});

test("loopback bridge rejects unknown chat fields and streams chat records", async () => {
  const sessionToken = await getSessionToken();
  const response = await fetch(`${bridge.url}/v1/chat`, authorizedJson(sessionToken, request));
  assert.equal(response.status, 200);
  assert.deepEqual((await readNdjson(response)).map((record) => record.type), ["delta", "done"]);
  const rejected = await fetch(`${bridge.url}/v1/chat`, authorizedJson(sessionToken, { ...request, token: "no" }));
  assert.equal(rejected.status, 400);
});
```

Use an injected fetch implementation and a fake chat adapter/model; do not call a real network service.

- [ ] **Step 6: Run transport tests and verify the expected RED failure**

Run:

```powershell
npm test -- --test-name-pattern "chatJapanese|chat records|chat fields"
```

Expected: FAIL because the client method and `/v1/chat` route are missing.

- [ ] **Step 7: Implement client, adapter, and bridge route**

In `LocalAiClient`, reuse `ensureSession`, POST JSON to `/v1/chat`, enforce `application/x-ndjson`, parse only `delta`, `done`, and `fallback`, and clear the session on HTTP 401. In `server.mjs`, validate the existing origin/session/content-type/body limits and require exactly `context`, `messages`, and `question`; never pass arbitrary fields to the adapter.

In `chat-adapter.mjs`, build a prompt from the whitelisted context and bounded messages, collect model delta events with the existing timeout pattern, cap the accumulated answer at 20,000 characters, and yield a fallback record on timeout, abort, incomplete stream, or model failure. The adapter must not write FSRS or learning records.

Add the new `tests/ai-chat.test.mjs` file to the existing `package.json` test command.

- [ ] **Step 8: Run all transport tests and refactor only after GREEN**

Run:

```powershell
npm test -- --test-name-pattern "chat|AI coach"
```

Expected: all chat tests and existing AI bridge tests pass. Refactor duplicated NDJSON parsing only if the test output remains green.

- [ ] **Step 9: Commit the transport slice**

```powershell
git add src/ai/chat.ts src/ai/local-ai-client.ts scripts/ai-bridge/server.mjs scripts/ai-bridge/chat-adapter.mjs tests/ai-chat.test.mjs tests/ai-learning-adapter.test.mjs package.json
git commit -m "feat: add bounded AI chat transport"
```

### Task 2: Local chat state and persistence hook

**Files:**
- Create: `app/hooks/useAiChat.ts`
- Modify: `tests/ai-chat.test.mjs`

**Interfaces:**
- `useAiChat({ context, client?, storage?, enabled? })` produces `{ messages, draft, setDraft, status, error, isOpen, open, close, send, stop, retry, clear }`.
- The hook uses the Task 1 `AiChatMessage`, `AiChatContext`, `AiChatRecord`, and `AiChatClient` types.
- Export pure helpers `createChatState`, `reduceChatRecord`, `loadChatMessages`, and `saveChatMessages` for Node tests.

- [ ] **Step 1: Write failing state tests**

Add tests for:

```js
test("reduceChatRecord accumulates streaming deltas and completes", () => {
  let state = createChatState("context-key");
  state = reduceChatRecord(state, { type: "delta", text: "先" });
  state = reduceChatRecord(state, { type: "delta", text: "複習" });
  state = reduceChatRecord(state, { type: "done", model: "default" });
  assert.equal(state.status, "ready");
  assert.equal(state.messages.at(-1).text, "先複習");
});

test("fallback state keeps the user message and exposes retryable error", () => {
  const state = reduceChatRecord({ ...createChatState("context-key"), status: "streaming", messages: [userMessage] }, { type: "fallback", reason: "ai_unavailable" });
  assert.equal(state.status, "error");
  assert.equal(state.messages[0].text, userMessage.text);
  assert.equal(state.error, "ai_unavailable");
});

test("loadChatMessages ignores malformed storage and caps history", () => {
  const result = loadChatMessages("not-json");
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: Run state tests and verify RED**

Run:

```powershell
npm test -- --test-name-pattern "streaming deltas|retryable error|malformed storage"
```

Expected: FAIL because `useAiChat.ts` and its pure helpers are missing.

- [ ] **Step 3: Implement the minimal hook and helpers**

Use a `Map`-compatible storage interface with `getItem`, `setItem`, and `removeItem`, defaulting to browser `localStorage` only inside effects/callbacks. Persist under a versioned key such as `n4-kotoba:ai-chat:v1:${context.scope}:${context.unitId ?? "home"}`. Store only validated `AiChatMessage` values and trim to 30 messages.

The `send` flow must validate the draft, append one user message, create an AbortController, set `streaming`, append one assistant placeholder, accumulate `delta` text, and end in `ready` or `error`. `stop` aborts without deleting messages. `retry` reuses the last user question without appending a duplicate user message. `clear` removes storage and resets messages. `open` and `close` only control drawer state.

- [ ] **Step 4: Run state tests and verify GREEN**

Run:

```powershell
npm test -- --test-name-pattern "streaming deltas|retryable error|malformed storage"
```

Expected: all state tests pass.

- [ ] **Step 5: Add hook integration tests with a fake client and run all chat tests**

Test that `send` uses the bounded request from Task 1, `stop` calls AbortController, retry does not duplicate the user message, and localStorage failures do not reject the send operation. Keep the fake client in the test file; do not add production mock branches.

Run:

```powershell
npm test -- --test-name-pattern "chat"
```

- [ ] **Step 6: Commit the state slice**

```powershell
git add app/hooks/useAiChat.ts tests/ai-chat.test.mjs
git commit -m "feat: add local AI chat state"
```

### Task 3: Accessible responsive drawer and page integration

**Files:**
- Create: `app/components/AiChatDrawer.tsx`
- Create: `app/components/AiChatDrawer.module.css`
- Modify: `app/home/page.tsx`
- Modify: `app/home/home.module.css`
- Modify: `app/page.tsx`
- Modify: `app/demo.module.css`

**Interfaces:**
- `AiChatDrawer` consumes `open`, `context`, `messages`, `draft`, `status`, `error`, `onDraftChange`, `onSend`, `onStop`, `onRetry`, `onClear`, and `onClose`.
- Both pages create a context label from existing page data and pass the existing recommendation title／reason／evidence; they do not pass repository exports or FSRS card internals.

- [ ] **Step 1: Write a failing component contract test or DOM-level test fixture**

Add a small pure rendering contract assertion in `tests/ai-chat.test.mjs` for the exported action labels and status labels, then add Playwright checks after the component exists. The contract must assert that `streaming` exposes `停止產生`, `error` exposes `重試`, and every state exposes `關閉` and `清除對話`.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
npm test -- --test-name-pattern "drawer actions"
```

Expected: FAIL because the drawer action-label exports are missing.

- [ ] **Step 3: Implement the drawer with keyboard and responsive behavior**

Render nothing when closed. When open, render a backdrop and `role="dialog" aria-modal="true"`; use a ref to focus the textarea after opening and a document keydown listener for Escape. Restore focus to the opener through an `onClose` callback. Render context text, empty state, messages, preset buttons, textarea with `maxLength={500}`, send／stop／retry／clear actions, and an inline status/error message.

Use CSS Modules with `position: fixed`, `inset-inline-end: 0` and a 360px maximum desktop width; at `max-width: 767px`, anchor to the bottom with `max-height: 92dvh`, rounded top corners, and a scrollable message body. Set `overflow-wrap: anywhere`, `min-height: 44px`, and `overflow-x: hidden` only inside the drawer content; do not change the global page overflow contract.

- [ ] **Step 4: Integrate drawer and recommendation-card entry on the home page**

Replace the temporary recommendation notice with `useAiChat`. Store a ref to the recommendation card secondary button or pass an explicit opener callback. On `onAskWhy`, call `open("為什麼推薦這個？")`. Render the drawer once near the end of the page with a home context label and current recommendation summary. Use `sourceLabel` and recommendation data only; do not wait for AI before rendering the page.

- [ ] **Step 5: Integrate drawer and recommendation-card entry on the unit page**

Replace the temporary `setMessage("聊天抽屜將於下一輪加入。")` callback with `useAiChat`. Build a unit context label from `selectedSectionData`, `selectedChapter`, and `selectedSection`, and use the current recommendation summary. Keep `toggleReview` and all existing review callbacks unchanged.

- [ ] **Step 6: Run typecheck and focused lint**

Run:

```powershell
npm run check:types
npm run lint:app -- --quiet
```

Expected: both commands pass with no new warnings.

- [ ] **Step 7: Run Playwright responsive and keyboard acceptance checks**

With `npm run dev -- -p 3000` running, verify at both `/home` and `/?chapter=1&section=1`:

```text
390x844: drawer opens from 為什麼推薦？, is bottom anchored, has 關閉／清除對話／停止產生 controls, and documentElement.scrollWidth <= innerWidth.
768x1024: drawer is right anchored, recommendation card remains visible, and scrollWidth <= innerWidth.
Keyboard: opening focuses the textarea; Escape closes; focus returns to the opener; Tab reaches drawer controls without relying on pointer hover.
```

- [ ] **Step 8: Run the full verification suite**

```powershell
npm run verify
```

Expected: all tests pass, TypeScript passes, ESLint passes, and production build completes.

- [ ] **Step 9: Update task status and commit the UI slice**

Update `TASK.md` so the current status says chat drawer MVP is complete and the next step is App Server／real model wiring or sync. Then run `git diff --check` and commit only the files from this task:

```powershell
git diff --check
git add app/components/AiChatDrawer.tsx app/components/AiChatDrawer.module.css app/home/page.tsx app/home/home.module.css app/page.tsx app/demo.module.css TASK.md
git commit -m "feat: add responsive AI chat drawer"
```
