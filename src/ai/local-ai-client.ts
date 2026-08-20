import type { LearningAnalysisAgentContext } from "../spaced-repetition/ai-learning-analysis.ts";
import type { AiChatRecord, AiChatRequest } from "./chat.ts";

export type AiAnalysisRecord =
  | { type: "baseline"; analysis: LearningAnalysisAgentContext["baseline"] }
  | { type: "done"; source: "ai" | "cache"; analysis: LearningAnalysisAgentContext["baseline"]; model?: string; completedAt?: string }
  | { type: "fallback"; source: "baseline"; analysis: LearningAnalysisAgentContext["baseline"]; reason: string };

export type AiStatus = {
  ok: boolean;
  connected: boolean;
  reason?: string;
  usage: CodexUsageSnapshot | null;
};

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

type FetchLike = typeof fetch;

export class LocalAiClient {
  private readonly baseUrl: string;
  private readonly origin: string;
  private readonly fetchImpl: FetchLike;
  private sessionToken: string | null = null;

  constructor({
    baseUrl = "http://127.0.0.1:3765",
    origin = "http://localhost:3000",
    fetchImpl = globalThis.fetch,
  }: {
    baseUrl?: string;
    origin?: string;
    fetchImpl?: FetchLike;
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.origin = origin;
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async status(signal?: AbortSignal): Promise<AiStatus> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/status`, { signal });
      const body: unknown = await response.json();
      return parseStatus(body, response.ok);
    } catch {
      return { ok: false, connected: false, reason: "ai_unavailable", usage: null };
    }
  }

  async *analyzeLearning(
    context: LearningAnalysisAgentContext,
    signal?: AbortSignal,
  ): AsyncIterable<AiAnalysisRecord> {
    const sessionToken = await this.ensureSession(signal);
    const response = await this.fetchImpl(`${this.baseUrl}/v1/analyze`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-N4-AI-Session": sessionToken,
      },
      body: JSON.stringify({
        input: context.input,
        baseline: context.baseline,
        cacheKey: context.cacheKey,
        versions: context.versions,
        shouldCallAi: context.shouldCallAi,
      }),
    });
    if (!response.ok) {
      if (response.status === 401) this.sessionToken = null;
      throw new Error(`ai_bridge_http_${response.status}`);
    }
    if (!response.body) throw new Error("ai_bridge_empty_stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        yield parseRecord(line);
      }
      if (done) break;
    }
    if (buffer.trim()) yield parseRecord(buffer);
  }

  async *chatJapanese(
    request: AiChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<AiChatRecord> {
    const sessionToken = await this.ensureSession(signal);
    const response = await this.fetchImpl(`${this.baseUrl}/v1/chat`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-N4-AI-Session": sessionToken,
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      if (response.status === 401) this.sessionToken = null;
      throw new Error(`ai_bridge_http_${response.status}`);
    }
    if (response.headers.get("content-type")?.split(";")[0].trim() !== "application/x-ndjson") {
      throw new Error("ai_bridge_ndjson_required");
    }
    if (!response.body) throw new Error("ai_bridge_empty_stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        yield parseChatRecord(line);
      }
      if (done) break;
    }
    if (buffer.trim()) yield parseChatRecord(buffer);
  }

  private async ensureSession(signal?: AbortSignal): Promise<string> {
    if (this.sessionToken) return this.sessionToken;
    const response = await this.fetchImpl(`${this.baseUrl}/v1/session`, {
      method: "POST",
      signal,
      headers: { Origin: this.origin },
    });
    if (!response.ok) throw new Error(`ai_bridge_session_${response.status}`);
    const body = await response.json() as { sessionToken?: unknown };
    if (typeof body.sessionToken !== "string" || body.sessionToken.length < 16) {
      throw new Error("ai_bridge_invalid_session");
    }
    this.sessionToken = body.sessionToken;
    return body.sessionToken;
  }
}

function parseStatus(value: unknown, responseOk: boolean): AiStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidStatus();
  const record = value as Record<string, unknown>;
  if (typeof record.ok !== "boolean" || typeof record.connected !== "boolean") return invalidStatus();
  const status: AiStatus = {
    ok: record.ok && responseOk,
    connected: record.connected,
    usage: null,
  };
  if (typeof record.reason === "string") status.reason = record.reason;
  if (record.usage !== null && !isCodexUsageSnapshot(record.usage)) return invalidStatus();
  status.usage = record.usage === null ? null : normalizeCodexUsageSnapshot(record.usage);
  return status;
}

function isCodexUsageSnapshot(value: unknown): value is CodexUsageSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.connected === true
    && record.authMode === "chatgpt"
    && (record.planType === null || typeof record.planType === "string")
    && isCodexUsageWindow(record.primary)
    && isCodexUsageWindow(record.secondary)
    && typeof record.fetchedAt === "string";
}

function isCodexUsageWindow(value: unknown): value is CodexUsageWindow | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.usedPercent === "number"
    && Number.isFinite(record.usedPercent)
    && typeof record.windowDurationMins === "number"
    && Number.isFinite(record.windowDurationMins)
    && typeof record.resetsAt === "string";
}

function normalizeCodexUsageSnapshot(value: CodexUsageSnapshot): CodexUsageSnapshot {
  return {
    connected: true,
    authMode: "chatgpt",
    planType: value.planType,
    primary: normalizeCodexUsageWindow(value.primary),
    secondary: normalizeCodexUsageWindow(value.secondary),
    fetchedAt: value.fetchedAt,
  };
}

function normalizeCodexUsageWindow(value: CodexUsageWindow | null): CodexUsageWindow | null {
  if (!value) return null;
  return {
    usedPercent: value.usedPercent,
    windowDurationMins: value.windowDurationMins,
    resetsAt: value.resetsAt,
  };
}

function invalidStatus(): AiStatus {
  return { ok: false, connected: false, reason: "invalid_status", usage: null };
}

function parseRecord(line: string): AiAnalysisRecord {
  const value: unknown = JSON.parse(line);
  if (!value || typeof value !== "object" || !("type" in value)) throw new Error("ai_bridge_invalid_ndjson");
  if (value.type === "baseline" || value.type === "done" || value.type === "fallback") return value as AiAnalysisRecord;
  throw new Error("ai_bridge_unknown_record");
}

function parseChatRecord(line: string): AiChatRecord {
  const value: unknown = JSON.parse(line);
  if (!value || typeof value !== "object" || !("type" in value)) throw new Error("ai_bridge_invalid_ndjson");
  if (value.type === "delta" && "text" in value && typeof value.text === "string") return value as AiChatRecord;
  if (value.type === "done" || (value.type === "fallback" && "reason" in value && typeof value.reason === "string")) {
    return value as AiChatRecord;
  }
  throw new Error("ai_bridge_unknown_record");
}
