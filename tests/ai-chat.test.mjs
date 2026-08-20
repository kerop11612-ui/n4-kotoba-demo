import assert from "node:assert/strict";
import test from "node:test";
import {
  appendChatMessage,
  buildChatRequest,
} from "../src/ai/chat.ts";
import { LocalAiClient } from "../src/ai/local-ai-client.ts";
import { startAiBridgeServer } from "../scripts/ai-bridge/server.mjs";
import { createChatAdapter } from "../scripts/ai-bridge/chat-adapter.mjs";
import {
  createChatState,
  loadChatMessages,
  reduceChatRecord,
} from "../app/hooks/useAiChat.ts";
import { getAiChatDrawerActions } from "../app/components/ai-chat-drawer-actions.ts";
import { getAiChatFabProps } from "../app/components/ai-chat-fab-actions.ts";

const context = {
  scope: "home",
  label: "全部單字",
  unitId: undefined,
  recentPeriodLabel: "最近 3 天",
  recommendation: {
    title: "先複習容易混淆的單字",
    reason: "最近答題表現需要再鞏固",
    evidenceLabel: "30 天保持率 40%",
  },
};

function messageAt(index) {
  return {
    id: `message-${index}`,
    role: index % 2 === 0 ? "assistant" : "user",
    text: `訊息 ${index}`,
    createdAt: `2026-08-11T00:00:${String(index).padStart(2, "0")}.000Z`,
  };
}

const twelveMessages = Array.from({ length: 12 }, (_, index) => messageAt(index));

test("ChatRequest rejects blank and overlong questions", () => {
  assert.throws(() => buildChatRequest({ context, messages: [], question: "   " }), /question_required/);
  assert.throws(() => buildChatRequest({ context, messages: [], question: "a".repeat(501) }), /question_too_long/);
});

test("ChatRequest sends only the latest six conversation turns", () => {
  const request = buildChatRequest({ context, messages: twelveMessages, question: "比較兩個單字" });
  assert.equal(request.messages.length, 6);
  assert.equal(request.question, "比較兩個單字");
  assert.equal(Object.hasOwn(request, "storageExport"), false);
  assert.equal(Object.hasOwn(request.context, "unitId"), false);
});

test("chat history trims local history to thirty messages", () => {
  const next = appendChatMessage(Array.from({ length: 30 }, (_, index) => messageAt(index)), messageAt(30));
  assert.equal(next.length, 30);
  assert.equal(next[0].id, "message-1");
  assert.equal(next.at(-1).id, "message-30");
});

const request = buildChatRequest({
  context,
  messages: twelveMessages,
  question: "比較兩個單字",
});

test("chatJapanese sends the bounded request and parses delta records", async () => {
  const calls = [];
  const client = new LocalAiClient({
    baseUrl: "http://127.0.0.1:3765",
    origin: "http://localhost:3000",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/v1/session")) {
        return new Response(JSON.stringify({ sessionToken: "session-1234567890abcdef" }), { status: 200 });
      }
      return new Response(`${JSON.stringify({ type: "delta", text: "先複習" })}\n${JSON.stringify({ type: "done", model: "codex-default", completedAt: "2026-08-11T00:00:00.000Z" })}\n`, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    },
  });
  const records = [];
  for await (const record of client.chatJapanese(request)) records.push(record);
  assert.deepEqual(records, [
    { type: "delta", text: "先複習" },
    { type: "done", model: "codex-default", completedAt: "2026-08-11T00:00:00.000Z" },
  ]);
  assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)).sort(), ["context", "messages", "question"]);
});

test("default client calls browser fetch with the global receiver", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function browserStyleFetch() {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  };
  try {
    const client = new LocalAiClient();
    assert.deepEqual(await client.status(), { ok: false, connected: false, reason: "invalid_status", usage: null });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
  assert.equal(status.usage?.planType, "pro");
  assert.equal(Object.hasOwn(status, "email"), false);
  assert.equal(Object.hasOwn(status.usage ?? {}, "accessToken"), false);
});

function authorizedJson(sessionToken, body) {
  return {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      "X-N4-AI-Session": sessionToken,
    },
    body: JSON.stringify(body),
  };
}

async function readNdjson(response) {
  return (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
}

test("chat records stream and reject unknown chat fields", async () => {
  const bridge = await startAiBridgeServer({
    port: 0,
    adapter: { async analyze() { return { source: "baseline", reason: "unused" }; } },
    chatAdapter: {
      async *chat() {
        yield { type: "delta", text: "先複習" };
        yield { type: "done", model: "codex-default", completedAt: "2026-08-11T00:00:00.000Z" };
      },
    },
  });
  try {
    const sessionResponse = await fetch(`${bridge.url}/v1/session`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    });
    const { sessionToken } = await sessionResponse.json();
    const response = await fetch(`${bridge.url}/v1/chat`, authorizedJson(sessionToken, request));
    assert.equal(response.status, 200);
    assert.deepEqual((await readNdjson(response)).map((record) => record.type), ["delta", "done"]);

    const rejected = await fetch(`${bridge.url}/v1/chat`, authorizedJson(sessionToken, { ...request, token: "no" }));
    assert.equal(rejected.status, 400);
  } finally {
    await bridge.close();
  }
});

function streamingModel(events) {
  return {
    async *complete() {
      for (const event of events) yield event;
    },
  };
}

test("chat adapter streams bounded deltas and completes with model metadata", async () => {
  const adapter = createChatAdapter({
    model: streamingModel([
      { type: "delta", text: "先" },
      { type: "delta", text: "複習" },
      { type: "done", model: "codex-default" },
    ]),
    clock: () => Date.parse("2026-08-11T00:00:00.000Z"),
  });
  const records = [];
  for await (const record of adapter.chat(request)) records.push(record);
  assert.deepEqual(records, [
    { type: "delta", text: "先" },
    { type: "delta", text: "複習" },
    { type: "done", model: "codex-default", completedAt: "2026-08-11T00:00:00.000Z" },
  ]);
});

test("chat adapter falls back on incomplete model streams", async () => {
  const adapter = createChatAdapter({ model: streamingModel([{ type: "delta", text: "部分" }]) });
  const records = [];
  for await (const record of adapter.chat(request)) records.push(record);
  assert.deepEqual(records, [
    { type: "delta", text: "部分" },
    { type: "fallback", reason: "ai_unavailable" },
  ]);
});

test("chat adapter preserves only the safe ChatGPT login fallback reason", async () => {
  const adapter = createChatAdapter({
    model: {
      async complete() {
        const error = new Error("codex_chatgpt_login_required");
        error.code = "codex_chatgpt_login_required";
        throw error;
      },
    },
  });
  const records = [];
  for await (const record of adapter.chat(request)) records.push(record);
  assert.deepEqual(records, [{ type: "fallback", reason: "codex_chatgpt_login_required" }]);
});

const userMessage = {
  id: "user-1",
  role: "user",
  text: "為什麼推薦這個？",
  createdAt: "2026-08-11T00:00:00.000Z",
};

test("streaming deltas accumulate and complete", () => {
  let state = createChatState("context-key");
  state = reduceChatRecord(state, { type: "delta", text: "先" });
  state = reduceChatRecord(state, { type: "delta", text: "複習" });
  state = reduceChatRecord(state, { type: "done", model: "default" });
  assert.equal(state.status, "ready");
  assert.equal(state.messages.at(-1).text, "先複習");
});

test("retryable error keeps the user message", () => {
  const state = reduceChatRecord(
    { ...createChatState("context-key"), status: "streaming", messages: [userMessage] },
    { type: "fallback", reason: "ai_unavailable" },
  );
  assert.equal(state.status, "error");
  assert.equal(state.messages[0].text, userMessage.text);
  assert.equal(state.error, "ai_unavailable");
});

test("malformed storage is ignored and valid history is capped", () => {
  assert.deepEqual(loadChatMessages("not-json"), []);
  const stored = JSON.stringify(Array.from({ length: 31 }, (_, index) => ({
    ...userMessage,
    id: `message-${index}`,
  })));
  const messages = loadChatMessages(stored);
  assert.equal(messages.length, 30);
  assert.equal(messages[0].id, "message-1");
});

test("drawer actions expose accessible controls for every chat state", () => {
  assert.deepEqual(getAiChatDrawerActions("streaming"), ["關閉", "清除對話", "停止產生"]);
  assert.deepEqual(getAiChatDrawerActions("error"), ["關閉", "清除對話", "重試"]);
  assert.deepEqual(getAiChatDrawerActions("ready"), ["關閉", "清除對話", "送出"]);
});

test("floating AI assistant button exposes its visible and accessible labels", () => {
  assert.deepEqual(getAiChatFabProps(), { label: "AI 助教", ariaLabel: "開啟 AI 助教" });
});
