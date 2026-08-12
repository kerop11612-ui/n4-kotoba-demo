# AI Learning Analysis Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將既有 `buildLearningAnalysisAgentContext` 接到受限的 server-side AI adapter，使用穩定 `cacheKey` 去重每日分析，並在 AI 未連線、逾時、串流中斷或輸出不合法時可靠回退 deterministic baseline。

**Architecture:** 瀏覽器只送出壓縮後的學習 context，不接觸 Codex token 或 App Server protocol。loopback bridge 以注入的 model client 呼叫本機 Codex App Server，adapter 在伺服器端累積完整回應、驗證結果並只快取通過驗證的結構化分析；任何失敗都回傳原本的 deterministic baseline，因此不會阻塞單字瀏覽、作答、FSRS 排程或本機保存。

**Tech Stack:** Node.js built-ins、Codex App Server JSONL client、Next.js 16.3 static export、TypeScript 5.9、Web Crypto SHA-256、Node test runner、既有 CSS Modules。

## Global Constraints

- 閱讀 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`、`05-server-and-client-components.md` 與 `02-guides/static-exports.md`；維持 `output: "export"`，不得用 Next route handler 代替 loopback bridge。
- AI 只能解讀與提出建議，不得修改 FSRS card、rating、due、stability、difficulty 或 desired retention。
- 請求只能包含 `LearningAnalysisAgentContext` 的壓縮資料、版本欄位與必要的 `cacheKey`；不得送出完整 storage export、Codex token、同步金鑰或分析期間外的事件。
- 分析只使用最近 3 個日曆日；最多 5 個 weak items、3 個 findings、1 個主要 action。
- deterministic baseline 永遠先可用；AI 結果只有在完整 JSON、context-aware semantic validation 與終端串流事件都通過後才可取代 baseline。
- 同一同步 vault 每個 `vaultId + analysisDay` 最多一次 AI 分析；未來由同步 Worker lease 保證跨裝置去重，本階段先保留可注入的 lease/cache 介面。
- 不新增套件、不部署、不修改全域設定；資料或 FSRS 變更必須執行 `npm test`，完成前執行 `npm run verify`。
- 390px 與 768px 不得水平捲動；本計畫的 UI 狀態更新仍須保持可操作控制至少 44px。

## Prerequisite and File Map

此計畫承接 `2026-08-11-codex-ai-bridge-plan.md` 的 bounded App Server client；若該 client 尚不存在，先完成其「JSONL App Server client」任務。此計畫只負責 learning-analysis adapter 與現有 bridge 的接線，不重做一般聊天抽屜。

- Modify `src/spaced-repetition/ai-learning-analysis.ts`: 3-day context contract、context-aware validation、版本化 canonical cache input。
- Create `scripts/ai-bridge/learning-analysis-adapter.mjs`: deterministic-first adapter、timeout、stream completion、cache 與 fallback。
- Modify `scripts/ai-bridge/server.mjs`: `/v1/analyze` 接收受限 context 並回傳 NDJSON 結果。
- Modify `src/ai/ai-cache.ts`: 以 canonical JSON 與 SHA-256 產生每日分析 key，拒絕 partial result 入 cache。
- Modify `src/ai/local-ai-client.ts`: 將瀏覽器請求映射成 `/v1/analyze`，不傳遞 credentials 或未允許欄位。
- Modify `app/hooks/useAiCoach.ts`: deterministic-first 顯示、非同步 AI 更新、狀態與重試。
- Modify `package.json`: 將 adapter 整合測試加入 `npm test`。
- Create `tests/ai-learning-adapter.test.mjs`: adapter、cache、bridge fallback 整合測試。
- Modify `TASK.md`: 只記錄本階段完成狀態與下一個 sync/lease 階段。

---

### Task 1: 完成學習 context 與語意驗證契約

**Files:**
- Modify: `src/spaced-repetition/ai-learning-analysis.ts`
- Modify: `tests/spaced-repetition.test.mjs`

**Interfaces:**
- Consumes: `LearningAnalysisInput`、`LearningAnalysisAgentPolicy`。
- Produces: `LearningAnalysisAgentContext`、`validateLearningAnalysisForContext(value, input)`、`createLearningAnalysisCacheKey(input, versions)`。

- [ ] **Step 1: 寫失敗測試，固定 adapter 邊界行為**

```js
test("learning context keeps only recent evidence and has stable versioned cache input", () => {
  const context = buildLearningAnalysisAgentContext(input, thresholds, {
    ...AI_AGENT_POLICY,
    maxWeakItems: 5,
  });
  assert.equal(context.input.weakItems.length, 5);
  assert.equal(context.cacheKey, createLearningAnalysisCacheKey(context.input, {
    promptVersion: "learning-v2",
    schemaVersion: "analysis-v1",
    thresholdVersion: "thresholds-v1",
    analysisDay: "2026-08-11",
    efficiencyPolicyVersion: "efficiency-v1",
    model: "default",
  }));
});

test("context validator rejects unknown ids, empty strings, contradictions, and FSRS mutation fields", () => {
  assert.equal(validateLearningAnalysisForContext(analysisWithUnknownWordId, input), false);
  assert.equal(validateLearningAnalysisForContext(analysisWithEmptyReason, input), false);
  assert.equal(validateLearningAnalysisForContext(overloadedResultWithoutOverloadFinding, input), false);
  assert.equal(validateLearningAnalysisForContext(resultWithDueMutation, input), false);
});
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `npm test -- --test-name-pattern="learning context|context validator"`

Expected: FAIL，因為目前 policy 上限、版本化 cache input 與 context-aware validator 尚未完整提供。

- [ ] **Step 3: 實作 3 天、5 weak items 與版本化 context**

保留 `aggregateLearningAnalysis` 的既有呼叫介面，將 period 內事件與 lifetime memory 統計分開命名；所有證據門檻與 confidence 只使用 period 內次數。將 `AI_AGENT_POLICY.maxWeakItems` 固定為 `5`，findings 固定最多 `3`，recommended actions 固定最多 `1`。在 `LearningAnalysisAgentContext` 中保留：

```ts
export type LearningAnalysisContextVersions = {
  promptVersion: string;
  schemaVersion: string;
  thresholdVersion: string;
  analysisDay: string;
  efficiencyPolicyVersion: string;
  model: string;
};

export interface LearningAnalysisAgentContext {
  input: LearningAnalysisInput;
  baseline: LearningAnalysis;
  cacheKey: string;
  versions: LearningAnalysisContextVersions;
  shouldCallAi: boolean;
}
```

`createLearningAnalysisCacheKey` 對排序後的 canonical JSON 計算 SHA-256；key 必須包含 `analysisDay`、壓縮 input、prompt/schema/threshold/efficiency policy 版本與實際 model identifier。若未提供 model，使用固定字串 `default`，不可把 token 或 auth cache 放進 key。

- [ ] **Step 4: 實作完整 semantic validator 與整體 fallback 條件**

`validateLearningAnalysisForContext` 先執行 shape validation，再確認：所有 `wordIds` 都存在於輸入的 `weakItems` 或其 `confusedWordIds`；finding/action 的字串非空；陣列去重；`overallStatus === "overloaded"` 必須有 `review_overload` finding；`reduce_new_cards` 必須有 review-overload evidence；物件不得含 `due`、`stability`、`difficulty`、`desiredRetention`、`rating` 等 FSRS mutation 欄位。`parseLearningAnalysisJson` 接受 context 並在任一條件失敗時回傳同一份 baseline，不採用部分結果。

- [ ] **Step 5: 執行核心測試並提交**

Run: `npm test`

Expected: 所有既有 FSRS、storage、vocabulary 與 learning-analysis 測試 PASS。

```powershell
git add src/spaced-repetition/ai-learning-analysis.ts tests/spaced-repetition.test.mjs
git commit -m "fix: enforce bounded learning analysis context"
```

### Task 2: 建立 deterministic-first server-side adapter

**Files:**
- Create: `scripts/ai-bridge/learning-analysis-adapter.mjs`
- Modify: `src/ai/ai-cache.ts`
- Create: `tests/ai-learning-adapter.test.mjs`

**Interfaces:**
- Consumes: `LearningAnalysisAgentContext`、`LearningAnalysisModel`、`AnalysisCache`；bridge 以 `AppServerClient.runTurn()` 實作 `LearningAnalysisModel`。
- Produces: `createLearningAnalysisAdapter(deps)` 與 `adapter.analyze(context, options)`。

- [ ] **Step 1: 寫失敗的 adapter contract tests**

```js
test("adapter returns baseline without calling model when evidence is insufficient", async () => {
  const model = fakeModelThatFailsIfCalled();
  const adapter = createLearningAnalysisAdapter({ model, cache: memoryCache() });
  const result = await adapter.analyze(insufficientContext);
  assert.equal(result.source, "baseline");
  assert.equal(model.calls, 0);
});

test("adapter caches only a validated terminal result", async () => {
  const model = fakeStreamingModel([delta(validJson), done({ model: "default" })]);
  const cache = memoryCache();
  const adapter = createLearningAnalysisAdapter({ model, cache, timeoutMs: 1000 });
  const first = await adapter.analyze(validContext);
  const second = await adapter.analyze(validContext);
  assert.equal(first.source, "ai");
  assert.equal(second.source, "cache");
  assert.equal(model.calls, 1);
});
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `node --experimental-strip-types --test tests/ai-learning-adapter.test.mjs --test-name-pattern="adapter"`

Expected: FAIL，因為 adapter 與 cache contract 尚未存在。

- [ ] **Step 3: 定義可注入的 server-side adapter**

先固定 bridge 與 adapter 的窄介面；`AppServerClient.runTurn()` 只在 bridge 內轉成 `LearningAnalysisModel.complete()`，adapter 不接觸 JSONL method、任意 command、shell、MCP 或 filesystem 參數。

```js
export function createLearningAnalysisModel(appServerClient) {
  return {
    async *complete({ prompt, signal }) {
      for await (const event of appServerClient.runTurn({ input: prompt, signal })) {
        yield event;
      }
    },
  };
}
```

```js
export function createLearningAnalysisAdapter({
  model,
  cache,
  clock = () => Date.now(),
  timeoutMs = 15_000,
}) {
  return { async analyze(context, { signal } = {}) { /* contract below */ } };
}
```

`LearningAnalysisModel.complete` 的輸入固定為 `{ prompt, signal }`，輸出為 `{ type: "delta", text }` 或 `{ type: "done", model }` 的 async iterable。`analyze` 的順序固定為：`shouldCallAi === false` 回傳 baseline；cache 命中且 key、analysisDay、schemaVersion 都符合時回傳 cache；否則建立固定 system prompt 與 JSON schema request，呼叫 `model.complete({ prompt, signal })`；只累積 `delta`，收到 `done` 後才 parse；以 context-aware validator 驗證後才寫 cache。成功回傳 `{ source: "ai", analysis, cacheKey, model, completedAt }`。逾時、AbortError、App Server 未登入、process exit、串流未收到 done、超過 50,000 字、非法 JSON 或 semantic validation 失敗，全部回傳 `{ source: "baseline", analysis: context.baseline, cacheKey, reason }`。

- [ ] **Step 4: 實作 cache 的原子寫入與 partial-stream 防護**

`AnalysisCache` 介面如下：

```ts
export interface AnalysisCache {
  get(key: string): Promise<CachedAnalysis | null>;
  put(value: CachedAnalysis): Promise<void>;
}
```

先完成 schema validation，再以單次 `put` 寫入完整 payload；任何 delta、未完成 response 或 baseline 不得寫入 AI cache。cache failure 只能讓本次結果回到 baseline，不得讓使用者的本機學習流程失敗。測試記錄 cache write 次數，確認 timeout、invalid JSON 與 stream interruption 都是 0。

- [ ] **Step 5: 執行 adapter 測試並提交**

Run: `node --experimental-strip-types --test tests/ai-learning-adapter.test.mjs --test-name-pattern="adapter|cache"`

Expected: PASS，涵蓋 baseline、AI success、cache hit、timeout、abort、未登入、斷流、非法 JSON、未知 word ID、FSRS mutation 與 cache write failure。

```powershell
git add scripts/ai-bridge/learning-analysis-adapter.mjs src/ai/ai-cache.ts tests/ai-learning-adapter.test.mjs
git commit -m "feat: add deterministic-first learning analysis adapter"
```

### Task 3: 將 adapter 接入 loopback bridge 與瀏覽器 client

**Files:**
- Modify: `scripts/ai-bridge/server.mjs`
- Modify: `src/ai/local-ai-client.ts`
- Modify: `app/hooks/useAiCoach.ts`
- Modify: `tests/ai-learning-adapter.test.mjs`

**Interfaces:**
- Consumes: `POST /v1/analyze` 的 `LearningAnalysisAgentContext`。
- Produces: NDJSON `{ type: "baseline" | "delta" | "done" | "fallback", ... }` 與 `LocalAiClient.analyzeLearning()`。

- [ ] **Step 1: 寫 bridge/client 整合測試**

```js
test("analyze endpoint emits baseline before asynchronous AI result", async () => {
  const response = await postAnalyze(validContext, { model: delayedValidModel() });
  assert.deepEqual(response.records.map((record) => record.type), ["baseline", "delta", "done"]);
});

test("bridge fallback keeps study available when model times out", async () => {
  const response = await postAnalyze(validContext, { model: neverCompletes(), timeoutMs: 10 });
  assert.equal(response.records.at(-1).type, "fallback");
  assert.deepEqual(response.records.at(-1).analysis, validContext.baseline);
});
```

- [ ] **Step 2: 實作 `/v1/analyze` 的輸入邊界**

沿用既有 bridge 的 loopback bind、Origin allowlist、短效 session token、JSON content type 與 32 KiB body limit。只接受 `input`、`baseline`、`cacheKey`、`versions`、`shouldCallAi`；未知欄位直接回 400，session、Codex credentials、sync keys 與完整 export 不得進入 adapter。先送 `baseline` record，再將 model delta 轉成 NDJSON；只有 adapter 的 validated AI result 才能送 `done`，其他錯誤送 `fallback` 並隱藏 command line、filesystem path 與 credential。

- [ ] **Step 3: 實作 `LocalAiClient.analyzeLearning` 與 abort**

瀏覽器 client 只呼叫 `http://127.0.0.1:<port>/v1/analyze`，以 `X-N4-AI-Session` 傳短效 session token；不把 App Server protocol 暴露給 React。`useAiCoach` 在 mount 或 context 改變時先設定 `source: "local"` 顯示 baseline，再非同步消費 stream；收到 `done` 才更新為 `source: "ai"` 或 `source: "cache"`。Stop、頁面卸載與新 context 都要 abort 舊 request，舊 stream 不得覆蓋新 recommendation。

- [ ] **Step 4: 驗證橋接失敗不阻塞既有複習**

使用 bridge stopped、session expired、HTTP 500、timeout、malformed NDJSON 五種 fixture 執行首頁與單元頁的 existing review flow；預期單字顯示、作答、atomic commit、FSRS rating 與完成摘要仍可用，只顯示 `本機規則` 或 `Codex 未連線`。

- [ ] **Step 5: 執行分層檢查並提交**

Run: `npm run check:fast`

Expected: TypeScript、app lint、所有核心測試與 adapter 整合測試 PASS。

```powershell
git add scripts/ai-bridge/server.mjs src/ai/local-ai-client.ts app/hooks/useAiCoach.ts tests/ai-learning-adapter.test.mjs
git commit -m "feat: connect learning analysis to local AI bridge"
```

### Task 4: 完成 package、狀態文件與 full verification

**Files:**
- Modify: `package.json`
- Modify: `TASK.md`

- [ ] **Step 1: 將新測試納入既有 test script**

把 `tests/ai-learning-adapter.test.mjs` 加入 `npm test` 的明確檔案清單，不改動既有 `--experimental-strip-types`、Node test runner 或其他 dependency。

- [ ] **Step 2: 執行完整驗證**

Run: `npm run verify`

Expected: lint、全部核心與 adapter 測試、TypeScript 檢查及 static production build PASS；若 bridge 未啟動，測試仍以 deterministic fallback 完成，不以外部登入狀態作為成功條件。

- [ ] **Step 3: 只更新目前狀態與下一步**

在 `TASK.md` 保留既有已完成事項，新增「context-aware semantic validation、cacheKey 去重、server-side adapter、timeout/invalid JSON/stream fallback integration tests 已完成」；下一步改為「建立 `vaultId + analysisDay` lease 與加密分析 cache 的雙裝置同步」。不要記錄 token、localhost session secret 或個人學習資料。

- [ ] **Step 4: 提交文件變更**

```powershell
git add package.json package-lock.json TASK.md
git commit -m "docs: record AI analysis adapter integration"
```
