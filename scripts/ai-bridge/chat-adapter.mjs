const MAX_RESPONSE_CHARS = 20_000;
const SAFE_FALLBACK_REASONS = new Set([
  "codex_chatgpt_login_required",
  "aborted",
  "timeout",
]);

export function createChatAdapter({
  model,
  timeoutMs = 15_000,
  clock = () => Date.now(),
} = {}) {
  return {
    async *chat(request, { signal } = {}) {
      if (!model || typeof model.complete !== "function") {
        yield { type: "fallback", reason: "ai_unavailable" };
        return;
      }

      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      signal?.addEventListener("abort", forwardAbort, { once: true });
      const deadline = Date.now() + timeoutMs;
      let completed = false;
      let modelName = "";
      let accumulated = 0;
      try {
        if (signal?.aborted) throw abortError();
        const stream = await withTimeout(
          model.complete({ prompt: buildChatPrompt(request), signal: controller.signal }),
          remaining(deadline),
          controller,
        );
        if (!stream || typeof stream[Symbol.asyncIterator] !== "function") throw new Error("stream_invalid");
        const iterator = stream[Symbol.asyncIterator]();
        try {
          while (true) {
            const next = await withTimeout(iterator.next(), remaining(deadline), controller);
            if (next.done) break;
            const event = next.value;
            if (event?.type === "delta" && typeof event.text === "string") {
              const remainingChars = MAX_RESPONSE_CHARS - accumulated;
              const text = Array.from(event.text).slice(0, remainingChars).join("");
              accumulated += Array.from(text).length;
              if (text) yield { type: "delta", text };
            } else if (event?.type === "done") {
              completed = true;
              modelName = typeof event.model === "string" ? event.model : "";
              break;
            }
          }
        } finally {
          if (typeof iterator.return === "function") {
            await iterator.return();
          }
        }
        if (!completed) throw new Error("stream_incomplete");
        yield {
          type: "done",
          ...(modelName ? { model: modelName } : {}),
          completedAt: new Date(clock()).toISOString(),
        };
      } catch (error) {
        yield {
          type: "fallback",
          reason: getFallbackReason(error, signal),
        };
      } finally {
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

export function buildChatPrompt(request) {
  return JSON.stringify({
    language: "日文學習",
    context: request.context,
    messages: request.messages,
    question: request.question,
  });
}

function remaining(deadline) {
  const value = deadline - Date.now();
  if (value <= 0) throw abortError();
  return value;
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
