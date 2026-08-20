import { spawn } from "node:child_process";
import { normalizeCodexUsage, requireChatGptAccount } from "./codex-usage.mjs";

const FORBIDDEN_ITEM_TYPES = new Set([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "collabAgentToolCall",
  "webSearch",
  "imageView",
  "imageGeneration",
  "sleep",
]);

const BRIDGE_INSTRUCTIONS = [
  "你是 N4 ことば帳的日文學習助教。",
  "只根據使用者提供的學習範圍與問題，以繁體中文提供簡潔、可執行的日文學習建議。",
  "不得呼叫工具、shell、MCP、網路搜尋、讀寫檔案或修改任何學習紀錄。",
  "不要聲稱已執行未提供給你的操作。",
].join("\n");

export class AppServerClient {
  constructor({
    spawnProcess = defaultSpawnProcess,
    timeoutMs = 45_000,
    cwd = process.cwd(),
    model,
  } = {}) {
    this.spawnProcess = spawnProcess;
    this.timeoutMs = timeoutMs;
    this.cwd = cwd;
    this.requestedModel = model;
    this.process = null;
    this.stdoutBuffer = "";
    this.nextRequestId = 1;
    this.pending = new Map();
    this.activeTurns = new Map();
    this.initialized = false;
    this.model = model ?? "";
    this.closed = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.ensureProcess();
    await this.request("initialize", {
      clientInfo: { name: "n4-kotoba-demo", title: "N4 ことば帳", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
    this.initialized = true;
  }

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

  async startThread({ model } = {}) {
    await this.initialize();
    const result = await this.request("thread/start", {
      cwd: this.cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      dynamicTools: [],
      environments: [],
      ephemeral: true,
      baseInstructions: BRIDGE_INSTRUCTIONS,
      developerInstructions: BRIDGE_INSTRUCTIONS,
      ...((model ?? this.requestedModel) ? { model: model ?? this.requestedModel } : {}),
    });
    const threadId = result?.thread?.id;
    if (typeof threadId !== "string" || !threadId) throw new Error("app_server_invalid_thread");
    this.model = typeof result.model === "string" ? result.model : this.model;
    return { threadId, model: this.model || undefined };
  }

  async *runTurn({ threadId, input, signal } = {}) {
    if (typeof threadId !== "string" || !threadId || typeof input !== "string" || !input.trim()) {
      throw new Error("app_server_invalid_turn");
    }
    await this.initialize();
    if (this.activeTurns.has(threadId)) throw new Error("app_server_turn_active");

    const channel = createChannel(threadId, this.model);
    this.activeTurns.set(threadId, channel);
    const onAbort = () => {
      void this.interrupt(channel);
      failChannel(channel, abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      void this.interrupt(channel);
      failChannel(channel, timeoutError());
    }, this.timeoutMs);

    try {
      if (signal?.aborted) throw abortError();
      const result = await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: input.trim() }],
        approvalPolicy: "never",
        environments: [],
      });
      if (typeof result?.turn?.id !== "string") throw new Error("app_server_invalid_turn");
      channel.turnId = result.turn.id;
      while (true) {
        const item = await readChannel(channel);
        if (item.done) break;
        yield item.value;
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      this.activeTurns.delete(threadId);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const error = new Error("app_server_closed");
    this.failAll(error);
    if (this.process && !this.process.killed) this.process.kill();
    this.process = null;
  }

  ensureProcess() {
    if (this.process) return;
    if (this.closed) throw new Error("app_server_closed");
    const child = this.spawnProcess();
    if (!child?.stdin || !child?.stdout || typeof child.on !== "function") {
      throw new Error("app_server_spawn_failed");
    }
    this.process = child;
    child.stdout.on("data", (chunk) => this.consumeStdout(chunk));
    child.on("error", (error) => this.failAll(error));
    child.on("exit", () => this.failAll(new Error("app_server_exited")));
  }

  consumeStdout(chunk) {
    this.stdoutBuffer += chunk.toString("utf8");
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.failAll(new Error("app_server_invalid_jsonl"));
        continue;
      }
      this.handleMessage(message);
    }
  }

  handleMessage(message) {
    if (Object.hasOwn(message, "id") && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error("app_server_request_failed"));
      else pending.resolve(message.result);
      return;
    }

    if (Object.hasOwn(message, "id") && typeof message.method === "string") {
      this.respondWithError(message.id, "forbidden_tool_request");
      const channel = this.activeTurns.get(message.params?.threadId);
      if (channel) failChannel(channel, new Error("forbidden_tool_request"));
      return;
    }

    if (typeof message.method !== "string") return;
    const params = message.params ?? {};
    const channel = this.activeTurns.get(params.threadId);
    if (!channel) return;
    if (typeof params.turnId === "string" && !channel.turnId) channel.turnId = params.turnId;

    if (message.method === "item/agentMessage/delta" && typeof params.delta === "string") {
      pushChannel(channel, { type: "delta", text: params.delta });
      return;
    }
    if (message.method === "item/started" && FORBIDDEN_ITEM_TYPES.has(params.item?.type)) {
      void this.interrupt(channel);
      failChannel(channel, new Error("forbidden_tool_request"));
      return;
    }
    if (message.method === "turn/completed") {
      if (params.turn?.status === "completed") {
        pushChannel(channel, { type: "done", ...(channel.model ? { model: channel.model } : {}) });
        endChannel(channel);
      } else {
        failChannel(channel, new Error("app_server_turn_failed"));
      }
    }
  }

  request(method, params) {
    this.ensureProcess();
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(timeoutError());
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }

  notify(method, params) {
    this.write({ method, params });
  }

  respondWithError(id, message) {
    this.write({ id, error: { code: -32001, message } });
  }

  async interrupt(channel) {
    if (!channel.turnId || this.closed) return;
    try {
      await this.request("turn/interrupt", { threadId: channel.threadId, turnId: channel.turnId });
    } catch {
      // The original stream error remains authoritative.
    }
  }

  write(message) {
    if (!this.process?.stdin || this.closed) throw new Error("app_server_closed");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const channel of this.activeTurns.values()) failChannel(channel, error);
  }
}

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

function defaultSpawnProcess() {
  return spawn("codex", ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
}

function createChannel(threadId, model) {
  return { threadId, turnId: "", model, queue: [], waiters: [], done: false, error: null };
}

function pushChannel(channel, value) {
  if (channel.done || channel.error) return;
  const waiter = channel.waiters.shift();
  if (waiter) waiter.resolve({ value, done: false });
  else channel.queue.push(value);
}

function endChannel(channel) {
  if (channel.done || channel.error) return;
  channel.done = true;
  for (const waiter of channel.waiters.splice(0)) waiter.resolve({ value: undefined, done: true });
}

function failChannel(channel, error) {
  if (channel.done || channel.error) return;
  channel.error = error;
  for (const waiter of channel.waiters.splice(0)) waiter.reject(error);
}

function readChannel(channel) {
  if (channel.queue.length) return Promise.resolve({ value: channel.queue.shift(), done: false });
  if (channel.error) return Promise.reject(channel.error);
  if (channel.done) return Promise.resolve({ value: undefined, done: true });
  return new Promise((resolve, reject) => channel.waiters.push({ resolve, reject }));
}

function abortError() {
  const error = new Error("app_server_aborted");
  error.name = "AbortError";
  return error;
}

function timeoutError() {
  const error = new Error("app_server_timeout");
  error.name = "TimeoutError";
  return error;
}
