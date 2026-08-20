import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { AppServerClient, createAppServerModel } from "../scripts/ai-bridge/app-server-client.mjs";
import {
  normalizeCodexUsage,
  requireChatGptAccount,
} from "../scripts/ai-bridge/codex-usage.mjs";
import { startAiBridgeRuntime } from "../scripts/ai-bridge/runtime.mjs";

class FakeAppServerProcess extends EventEmitter {
  constructor(onMessage) {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.messages = [];
    this.killed = false;
    let input = "";
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        input += chunk.toString("utf8");
        const lines = input.split("\n");
        input = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line);
          this.messages.push(message);
          onMessage(message, this);
        }
        callback();
      },
    });
  }

  send(value, split = false) {
    const line = `${JSON.stringify(value)}\n`;
    if (!split) {
      this.stdout.write(line);
      return;
    }
    const middle = Math.floor(line.length / 2);
    this.stdout.write(line.slice(0, middle));
    queueMicrotask(() => this.stdout.write(line.slice(middle)));
  }

  kill() {
    this.killed = true;
    this.emit("exit", 0, null);
  }
}

function successfulFakeProcess() {
  return new FakeAppServerProcess((message, process) => {
    if (message.method === "initialize") {
      process.send({ id: message.id, result: { codexHome: "C:/codex", platformFamily: "windows", platformOs: "windows", userAgent: "codex-test" } }, true);
    }
    if (message.method === "thread/start") {
      process.send({ id: message.id, result: { thread: { id: "thread-1" }, model: "codex-default" } });
    }
    if (message.method === "turn/start") {
      process.send({ id: message.id, result: { turn: { id: "turn-1", items: [], status: "inProgress" } } });
      queueMicrotask(() => {
        process.send({ method: "item/agentMessage/delta", params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", delta: "先複習" } }, true);
        queueMicrotask(() => process.send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", items: [], status: "completed" } } }));
      });
    }
  });
}

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

test("AppServerClient streams a signed-in Codex turn without enabling tools", async () => {
  const process = successfulFakeProcess();
  const client = new AppServerClient({ spawnProcess: () => process, cwd: "D:/APP/n4-kotoba-demo-main" });

  await client.initialize();
  const thread = await client.startThread();
  const events = [];
  for await (const event of client.runTurn({ threadId: thread.threadId, input: "請用繁體中文回答" })) events.push(event);

  assert.deepEqual(events, [
    { type: "delta", text: "先複習" },
    { type: "done", model: "codex-default" },
  ]);
  const threadRequest = process.messages.find((message) => message.method === "thread/start");
  assert.equal(threadRequest.params.approvalPolicy, "never");
  assert.equal(threadRequest.params.sandbox, "read-only");
  assert.deepEqual(threadRequest.params.dynamicTools, []);
  assert.equal(threadRequest.params.ephemeral, true);
  assert.deepEqual(process.messages.find((message) => message.method === "turn/start").params.input, [
    { type: "text", text: "請用繁體中文回答" },
  ]);

  await client.close();
  assert.equal(process.killed, true);
});

test("AppServerClient interrupts turns that attempt a tool", async () => {
  const process = new FakeAppServerProcess((message, child) => {
    if (message.method === "initialize") child.send({ id: message.id, result: { codexHome: "C:/codex", platformFamily: "windows", platformOs: "windows", userAgent: "codex-test" } });
    if (message.method === "thread/start") child.send({ id: message.id, result: { thread: { id: "thread-1" }, model: "codex-default" } });
    if (message.method === "turn/start") {
      child.send({ id: message.id, result: { turn: { id: "turn-1", items: [], status: "inProgress" } } });
      queueMicrotask(() => child.send({
        method: "item/started",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          startedAtMs: 0,
          item: {
            id: "tool-1",
            type: "commandExecution",
            command: "whoami",
            cwd: "D:/",
            processId: null,
            status: "inProgress",
            commandActions: [],
            aggregatedOutput: null,
            durationMs: null,
            exitCode: null,
            source: "agent",
          },
        },
      }));
    }
    if (message.method === "turn/interrupt") child.send({ id: message.id, result: {} });
  });
  const client = new AppServerClient({ spawnProcess: () => process, cwd: "D:/APP/n4-kotoba-demo-main" });
  await client.initialize();
  const { threadId } = await client.startThread();

  await assert.rejects(async () => {
    for await (const event of client.runTurn({ threadId, input: "不要使用工具" })) {
      void event;
    }
  }, /forbidden_tool_request/);
  assert.equal(process.messages.some((message) => message.method === "turn/interrupt"), true);
  await client.close();
});

test("App Server model reuses one ephemeral thread for chat turns", async () => {
  const process = successfulFakeProcess();
  const client = new AppServerClient({ spawnProcess: () => process, cwd: "D:/APP/n4-kotoba-demo-main" });
  const model = createAppServerModel(client);
  const stream = await model.complete({ prompt: "第一題" });
  const events = [];
  for await (const event of stream) events.push(event);

  assert.deepEqual(events, [
    { type: "delta", text: "先複習" },
    { type: "done", model: "codex-default" },
  ]);
  assert.equal(process.messages.filter((message) => message.method === "thread/start").length, 1);
  await model.close();
});

test("AI bridge runtime sends browser chat through the App Server model", async () => {
  const prompts = [];
  let closed = false;
  let active = false;
  const client = {
    async startThread() { return { threadId: "thread-live", model: "codex-default" }; },
    async *runTurn({ input }) {
      if (active) throw new Error("turn_still_active");
      active = true;
      prompts.push(input);
      try {
        yield { type: "delta", text: "先複習五分鐘" };
        yield { type: "done", model: "codex-default" };
      } finally {
        active = false;
      }
    },
    async close() { closed = true; },
  };
  const runtime = await startAiBridgeRuntime({ client, port: 0 });
  try {
    const sessionResponse = await fetch(`${runtime.url}/v1/session`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    });
    const { sessionToken } = await sessionResponse.json();
    const sendChat = async (question) => {
      const response = await fetch(`${runtime.url}/v1/chat`, {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
          "X-N4-AI-Session": sessionToken,
        },
        body: JSON.stringify({
          context: { scope: "home", label: "全部 N4 單字", recentPeriodLabel: "最近 3 天" },
          messages: [],
          question,
        }),
      });
      return (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    };
    const first = await sendChat("我今天該先學什麼？");
    const second = await sendChat("接著呢？");
    assert.deepEqual(first.map((record) => record.type), ["delta", "done"]);
    assert.deepEqual(second.map((record) => record.type), ["delta", "done"]);
    assert.equal(first[0].text, "先複習五分鐘");
    assert.match(prompts[0], /我今天該先學什麼/);
  } finally {
    await runtime.close();
  }
  assert.equal(closed, true);
});
