# Codex ChatGPT Usage Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 強制 N4 ことば帳的 AI 只使用 ChatGPT／Codex 方案額度，並在 AI 抽屜顯示用量百分比與重置時間。

**Architecture:** 延伸既有 `codex app-server` JSON-RPC client，以 `account/read` 阻擋 API key／未登入模式，以 `account/rateLimits/read` 建立白名單化用量快照。AI bridge 透過 `/v1/status` 提供快照，瀏覽器端只在抽屜開啟與 AI 完成後刷新，不保存帳號或用量資料。

**Tech Stack:** Next.js 16.3、React 19、TypeScript 5.9、Node.js ESM、Node test runner、Codex App Server JSON-RPC

**Spec:** `docs/superpowers/specs/2026-08-20-codex-chatgpt-usage-design.md`

## Global Constraints

- 下一個工作階段使用 `gpt-5.6-luna`，reasoning effort 設為 `high`。
- 開始前完整閱讀根目錄 `AGENTS.md`、`TASK.md`、本計畫與 spec。
- 寫 React／Next.js 程式前閱讀 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`。
- 只修改本計畫列出的 AI 檔案與 `TASK.md`；不要整理目前大量未提交的使用者修改。
- 若目標檔案在開始時已有修改，先執行 `git diff -- <file>`，保留既有內容並只做最小補丁。
- 不新增套件、不部署、不修改全域 Codex 設定、不讀取 Codex auth cache。
- 不將 email、token、完整 account payload 或 bridge session token傳到瀏覽器。
- AI 失敗不得阻塞單字、音訊、FSRS 或本機推薦。
- UI 必須在 390px 無水平捲動；觸控按鈕至少 44px；狀態不能只依賴顏色。
- 採 TDD：每個行為先建立失敗測試，再做最小實作。
- 目前 `TASK.md` 已有使用者修改；完成時更新內容，但除非能隔離自己的 hunk，否則不要把整份 `TASK.md` 一起提交。

---

### Task 1: 建立安全的 Codex 用量資料模型

**Files:**
- Create: `scripts/ai-bridge/codex-usage.mjs`
- Modify: `tests/ai-bridge.test.mjs`

**Interfaces:**
- Consumes: Codex App Server `account/read` 與 `account/rateLimits/read` 的原始 result。
- Produces: `normalizeCodexUsage(accountResult, rateLimitResult, nowMs)` 與 `requireChatGptAccount(accountResult)`。
- Produces snapshot shape:

```js
{
  connected: true,
  authMode: "chatgpt",
  planType: "pro" | null,
  primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: "2026-08-20T06:30:00.000Z" } | null,
  secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: "2026-08-27T06:30:00.000Z" } | null,
  fetchedAt: "2026-08-20T06:00:00.000Z"
}
```

- [ ] **Step 1: 在 `tests/ai-bridge.test.mjs` 加入正規化與拒絕測試**

```js
import {
  normalizeCodexUsage,
  requireChatGptAccount,
} from "../scripts/ai-bridge/codex-usage.mjs";

test("Codex usage accepts ChatGPT and exposes only safe rate-limit fields", () => {
  const accountResult = {
    account: { type: "chatgpt", email: "hidden@example.com", planType: "pro" },
    requiresOpenaiAuth: true,
  };
  const rateLimitResult = {
    rateLimits: {
      limitId: "codex",
      primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: 1787217000 },
      secondary: null,
      rateLimitReachedType: null,
    },
    secret: "must-not-leak",
  };
  assert.deepEqual(
    normalizeCodexUsage(accountResult, rateLimitResult, Date.parse("2026-08-20T06:00:00.000Z")),
    {
      connected: true,
      authMode: "chatgpt",
      planType: "pro",
      primary: {
        usedPercent: 25,
        windowDurationMins: 15,
        resetsAt: new Date(1787217000 * 1000).toISOString(),
      },
      secondary: null,
      fetchedAt: "2026-08-20T06:00:00.000Z",
    },
  );
});

test("Codex usage rejects API-key and signed-out accounts", () => {
  assert.throws(
    () => requireChatGptAccount({ account: { type: "apiKey" }, requiresOpenaiAuth: true }),
    /codex_chatgpt_login_required/,
  );
  assert.throws(
    () => requireChatGptAccount({ account: null, requiresOpenaiAuth: true }),
    /codex_chatgpt_login_required/,
  );
});
```

- [ ] **Step 2: 執行測試並確認因模組不存在而失敗**

Run:

```powershell
node --experimental-strip-types --test tests/ai-bridge.test.mjs
```

Expected: FAIL，指出找不到 `scripts/ai-bridge/codex-usage.mjs`。

- [ ] **Step 3: 建立純資料驗證與正規化模組**

```js
function usageError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function requireChatGptAccount(accountResult) {
  if (accountResult?.account?.type !== "chatgpt") {
    throw usageError("codex_chatgpt_login_required");
  }
  return accountResult.account;
}

export function normalizeCodexUsage(accountResult, rateLimitResult, nowMs = Date.now()) {
  const account = requireChatGptAccount(accountResult);
  const limits = rateLimitResult?.rateLimits;
  return {
    connected: true,
    authMode: "chatgpt",
    planType: typeof account.planType === "string" ? account.planType : null,
    primary: normalizeWindow(limits?.primary),
    secondary: normalizeWindow(limits?.secondary),
    fetchedAt: new Date(nowMs).toISOString(),
  };
}

function normalizeWindow(value) {
  if (!value || typeof value !== "object") return null;
  const usedPercent = Number(value.usedPercent);
  const windowDurationMins = Number(value.windowDurationMins);
  const resetsAt = Number(value.resetsAt);
  if (!Number.isFinite(usedPercent)
    || !Number.isFinite(windowDurationMins)
    || !Number.isFinite(resetsAt)) return null;
  return {
    usedPercent: Math.min(100, Math.max(0, Math.round(usedPercent))),
    windowDurationMins: Math.max(0, Math.round(windowDurationMins)),
    resetsAt: new Date(resetsAt * 1000).toISOString(),
  };
}
```

- [ ] **Step 4: 補上 malformed window 測試並確認通過**

加入：

```js
test("Codex usage ignores malformed rate-limit windows", () => {
  const result = normalizeCodexUsage(
    { account: { type: "chatgpt", planType: "plus" }, requiresOpenaiAuth: true },
    {
      rateLimits: {
        primary: { usedPercent: "invalid", windowDurationMins: 15, resetsAt: 1787217000 },
        secondary: null,
      },
    },
    Date.parse("2026-08-20T06:00:00.000Z"),
  );
  assert.equal(result.primary, null);
});
```

再執行：

```powershell
node --experimental-strip-types --test tests/ai-bridge.test.mjs
```

Expected: PASS。

- [ ] **Step 5: 只提交 Task 1 的乾淨檔案**

```powershell
git add -- scripts/ai-bridge/codex-usage.mjs tests/ai-bridge.test.mjs
git commit -m "feat: normalize Codex ChatGPT usage"
```

若 `tests/ai-bridge.test.mjs` 在 session 開始前已有使用者修改，停止提交但繼續保留完成的工作，並在交接中說明。

---

### Task 2: 在每次模型呼叫前強制 ChatGPT／Codex 登入

**Files:**
- Modify: `scripts/ai-bridge/app-server-client.mjs`
- Modify: `tests/ai-bridge.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `requireChatGptAccount()` 與 `normalizeCodexUsage()`。
- Produces: `AppServerClient.requireChatGptAccount()`、`AppServerClient.readCodexUsage()`。
- Changes: `createAppServerModel(client).complete()` 在每次 turn 前驗證帳號；驗證失敗不得送出 `thread/start` 或 `turn/start`。

- [ ] **Step 1: 擴充 fake App Server，回應帳號與用量 RPC**

在 `successfulFakeProcess()` 的 callback 加入：

```js
if (message.method === "account/read") {
  process.send({
    id: message.id,
    result: { account: { type: "chatgpt", planType: "pro" }, requiresOpenaiAuth: true },
  });
}
if (message.method === "account/rateLimits/read") {
  process.send({
    id: message.id,
    result: {
      rateLimits: {
        limitId: "codex",
        primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: 1787217000 },
        secondary: null,
        rateLimitReachedType: null,
      },
    },
  });
}
```

- [ ] **Step 2: 加入 API key 不可啟動 thread 的失敗測試**

```js
test("App Server model refuses API-key auth before starting a thread", async () => {
  const process = new FakeAppServerProcess((message, child) => {
    if (message.method === "initialize") {
      child.send({ id: message.id, result: { codexHome: "C:/codex" } });
    }
    if (message.method === "account/read") {
      child.send({
        id: message.id,
        result: { account: { type: "apiKey" }, requiresOpenaiAuth: true },
      });
    }
  });
  const client = new AppServerClient({ spawnProcess: () => process });
  const model = createAppServerModel(client);

  await assert.rejects(
    () => model.complete({ prompt: "不得使用 API key" }),
    /codex_chatgpt_login_required/,
  );
  assert.equal(process.messages.some((message) => message.method === "thread/start"), false);
  await model.close();
});
```

- [ ] **Step 3: 執行測試並確認 API key 測試失敗**

```powershell
node --experimental-strip-types --test tests/ai-bridge.test.mjs
```

Expected: FAIL，因 `createAppServerModel.complete()` 尚未檢查帳號。

- [ ] **Step 4: 在 AppServerClient 增加 RPC 方法並於 complete 前強制檢查**

在檔案頂端匯入：

```js
import { normalizeCodexUsage, requireChatGptAccount } from "./codex-usage.mjs";
```

在 class 中新增：

```js
async requireChatGptAccount() {
  await this.initialize();
  const accountResult = await this.request("account/read", { refreshToken: false });
  return requireChatGptAccount(accountResult);
}

async readCodexUsage() {
  await this.initialize();
  const accountResult = await this.request("account/read", { refreshToken: false });
  requireChatGptAccount(accountResult);
  const rateLimitResult = await this.request("account/rateLimits/read", {});
  return normalizeCodexUsage(accountResult, rateLimitResult);
}
```

把 `createAppServerModel()` 改成每次呼叫前檢查，並避免失敗的 thread promise 永久卡住：

```js
export function createAppServerModel(client) {
  let threadPromise;
  return {
    async complete({ prompt, signal }) {
      await client.requireChatGptAccount();
      try {
        threadPromise ??= client.startThread();
        const { threadId } = await threadPromise;
        return client.runTurn({ threadId, input: prompt, signal });
      } catch (error) {
        threadPromise = undefined;
        throw error;
      }
    },
    close: () => client.close(),
  };
}
```

- [ ] **Step 5: 補上 ChatGPT 正常與重試測試**

在既有 `App Server model reuses one ephemeral thread for chat turns` 加入：

```js
assert.equal(process.messages.some((message) => message.method === "account/read"), true);
```

再加入：

```js
test("App Server model can retry after ChatGPT login", async () => {
  let signedIn = false;
  const process = new FakeAppServerProcess((message, child) => {
    if (message.method === "initialize") child.send({ id: message.id, result: { codexHome: "C:/codex" } });
    if (message.method === "account/read") {
      child.send({
        id: message.id,
        result: signedIn
          ? { account: { type: "chatgpt", planType: "plus" }, requiresOpenaiAuth: true }
          : { account: null, requiresOpenaiAuth: true },
      });
    }
    if (message.method === "thread/start") {
      child.send({ id: message.id, result: { thread: { id: "thread-after-login" }, model: "codex-default" } });
    }
  });
  const client = new AppServerClient({ spawnProcess: () => process });
  const model = createAppServerModel(client);

  await assert.rejects(() => model.complete({ prompt: "第一次" }), /codex_chatgpt_login_required/);
  signedIn = true;
  const stream = await model.complete({ prompt: "第二次" });
  assert.equal(typeof stream[Symbol.asyncIterator], "function");
  assert.equal(process.messages.filter((message) => message.method === "thread/start").length, 1);
  await model.close();
});
```

Task 2 會讓 runtime 的自訂 client 也必須符合新介面；在既有 `AI bridge runtime sends browser chat through the App Server model` 測試 stub 加入：

```js
async requireChatGptAccount() { return { type: "chatgpt", planType: "pro" }; },
```

- [ ] **Step 6: 執行 AI bridge 測試**

```powershell
node --experimental-strip-types --test tests/ai-bridge.test.mjs
```

Expected: PASS。

- [ ] **Step 7: 提交 Task 2**

```powershell
git add -- scripts/ai-bridge/app-server-client.mjs tests/ai-bridge.test.mjs
git commit -m "feat: require ChatGPT Codex auth for AI turns"
```

---

### Task 3: 透過 AI bridge 安全公開 Codex 用量狀態

**Files:**
- Modify: `scripts/ai-bridge/runtime.mjs`
- Modify: `scripts/ai-bridge/server.mjs`
- Modify: `scripts/ai-bridge/chat-adapter.mjs`
- Modify: `scripts/ai-bridge/learning-analysis-adapter.mjs`
- Modify: `src/ai/local-ai-client.ts`
- Modify: `tests/ai-bridge.test.mjs`
- Modify: `tests/ai-chat.test.mjs`

**Interfaces:**
- Produces bridge response: `{ ok, connected, reason?, usage? }` from `GET /v1/status`。
- Produces browser type: `CodexUsageSnapshot` and expanded `AiStatus`。
- Preserves known fallback reason `codex_chatgpt_login_required`；其他未知錯誤仍映射為 `ai_unavailable`。

- [ ] **Step 1: 先加入 `/v1/status` 安全欄位測試**

```js
test("AI bridge status exposes safe Codex usage without account secrets", async () => {
  const bridge = await startAiBridgeServer({
    port: 0,
    adapter: { async analyze() { return { source: "baseline", reason: "unused" }; } },
    usageProvider: {
      async read() {
        return {
          connected: true,
          authMode: "chatgpt",
          planType: "pro",
          primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: "2026-08-20T06:30:00.000Z" },
          secondary: null,
          fetchedAt: "2026-08-20T06:00:00.000Z",
        };
      },
    },
  });
  try {
    const response = await fetch(`${bridge.url}/v1/status`, {
      headers: { Origin: "http://localhost:3000" },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.usage.authMode, "chatgpt");
    assert.equal(JSON.stringify(body).includes("email"), false);
    assert.equal(JSON.stringify(body).includes("token"), false);
  } finally {
    await bridge.close();
  }
});
```

- [ ] **Step 2: 加入未登入狀態與 LocalAiClient 解析測試**

在 `tests/ai-chat.test.mjs` 加入未登入測試：

```js
test("LocalAiClient status reports ChatGPT login requirement", async () => {
  const client = new LocalAiClient({
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      connected: false,
      reason: "codex_chatgpt_login_required",
      usage: null,
    }), { status: 200 }),
  });
  assert.deepEqual(await client.status(), {
    ok: true,
    connected: false,
    reason: "codex_chatgpt_login_required",
    usage: null,
  });
});
```

再加入正常狀態白名單測試：

```js
test("LocalAiClient status parses safe Codex usage fields", async () => {
  const client = new LocalAiClient({
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      connected: true,
      email: "must-not-survive@example.com",
      usage: {
        connected: true,
        authMode: "chatgpt",
        planType: "pro",
        primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: "2026-08-20T06:30:00.000Z" },
        secondary: null,
        fetchedAt: "2026-08-20T06:00:00.000Z",
        accessToken: "must-not-survive",
      },
    }), { status: 200 }),
  });
  const status = await client.status();
  assert.equal(status.connected, true);
  assert.equal(status.usage.planType, "pro");
  assert.equal(Object.hasOwn(status, "email"), false);
  assert.equal(Object.hasOwn(status.usage, "accessToken"), false);
});
```

- [ ] **Step 3: 執行測試並確認失敗**

```powershell
node --experimental-strip-types --test tests/ai-bridge.test.mjs tests/ai-chat.test.mjs
```

Expected: FAIL，因 server 尚不接受 `usageProvider`，client 也尚未解析 usage。

- [ ] **Step 4: 將 usageProvider 接到 runtime 與 `/v1/status`**

`runtime.mjs` 建立：

```js
const usageProvider = { read: () => client.readCodexUsage() };
const bridge = await startAiBridgeServer({ adapter, chatAdapter, usageProvider, host, port });
```

`server.mjs` 的 status route 改為 await provider，成功時回傳：

```js
sendJson(response, 200, {
  ok: true,
  connected: true,
  usage,
}, origin, dependencies.allowedOrigins);
```

若錯誤 code 為 `codex_chatgpt_login_required`，回傳 HTTP 200 與：

```js
{
  ok: true,
  connected: false,
  reason: "codex_chatgpt_login_required",
  usage: null,
}
```

bridge 本身無法連線時瀏覽器 fetch 失敗，維持 `{ ok: false, connected: false, usage: null }`。

- [ ] **Step 5: 在 LocalAiClient 增加嚴格、安全的型別解析**

加入：

```ts
export type CodexUsageWindow = {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: string;
};

export type CodexUsageSnapshot = {
  connected: true;
  authMode: "chatgpt";
  planType: string | null;
  primary: CodexUsageWindow | null;
  secondary: CodexUsageWindow | null;
  fetchedAt: string;
};

export type AiStatus = {
  ok: boolean;
  connected: boolean;
  reason?: string;
  usage: CodexUsageSnapshot | null;
};
```

`status()` 只接受上述白名單欄位；JSON 不合法時回傳：

```ts
{ ok: false, connected: false, reason: "invalid_status", usage: null }
```

- [ ] **Step 6: 保留可辨識的登入錯誤**

在 chat／analysis adapter 的 catch 中，只允許以下安全 reason 穿透：

```js
const SAFE_FALLBACK_REASONS = new Set([
  "codex_chatgpt_login_required",
  "aborted",
  "timeout",
]);
```

其他錯誤仍轉成 `ai_unavailable`。不得把 App Server 原始訊息回傳瀏覽器。

- [ ] **Step 7: 更新 runtime test stub**

既有自訂 client 已在 Task 2 加入 `requireChatGptAccount()`；本 Task 再增加：

```js
async readCodexUsage() {
  return {
    connected: true,
    authMode: "chatgpt",
    planType: "pro",
    primary: null,
    secondary: null,
    fetchedAt: "2026-08-20T06:00:00.000Z",
  };
},
```

- [ ] **Step 8: 執行聚焦測試**

```powershell
node --experimental-strip-types --test tests/ai-bridge.test.mjs tests/ai-chat.test.mjs tests/ai-learning-adapter.test.mjs
```

Expected: PASS。

- [ ] **Step 9: 提交 Task 3**

```powershell
git add -- scripts/ai-bridge/runtime.mjs scripts/ai-bridge/server.mjs scripts/ai-bridge/chat-adapter.mjs scripts/ai-bridge/learning-analysis-adapter.mjs src/ai/local-ai-client.ts tests/ai-bridge.test.mjs tests/ai-chat.test.mjs tests/ai-learning-adapter.test.mjs
git commit -m "feat: expose safe Codex usage status"
```

---

### Task 4: 在 AI 抽屜顯示用量與重置時間

**Files:**
- Create: `app/hooks/useCodexUsage.ts`
- Create: `app/components/codex-usage-label.ts`
- Modify: `app/components/AiChatDrawer.tsx`
- Modify: `app/components/AiChatDrawer.module.css`
- Modify: `tests/ai-chat.test.mjs`

**Interfaces:**
- Consumes: `LocalAiClient.status()`。
- Produces: `useCodexUsage(open)`，回傳 `{ state, refresh }`。
- Produces: `formatCodexUsageLabel(status, locale, timeZone)`，供 UI 與純函式測試使用。

- [ ] **Step 1: 先加入用量文案純函式測試**

```js
import { formatCodexUsageLabel } from "../app/components/codex-usage-label.ts";

test("Codex usage label includes plan, percent, and Taipei reset time", () => {
  const label = formatCodexUsageLabel({
    ok: true,
    connected: true,
    usage: {
      connected: true,
      authMode: "chatgpt",
      planType: "pro",
      primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: "2026-08-20T06:30:00.000Z" },
      secondary: null,
      fetchedAt: "2026-08-20T06:00:00.000Z",
    },
  }, "zh-TW", "Asia/Taipei");
  assert.match(label, /Codex Pro/);
  assert.match(label, /已用 25%/);
  assert.match(label, /14:30/);
});

test("Codex usage label explains ChatGPT login requirement", () => {
  assert.equal(formatCodexUsageLabel({
    ok: true,
    connected: false,
    reason: "codex_chatgpt_login_required",
    usage: null,
  }), "請先用 ChatGPT 登入 Codex；本功能不使用 API key。");
});
```

- [ ] **Step 2: 執行測試並確認模組不存在**

```powershell
node --experimental-strip-types --test tests/ai-chat.test.mjs
```

Expected: FAIL，指出找不到 `codex-usage-label.ts`。

- [ ] **Step 3: 實作文案格式化函式**

```ts
import type { AiStatus, CodexUsageWindow } from "../../src/ai/local-ai-client.ts";

export function formatCodexUsageLabel(
  status: AiStatus | null,
  locale = "zh-TW",
  timeZone = "Asia/Taipei",
): string {
  if (!status) return "正在確認 Codex 用量…";
  if (status.reason === "codex_chatgpt_login_required") {
    return "請先用 ChatGPT 登入 Codex；本功能不使用 API key。";
  }
  if (!status.connected || !status.usage) {
    return "Codex AI bridge 未連線，單字學習仍可正常使用。";
  }
  const plan = status.usage.planType
    ? status.usage.planType[0].toUpperCase() + status.usage.planType.slice(1)
    : "ChatGPT";
  const parts = [`Codex ${plan}`];
  if (status.usage.primary) parts.push(formatWindow("主要用量", status.usage.primary, locale, timeZone));
  if (status.usage.secondary) parts.push(formatWindow("次要用量", status.usage.secondary, locale, timeZone));
  if (!status.usage.primary && !status.usage.secondary) parts.push("目前沒有可顯示的用量窗口");
  return parts.join("・");
}

function formatWindow(label: string, value: CodexUsageWindow, locale: string, timeZone: string): string {
  const reset = new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value.resetsAt));
  return `${label}已用 ${value.usedPercent}%・${reset} 重置`;
}
```

- [ ] **Step 4: 建立開啟時讀取、可手動刷新的 hook**

`useCodexUsage.ts` 使用一個穩定的 `LocalAiClient`，只在 `open === true` 時讀取；cleanup 時 abort，舊請求不得覆蓋新狀態：

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocalAiClient, type AiStatus } from "../../src/ai/local-ai-client.ts";

export type CodexUsageState = {
  status: AiStatus | null;
  loading: boolean;
};

export function useCodexUsage(open: boolean, client?: Pick<LocalAiClient, "status">) {
  const defaultClient = useMemo(() => new LocalAiClient(), []);
  const activeClient = client ?? defaultClient;
  const controllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<CodexUsageState>({ status: null, loading: false });

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({ ...current, loading: true }));
    const status = await activeClient.status(controller.signal);
    if (!controller.signal.aborted) setState({ status, loading: false });
  }, [activeClient]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    return () => controllerRef.current?.abort();
  }, [open, refresh]);

  return { state, refresh };
}
```

`LocalAiClient.status()` 已負責把 fetch throw 轉成 `{ ok:false, connected:false, reason:"ai_unavailable", usage:null }`，hook 不重複解析錯誤。

- [ ] **Step 5: 把狀態區加入 AiChatDrawer**

在抽屜內呼叫：

```tsx
const { state: codexUsageState, refresh: refreshCodexUsage } = useCodexUsage(open);
const usageLabel = formatCodexUsageLabel(codexUsageState.status);
const previousChatStatusRef = useRef<AiChatStatus>(status);

useEffect(() => {
  const previous = previousChatStatusRef.current;
  previousChatStatusRef.current = status;
  if (open && previous === "streaming" && status === "ready") {
    void refreshCodexUsage();
  }
}, [open, refreshCodexUsage, status]);
```

接在目前範圍文字下方：

```tsx
<p className={styles.usageStatus} role="status" aria-atomic="true">
  {usageLabel}
</p>
```

送出按鈕使用：

```tsx
disabled={!draft.trim() || codexUsageState.loading || codexUsageState.status?.connected !== true}
```

登入錯誤文字只顯示在狀態區，不建立第二個 live region。AI 回覆完成後依上述 `streaming` → `ready` effect 刷新用量。

- [ ] **Step 6: 加入 390px 安全樣式**

```css
.usageStatus {
  margin: 0;
  border: 1px solid var(--line, #d9d0c4);
  border-radius: 8px;
  background: var(--surface-raised, var(--raised, #f7f1e8));
  padding: 9px 12px;
  color: var(--muted, #655e55);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
```

不要加入水平進度條；百分比與狀態必須由文字完整表達。

- [ ] **Step 7: 執行聚焦測試與靜態檢查**

```powershell
node --experimental-strip-types --test tests/ai-chat.test.mjs
npm run check:types
npm run lint:app
```

Expected: 全部 PASS。

- [ ] **Step 8: 本機瀏覽器驗收**

同時執行：

```powershell
npm run dev
npm run dev:ai-bridge
```

驗收 ChatGPT 登入、API key／未登入、bridge 關閉三種狀態；在 390×844 與 1440×900 確認：

- 無水平捲動。
- 用量文字可換行，不遮住訊息或輸入框。
- 狀態更新不移動鍵盤焦點。
- 送出不可在登入檢查完成前啟用。
- 關閉抽屜後焦點回到 AI 助教按鈕。

- [ ] **Step 9: 提交 Task 4**

```powershell
git add -- app/hooks/useCodexUsage.ts app/components/codex-usage-label.ts app/components/AiChatDrawer.tsx app/components/AiChatDrawer.module.css tests/ai-chat.test.mjs
git commit -m "feat: show Codex usage in AI assistant"
```

---

### Task 5: 完整驗證與更新任務狀態

**Files:**
- Modify: `TASK.md`

**Interfaces:**
- Consumes: Tasks 1–4 的完整功能。
- Produces: 通過驗證的 Codex ChatGPT 用量串接與最新任務狀態。

- [ ] **Step 1: 執行完整測試**

```powershell
npm test
```

Expected: 所有既有與新增測試 PASS。

- [ ] **Step 2: 執行型別與 lint**

```powershell
npm run check:types
npm run lint:app
```

Expected: PASS，沒有新 warning／error。

- [ ] **Step 3: 執行 production build**

```powershell
npm run build
```

Expected: PASS。

- [ ] **Step 4: 檢查敏感資料與 API key 路徑**

```powershell
rg -n "email|accessToken|refreshToken|apiKey|OPENAI_API_KEY" scripts/ai-bridge src/ai app/components app/hooks
```

Expected: `refreshToken: false` 與 `apiKey` 拒絕判斷可以存在；不得有 email/token 值被寫入 bridge response、React state、localStorage 或畫面。

- [ ] **Step 5: 更新 TASK.md**

在「目前狀態」加入：

```markdown
- AI bridge 已強制使用 ChatGPT／Codex 登入額度，API key 或未登入模式不會啟動 AI turn；AI 抽屜顯示主要／次要用量百分比與重置時間，不傳送帳號 email 或 token 到瀏覽器。
```

在「下一步」保留一項實機確認：

```markdown
1. 使用者實際確認 Codex 用量百分比、重置時間與 ChatGPT 未登入提示是否符合預期。
```

保留其他仍有效的目前狀態，不重寫無關內容。

- [ ] **Step 6: 檢查最終 diff 範圍**

```powershell
git diff -- scripts/ai-bridge/codex-usage.mjs scripts/ai-bridge/app-server-client.mjs scripts/ai-bridge/runtime.mjs scripts/ai-bridge/server.mjs scripts/ai-bridge/chat-adapter.mjs scripts/ai-bridge/learning-analysis-adapter.mjs src/ai/local-ai-client.ts app/hooks/useCodexUsage.ts app/components/codex-usage-label.ts app/components/AiChatDrawer.tsx app/components/AiChatDrawer.module.css tests/ai-bridge.test.mjs tests/ai-chat.test.mjs tests/ai-learning-adapter.test.mjs TASK.md
```

Expected: 只有本計畫內容；不得夾帶其他 UI、FSRS、字型或資料格式修改。

- [ ] **Step 7: 處理 TASK.md 與最後提交**

若 `TASK.md` 的使用者既有修改無法安全隔離，不提交該檔並在交接說明。其餘乾淨變更若尚未提交：

```powershell
git status --short
```

只 stage 本計畫建立或從 session 開始時乾淨的檔案，提交訊息：

```powershell
git commit -m "feat: integrate Codex ChatGPT usage"
```

## 下一個 Session 啟動提示

在新的 Codex session 選擇 `gpt-5.6-luna`、reasoning `high`，貼上：

```text
請依 D:\APP\n4-kotoba-demo\docs\superpowers\plans\2026-08-20-codex-chatgpt-usage-integration.md 執行。
先完整閱讀 D:\APP\n4-kotoba-demo\AGENTS.md、TASK.md、對應 spec 與計畫，使用 superpowers:executing-plans，採 TDD 逐 task 完成。
工作樹已有大量使用者修改；保留所有無關變更，只修改計畫列出的 AI 檔案與 TASK.md。不要新增套件、不要部署、不要使用 OpenAI API key。完成前執行 npm test、npm run check:types、npm run lint:app、npm run build，並驗收 390px。
```
