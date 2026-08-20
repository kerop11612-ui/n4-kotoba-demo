import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const CONTEXT_KEYS = ["input", "baseline", "cacheKey", "versions", "shouldCallAi"];
const CHAT_KEYS = ["context", "messages", "question"];
const CHAT_CONTEXT_KEYS = ["label", "recentPeriodLabel", "recommendation", "scope", "unitId"];
const CHAT_RECOMMENDATION_KEYS = ["evidenceLabel", "reason", "title"];

export function startAiBridgeServer({
  adapter,
  chatAdapter,
  usageProvider,
  host = "127.0.0.1",
  port = 3765,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
} = {}) {
  if (!adapter || typeof adapter.analyze !== "function") throw new Error("adapter_required");
  const sessions = new Map();
  const server = createServer((request, response) => {
    void handleRequest(request, response, { adapter, chatAdapter, usageProvider, sessions, allowedOrigins, sessionTtlMs });
  });
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      resolve({
        url: `http://${host}:${typeof address === "object" && address ? address.port : port}`,
        close: () => new Promise((closeResolve, closeReject) => server.close((error) => error ? closeReject(error) : closeResolve())),
        server,
      });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function handleRequest(request, response, dependencies) {
  const origin = request.headers.origin ?? "";
  if (request.method === "OPTIONS") {
    if (!dependencies.allowedOrigins.has(origin)) return sendError(response, 403, "origin_not_allowed");
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/v1/status") {
    if (!dependencies.usageProvider || typeof dependencies.usageProvider.read !== "function") {
      sendJson(response, 200, { ok: false, connected: false, reason: "ai_unavailable", usage: null }, origin, dependencies.allowedOrigins);
      return;
    }
    try {
      const usage = sanitizeUsage(await dependencies.usageProvider.read());
      sendJson(response, 200, { ok: true, connected: true, usage }, origin, dependencies.allowedOrigins);
    } catch (error) {
      const reason = error?.code === "codex_chatgpt_login_required"
        ? "codex_chatgpt_login_required"
        : "ai_unavailable";
      sendJson(response, 200, { ok: reason === "codex_chatgpt_login_required", connected: false, reason, usage: null }, origin, dependencies.allowedOrigins);
    }
    return;
  }
  if (!dependencies.allowedOrigins.has(origin)) return sendError(response, 403, "origin_not_allowed");

  if (request.method === "POST" && url.pathname === "/v1/session") {
    const token = randomBytes(24).toString("base64url");
    dependencies.sessions.set(token, { origin, expiresAt: Date.now() + dependencies.sessionTtlMs });
    sendJson(response, 200, { sessionToken: token, expiresAt: Date.now() + dependencies.sessionTtlMs }, origin, dependencies.allowedOrigins);
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/analyze") {
    const sessionToken = request.headers["x-n4-ai-session"];
    const session = typeof sessionToken === "string" ? dependencies.sessions.get(sessionToken) : undefined;
    if (!session || session.origin !== origin || session.expiresAt <= Date.now()) {
      return sendError(response, 401, "session_required");
    }
    if (Number(request.headers["content-length"] ?? 0) > MAX_BODY_BYTES) {
      return sendError(response, 413, "body_too_large");
    }
    if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
      return sendError(response, 415, "json_required");
    }
    try {
      const context = await readContext(request);
      response.writeHead(200, {
        ...corsHeaders(origin),
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.write(`${JSON.stringify({ type: "baseline", analysis: context.baseline })}\n`);
      let result;
      try {
        result = await dependencies.adapter.analyze(context);
      } catch {
        result = { source: "baseline", analysis: context.baseline, reason: "adapter_failed" };
      }
      if (result.source === "ai" || result.source === "cache") {
        response.write(`${JSON.stringify({
          type: "done",
          source: result.source,
          analysis: result.analysis,
          model: result.model,
          completedAt: result.completedAt,
        })}\n`);
      } else {
        response.write(`${JSON.stringify({
          type: "fallback",
          source: "baseline",
          analysis: context.baseline,
          reason: result.reason ?? "ai_unavailable",
        })}\n`);
      }
      response.end();
      return;
    } catch (error) {
      return sendError(response, error.code === "body_too_large" ? 413 : 400, error.code ?? "invalid_request");
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/chat") {
    const sessionToken = request.headers["x-n4-ai-session"];
    const session = typeof sessionToken === "string" ? dependencies.sessions.get(sessionToken) : undefined;
    if (!session || session.origin !== origin || session.expiresAt <= Date.now()) {
      return sendError(response, 401, "session_required");
    }
    if (Number(request.headers["content-length"] ?? 0) > MAX_BODY_BYTES) {
      return sendError(response, 413, "body_too_large");
    }
    if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
      return sendError(response, 415, "json_required");
    }
    try {
      const chatRequest = await readChatRequest(request);
      response.writeHead(200, {
        ...corsHeaders(origin),
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (!dependencies.chatAdapter || typeof dependencies.chatAdapter.chat !== "function") {
        response.write(`${JSON.stringify({ type: "fallback", reason: "ai_unavailable" })}\n`);
        response.end();
        return;
      }
      try {
        for await (const record of dependencies.chatAdapter.chat(chatRequest)) {
          if (!isChatRecord(record)) throw new Error("invalid_chat_record");
          response.write(`${JSON.stringify(record)}\n`);
        }
      } catch {
        response.write(`${JSON.stringify({ type: "fallback", reason: "ai_unavailable" })}\n`);
      }
      response.end();
      return;
    } catch (error) {
      return sendError(response, error.code === "body_too_large" ? 413 : 400, error.code ?? "invalid_request");
    }
  }

  sendError(response, 404, "not_found");
}

function sanitizeUsage(value) {
  if (!value || typeof value !== "object" || value.connected !== true || value.authMode !== "chatgpt") {
    throw new Error("invalid_codex_usage");
  }
  return {
    connected: true,
    authMode: "chatgpt",
    planType: typeof value.planType === "string" ? value.planType : null,
    primary: sanitizeUsageWindow(value.primary),
    secondary: sanitizeUsageWindow(value.secondary),
    fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : new Date().toISOString(),
  };
}

function sanitizeUsageWindow(value) {
  if (!value || typeof value !== "object") return null;
  const usedPercent = Number(value.usedPercent);
  const windowDurationMins = Number(value.windowDurationMins);
  const resetsAt = typeof value.resetsAt === "string" ? value.resetsAt : "";
  if (!Number.isFinite(usedPercent) || !Number.isFinite(windowDurationMins) || !resetsAt) return null;
  return {
    usedPercent: Math.min(100, Math.max(0, Math.round(usedPercent))),
    windowDurationMins: Math.max(0, Math.round(windowDurationMins)),
    resetsAt,
  };
}

async function readContext(request) {
  const body = await readBody(request);
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    const error = new Error("invalid_json");
    error.code = "invalid_json";
    throw error;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("invalid_context");
    error.code = "invalid_context";
    throw error;
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== CONTEXT_KEYS.length || keys.some((key, index) => key !== [...CONTEXT_KEYS].sort()[index])) {
    const error = new Error("unknown_context_field");
    error.code = "unknown_context_field";
    throw error;
  }
  if (!value.input || !value.baseline || !value.versions || typeof value.cacheKey !== "string" || typeof value.shouldCallAi !== "boolean") {
    const error = new Error("invalid_context");
    error.code = "invalid_context";
    throw error;
  }
  return value;
}

async function readChatRequest(request) {
  const body = await readBody(request);
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    const error = new Error("invalid_json");
    error.code = "invalid_json";
    throw error;
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !hasExactKeys(value, CHAT_KEYS)) {
    const error = new Error("unknown_chat_field");
    error.code = "unknown_chat_field";
    throw error;
  }
  const context = value.context;
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    const error = new Error("invalid_chat_context");
    error.code = "invalid_chat_context";
    throw error;
  }
  const contextKeys = Object.keys(context).sort();
  const allowedContextKeys = CHAT_CONTEXT_KEYS.filter((key) => context[key] !== undefined).sort();
  if (!contextKeys.every((key) => CHAT_CONTEXT_KEYS.includes(key)) || contextKeys.length !== allowedContextKeys.length) {
    const error = new Error("unknown_chat_context_field");
    error.code = "unknown_chat_context_field";
    throw error;
  }
  if ((context.scope !== "home" && context.scope !== "unit")
    || typeof context.label !== "string"
    || typeof context.recentPeriodLabel !== "string"
    || (context.unitId !== undefined && typeof context.unitId !== "string")) {
    const error = new Error("invalid_chat_context");
    error.code = "invalid_chat_context";
    throw error;
  }
  let recommendation;
  if (context.recommendation !== undefined) {
    recommendation = context.recommendation;
    if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)
      || !hasExactKeys(recommendation, CHAT_RECOMMENDATION_KEYS)
      || CHAT_RECOMMENDATION_KEYS.some((key) => typeof recommendation[key] !== "string")) {
      const error = new Error("invalid_chat_recommendation");
      error.code = "invalid_chat_recommendation";
      throw error;
    }
  }
  if (!Array.isArray(value.messages) || value.messages.length > 6 || value.messages.some((message) => (
    !message || typeof message !== "object" || Array.isArray(message)
      || !hasExactKeys(message, ["role", "text"])
      || (message.role !== "user" && message.role !== "assistant")
      || typeof message.text !== "string"
  ))) {
    const error = new Error("invalid_chat_messages");
    error.code = "invalid_chat_messages";
    throw error;
  }
  if (typeof value.question !== "string" || !value.question.trim()) {
    const error = new Error("question_required");
    error.code = "question_required";
    throw error;
  }
  if ([...value.question.trim()].length > 500) {
    const error = new Error("question_too_long");
    error.code = "question_too_long";
    throw error;
  }
  return {
    context: {
      scope: context.scope,
      label: context.label,
      recentPeriodLabel: context.recentPeriodLabel,
      ...(context.unitId ? { unitId: context.unitId } : {}),
      ...(recommendation ? { recommendation: { ...recommendation } } : {}),
    },
    messages: value.messages.map(({ role, text }) => ({ role, text })),
    question: value.question.trim(),
  };
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isChatRecord(record) {
  return Boolean(record && typeof record === "object" && (
    (record.type === "delta" && typeof record.text === "string")
    || record.type === "done"
    || (record.type === "fallback" && typeof record.reason === "string")
  ));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        const error = new Error("body_too_large");
        error.code = "body_too_large";
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, status, body, origin, allowedOrigins) {
  response.writeHead(status, {
    ...corsHeaders(origin, allowedOrigins),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sendError(response, status, code) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ error: code }));
}

function corsHeaders(origin, allowedOrigins = DEFAULT_ALLOWED_ORIGINS) {
  return allowedOrigins.has(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, X-N4-AI-Session", "Vary": "Origin" }
    : {};
}
