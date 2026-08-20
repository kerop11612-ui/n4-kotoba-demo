import {
  AI_LEARNING_SYSTEM_PROMPT,
  LEARNING_ANALYSIS_SCHEMA,
  parseLearningAnalysisJson,
  validateLearningAnalysisForContext,
} from "../../src/spaced-repetition/ai-learning-analysis.ts";
import { isUsableCachedAnalysis } from "../../src/ai/ai-cache.ts";

const MAX_RESPONSE_CHARS = 50_000;
const SAFE_FALLBACK_REASONS = new Set([
  "codex_chatgpt_login_required",
  "aborted",
  "timeout",
]);

export function createLearningAnalysisAdapter({
  model,
  cache,
  clock = () => Date.now(),
  timeoutMs = 15_000,
}) {
  return {
    async analyze(context, { signal } = {}) {
      const fallback = (reason) => ({
        source: "baseline",
        analysis: context.baseline,
        cacheKey: context.cacheKey,
        reason,
      });

      if (!context?.shouldCallAi) return fallback("insufficient_evidence");

      let cached;
      try {
        cached = await cache.get(context.cacheKey);
      } catch {
        return fallback("cache_read_failed");
      }
      if (isUsableCachedAnalysis(cached, context, validateLearningAnalysisForContext)) {
        return {
          source: "cache",
          analysis: cached.analysis,
          cacheKey: cached.cacheKey,
          model: cached.model,
          completedAt: cached.completedAt,
        };
      }

      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      signal?.addEventListener("abort", forwardAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const stream = await model.complete({
          prompt: buildLearningAnalysisPrompt(context),
          signal: controller.signal,
        });
        const response = await withTimeout(
          collectResponse(stream, controller.signal),
          timeoutMs,
          controller,
        );
        const parsed = parseValidatedResponse(response.text, context);
        if (!parsed) return fallback("invalid_ai_response");
        const completedAt = new Date(clock()).toISOString();
        const record = {
          cacheKey: context.cacheKey,
          analysis: parsed,
          analysisDay: context.versions.analysisDay,
          schemaVersion: context.versions.schemaVersion,
          model: response.model || context.versions.model,
          completedAt,
        };
        try {
          await cache.put(record);
        } catch {
          return fallback("cache_write_failed");
        }
        return {
          source: "ai",
          analysis: parsed,
          cacheKey: context.cacheKey,
          model: record.model,
          completedAt,
        };
      } catch (error) {
        return fallback(getFallbackReason(error, signal));
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", forwardAbort);
      }
    },
  };
}

function getFallbackReason(error, signal) {
  if (SAFE_FALLBACK_REASONS.has(error?.code)) return error.code;
  if (error?.name === "AbortError") return signal?.aborted ? "aborted" : "timeout";
  return "ai_unavailable";
}

export function buildLearningAnalysisPrompt(context) {
  return JSON.stringify({
    system: AI_LEARNING_SYSTEM_PROMPT,
    schema: LEARNING_ANALYSIS_SCHEMA,
    versions: context.versions,
    input: context.input,
  });
}

async function collectResponse(stream, signal) {
  let text = "";
  let model = "";
  let completed = false;
  for await (const event of stream) {
    if (signal.aborted) throw abortError();
    if (event?.type === "delta" && typeof event.text === "string") {
      text += event.text;
      if (text.length > MAX_RESPONSE_CHARS) throw new Error("response_too_large");
    } else if (event?.type === "done") {
      completed = true;
      model = typeof event.model === "string" ? event.model : "";
      break;
    }
  }
  if (!completed) throw new Error("stream_incomplete");
  return { text, model };
}

function parseValidatedResponse(text, context) {
  try {
    const value = JSON.parse(text);
    return validateLearningAnalysisForContext(value, context.input)
      ? parseLearningAnalysisJson(text, context)
      : null;
  } catch {
    return null;
  }
}

function withTimeout(promise, timeoutMs, controller) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(abortError());
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function abortError() {
  const error = new Error("aborted_or_timeout");
  error.name = "AbortError";
  return error;
}
