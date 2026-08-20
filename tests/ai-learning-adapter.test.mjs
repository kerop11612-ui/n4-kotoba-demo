import assert from "node:assert/strict";
import test from "node:test";
import { createLearningAnalysisAdapter } from "../scripts/ai-bridge/learning-analysis-adapter.mjs";
import { startAiBridgeServer } from "../scripts/ai-bridge/server.mjs";
import { LocalAiClient } from "../src/ai/local-ai-client.ts";
import { createInitialAiCoachState, reduceAiCoachRecord } from "../app/hooks/useAiCoach.ts";

const input = {
  periodStart: "2026-08-09T00:00:00.000Z",
  periodEnd: "2026-08-11T23:59:59.000Z",
  summary: {
    totalReviews: 3,
    uniqueWords: 1,
    independentRecallRate: 0.4,
    hintRate: 0.5,
    averageResponseMs: 3200,
    dueReviewCount: 0,
    newCardCount: 0,
  },
  weakItems: [{
    wordId: "word-0",
    word: "word-0",
    skill: "jp_to_meaning",
    currentRecall: 0.4,
    retention30d: 0.2,
    independentAccuracy: 0.4,
    hintRate: 0.5,
    averageResponseMs: 3200,
    periodReviewCount: 3,
    lifetimeReviewCount: 3,
    reviewCount: 3,
    lapseCount: 1,
    confusedWordIds: [],
    errorTypes: ["meaning"],
  }],
};

const baseline = {
  overallStatus: "warning",
  findings: [{
    type: "weak_retention",
    wordIds: ["word-0"],
    reason: "保持率偏低",
    evidence: ["30 天保持率 20%"],
    confidence: 0.8,
  }],
  recommendedActions: [{
    action: "contrast_quiz",
    wordIds: ["word-0"],
    priority: 0.8,
    questionCount: 3,
    reason: "安排對比練習",
  }],
};

const context = {
  input,
  baseline,
  cacheKey: "sha256:test-key",
  versions: {
    promptVersion: "learning-v2",
    schemaVersion: "analysis-v1",
    thresholdVersion: "thresholds-v1",
    analysisDay: "2026-08-11",
    efficiencyPolicyVersion: "efficiency-v1",
    model: "default",
  },
  shouldCallAi: true,
};

function memoryCache(initial = null) {
  let value = initial;
  let writes = 0;
  return {
    get writes() { return writes; },
    async get() { return value; },
    async put(next) { writes += 1; value = next; },
  };
}

function streamingModel(events) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async *complete() {
      calls += 1;
      for (const event of events) yield event;
    },
  };
}

function delta(text) {
  return { type: "delta", text };
}

function done(model = "default") {
  return { type: "done", model };
}

test("adapter returns baseline without calling model when evidence is insufficient", async () => {
  const model = streamingModel([done()]);
  const adapter = createLearningAnalysisAdapter({ model, cache: memoryCache() });
  const result = await adapter.analyze({ ...context, shouldCallAi: false });
  assert.equal(result.source, "baseline");
  assert.deepEqual(result.analysis, baseline);
  assert.equal(model.calls, 0);
});

test("adapter caches only a validated terminal result", async () => {
  const model = streamingModel([delta(JSON.stringify(baseline)), done("codex-default")]);
  const cache = memoryCache();
  const adapter = createLearningAnalysisAdapter({ model, cache, timeoutMs: 1000 });
  const first = await adapter.analyze(context);
  const second = await adapter.analyze(context);
  assert.equal(first.source, "ai");
  assert.equal(first.model, "codex-default");
  assert.equal(second.source, "cache");
  assert.deepEqual(second.analysis, baseline);
  assert.equal(model.calls, 1);
  assert.equal(cache.writes, 1);
});

test("adapter falls back and does not cache on timeout, interruption, invalid JSON, or invalid semantics", async (t) => {
  await t.test("timeout", async () => {
    const model = streamingModel([]);
    model.complete = async function* complete() {
      await new Promise(() => {});
    };
    const cache = memoryCache();
    const result = await createLearningAnalysisAdapter({ model, cache, timeoutMs: 10 }).analyze(context);
    assert.equal(result.source, "baseline");
    assert.equal(cache.writes, 0);
  });

  await t.test("interruption", async () => {
    const cache = memoryCache();
    const result = await createLearningAnalysisAdapter({
      model: streamingModel([delta(JSON.stringify(baseline))]),
      cache,
    }).analyze(context);
    assert.equal(result.source, "baseline");
    assert.equal(cache.writes, 0);
  });

  await t.test("invalid JSON and unknown word id", async () => {
    for (const text of ["not-json", JSON.stringify({ ...baseline, findings: [{ ...baseline.findings[0], wordIds: ["unknown"] }] })]) {
      const cache = memoryCache();
      const result = await createLearningAnalysisAdapter({
        model: streamingModel([delta(text), done()]),
        cache,
      }).analyze(context);
      assert.equal(result.source, "baseline");
      assert.equal(cache.writes, 0);
    }
  });

  await t.test("FSRS mutation", async () => {
    const cache = memoryCache();
    const result = await createLearningAnalysisAdapter({
      model: streamingModel([delta(JSON.stringify({ ...baseline, due: "2026-09-01T00:00:00.000Z" })), done()]),
      cache,
    }).analyze(context);
    assert.equal(result.source, "baseline");
    assert.equal(cache.writes, 0);
  });
});

test("adapter falls back when cache write fails after a valid response", async () => {
  const model = streamingModel([delta(JSON.stringify(baseline)), done()]);
  const cache = {
    async get() { return null; },
    async put() { throw new Error("quota exceeded"); },
  };
  const result = await createLearningAnalysisAdapter({ model, cache }).analyze(context);
  assert.equal(result.source, "baseline");
  assert.deepEqual(result.analysis, baseline);
});

test("learning analysis preserves only the safe ChatGPT login fallback reason", async () => {
  const model = {
    async complete() {
      const error = new Error("codex_chatgpt_login_required");
      error.code = "codex_chatgpt_login_required";
      throw error;
    },
  };
  const result = await createLearningAnalysisAdapter({ model, cache: memoryCache() }).analyze(context);
  assert.equal(result.reason, "codex_chatgpt_login_required");
});

test("loopback bridge issues an origin-bound session and streams baseline then validated result", async () => {
  const adapter = createLearningAnalysisAdapter({
    model: streamingModel([delta(JSON.stringify(baseline)), done("codex-default")]),
    cache: memoryCache(),
  });
  const bridge = await startAiBridgeServer({ port: 0, adapter });
  try {
    const origin = "http://localhost:3000";
    const sessionResponse = await fetch(`${bridge.url}/v1/session`, { method: "POST", headers: { Origin: origin } });
    assert.equal(sessionResponse.status, 200);
    const { sessionToken } = await sessionResponse.json();

    const response = await fetch(`${bridge.url}/v1/analyze`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-N4-AI-Session": sessionToken,
      },
      body: JSON.stringify(context),
    });
    assert.equal(response.status, 200);
    const records = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(records.map((record) => record.type), ["baseline", "done"]);
    assert.equal(records[1].source, "ai");
  } finally {
    await bridge.close();
  }
});

test("loopback bridge rejects wrong origin, missing session, unknown fields, and oversized body", async () => {
  const bridge = await startAiBridgeServer({
    port: 0,
    adapter: createLearningAnalysisAdapter({ model: streamingModel([done()]), cache: memoryCache() }),
  });
  try {
    const wrongOrigin = await fetch(`${bridge.url}/v1/session`, { method: "POST", headers: { Origin: "https://evil.example" } });
    assert.equal(wrongOrigin.status, 403);
    const missingSession = await fetch(`${bridge.url}/v1/analyze`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });
    assert.equal(missingSession.status, 401);

    const sessionResponse = await fetch(`${bridge.url}/v1/session`, { method: "POST", headers: { Origin: "http://localhost:3000" } });
    const { sessionToken } = await sessionResponse.json();
    const unknownField = await fetch(`${bridge.url}/v1/analyze`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        "X-N4-AI-Session": sessionToken,
      },
      body: JSON.stringify({ ...context, token: "must-not-pass" }),
    });
    assert.equal(unknownField.status, 400);

    const oversized = await fetch(`${bridge.url}/v1/analyze`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        "X-N4-AI-Session": sessionToken,
      },
      body: "x".repeat(32_769),
    });
    assert.equal(oversized.status, 413);
  } finally {
    await bridge.close();
  }
});

test("LocalAiClient obtains a session and streams only the analysis context", async () => {
  const calls = [];
  const client = new LocalAiClient({
    baseUrl: "http://127.0.0.1:3765",
    origin: "http://localhost:3000",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/v1/session")) {
        return new Response(JSON.stringify({ sessionToken: "session-1234567890abcdef" }), { status: 200 });
      }
      return new Response(`${JSON.stringify({ type: "baseline", analysis: baseline })}\n${JSON.stringify({ type: "done", source: "cache", analysis: baseline })}\n`, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    },
  });
  const records = [];
  for await (const record of client.analyzeLearning(context)) records.push(record);
  assert.deepEqual(records.map((record) => record.type), ["baseline", "done"]);
  assert.equal(calls[0].url, "http://127.0.0.1:3765/v1/session");
  assert.equal(calls[1].options.headers["X-N4-AI-Session"], "session-1234567890abcdef");
  assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)).sort(), ["baseline", "cacheKey", "input", "shouldCallAi", "versions"]);
});

test("AI coach state is deterministic first and accepts only terminal AI/cache records", () => {
  const initial = createInitialAiCoachState(context);
  assert.equal(initial.source, "local");
  assert.equal(initial.status, "idle");
  const withBaseline = reduceAiCoachRecord(initial, { type: "baseline", analysis: baseline });
  assert.equal(withBaseline.source, "local");
  const withCache = reduceAiCoachRecord(withBaseline, { type: "done", source: "cache", analysis: baseline });
  assert.equal(withCache.source, "cache");
  assert.equal(withCache.status, "ready");
  const fallback = reduceAiCoachRecord(withCache, { type: "fallback", source: "baseline", analysis: baseline, reason: "timeout" });
  assert.equal(fallback.source, "local");
  assert.equal(fallback.status, "offline");
});
