import type { LearningAnalysisAgentContext } from "../spaced-repetition/ai-learning-analysis.ts";
import type { AiChatRecord, AiChatRequest } from "./chat.ts";

export type AiAnalysisRecord =
  | { type: "baseline"; analysis: LearningAnalysisAgentContext["baseline"] }
  | { type: "done"; source: "ai" | "cache"; analysis: LearningAnalysisAgentContext["baseline"]; model?: string; completedAt?: string }
  | { type: "fallback"; source: "baseline"; analysis: LearningAnalysisAgentContext["baseline"]; reason: string };

export type AiStatus = {
  ok: boolean;
  connected: boolean;
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
      return { ok: response.ok, connected: response.ok };
    } catch {
      return { ok: false, connected: false };
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
