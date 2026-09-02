# 日文單字記憶架構設計規格

## 目標

在保留 `ts-fsrs` 作為間隔排程核心的前提下，建立可區分 receptive、productive、contextual 的單字知識模型、可預測弱化的 Meta Scheduler，以及能引導不同練習方式的 Leech workflow。系統必須能選出今日最值得練習的單字，同時避免把提示、答案揭曉或反應時間直接混入 FSRS 數學模型。

## 非目標

- 不自行修改 FSRS Stability、Difficulty、forgetting curve 或 interval 公式。
- 不把一個 skill 的成功直接傳播到另一張 FSRS card。
- 不在沒有 calibration evidence 前推出任意加權的 0–100 unfamiliarity score。
- 不在本階段導入 HLR、Bayesian framework、神經網路、FSRS-7 beta 或新 npm package。
- 不部署、不修改 Supabase schema、不改全域設定。
- 不重做既有 UI；只新增使用者理解與操作新模型所需的最小介面。

## 核心責任

```text
FSRS Core
= 單一 memory skill 的下次正式測量時間

Review Evidence
= 這次作答實際發生什麼，以及哪些證據可餵給 FSRS

Vocabulary Mastery
= receptive / productive / contextual 的目前程度、信心與資料品質

Meta Scheduler
= 今天從所有 vocabulary 與 skill 中選哪些正式複習、診斷或 scaffold

Practice Generator
= 使用哪一種題型、提示階梯與 leech 介入方式
```

## 評分證據契約

一次 review 必須分開保存：

- `rawUserRating`：使用者按下的 Again／Hard／Good／Easy。
- `effectiveFsrsRating`：實際送入 FSRS 的 1／2／3／4。
- `ratingMappingReason`：為何兩者相同或不同。
- `correct`：題目是否客觀或自評正確。
- `usedHint`：在形成答案前是否取得人工提示。
- `answerRevealedBeforeResponse`：形成答案前是否看過完整答案。
- `answerFeedbackShownAfterResponse`：作答完成後是否正常顯示解答；此欄不影響 grade。
- `responseTimeMs`：只作為 telemetry 與 mastery evidence。
- `fsrsUpdateEligible`：這次是否已到正式測量時點；未到期的 session retry 與 scaffold 為 false。

正式規則：

```text
incorrect                              → Again
answerRevealedBeforeResponse           → Again
usedHint                               → Again
independent Hard                       → Hard
independent Good                       → Good
independent Easy                       → Easy
slow independent Good                  → Good + slow_recall telemetry
instructional scaffold without test    → 不呼叫 FSRS
```

這個規格刻意不將慢速 Good 自動降為 Hard。Hard 表示使用者確實回想成功但主觀困難；response time 趨勢由 Mastery/Weakness 模型解讀。

例句填空答對後顯示答案屬於 `answerFeedbackShownAfterResponse`，不是 `answerRevealedBeforeResponse`。第二次答錯後直接顯示答案，才是後者。

## Scheduler Profile 與 Replay

每一筆新 review event 必須帶有：

```ts
export type FsrsSchedulerProfile = {
  id: string;
  algorithm: "FSRS-6";
  packageName: "ts-fsrs";
  packageVersion: string;
  parameters: readonly number[];
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: readonly string[];
  relearningSteps: readonly string[];
};
```

目前 legacy profile 固定代表 `ts-fsrs 5.4.1 + FSRS-6 + retention 0.90 + 現有短期設定`。升級 profile 時，先為每張卡產生 cutoff snapshot；舊事件不使用新 profile 重新解讀，只從 snapshot 後重播新事件。

## Attempt 類型

```ts
export type ReviewAttemptKind =
  | "scheduled"
  | "diagnostic"
  | "retry"
  | "scaffold";
```

- `scheduled`：FSRS 到期或正式 Meta Scheduler 選中的記憶測量，會更新 FSRS。
- `diagnostic`：為消除 mastery uncertainty 或 weakness risk 而安排的無提示測量，會更新該 skill 的 FSRS。
- `retry`：短 session 內再次測量；只有已到達 FSRS learning/relearning due 時才更新 FSRS，否則記 telemetry 但不重複更新。
- `scaffold`：教學介入，不更新 FSRS。

## Per-Skill Mastery

第一版不建立未校準的浮點模型，使用可解釋 snapshot：

```ts
export type MasteryBand =
  | "unknown"
  | "likely_unfamiliar"
  | "uncertain"
  | "likely_familiar";

export type EvidenceConfidence = "low" | "medium" | "high";

export type SkillMasterySnapshot = {
  skill: "jp_to_meaning" | "meaning_to_jp" | "context_to_word";
  band: MasteryBand;
  confidence: EvidenceConfidence;
  retrievabilityNow: number | null;
  retrievabilityAtHorizon: number | null;
  independentAttempts: number;
  independentSuccesses: number;
  assistedSuccesses: number;
  recentIndependentFailures: number;
  responseTrend: "unknown" | "stable" | "slower" | "faster";
  reasons: string[];
};

export type VocabularyMastery = {
  wordId: string;
  receptive: SkillMasterySnapshot;
  productive: SkillMasterySnapshot;
  contextual: SkillMasterySnapshot;
  crossSkillDisagreement: boolean;
  unfamiliarityBand: MasteryBand;
  weaknessRisk: "unknown" | "low" | "medium" | "high";
  confidence: EvidenceConfidence;
};
```

`unknown` 不得被顯示成 0% 或 100% 不熟。第一版的 band 邏輯使用命名 policy constant，並以 tests 固定；數值門檻不得散落於 UI 或 queue。

response trend 必須依「同一使用者 + 同一 skill + 同一 format」的近期有效獨立作答比較，不跨題型使用固定秒數。

## Unfamiliarity 與 Weakness

```text
Unfamiliarity
= 現在進行標準化無提示測量時的知識缺口

Weakness Risk
= 尚未明確失敗，但在近期時間窗內轉為失敗的風險
```

第一版 `weaknessRisk = high` 必須同時具備至少兩個不同 signal family，例如：

- 未來 retrievability 明顯下降。
- 獨立成功的 normalized response time 持續變慢。
- Good 逐漸轉 Hard。
- productive/contextual 成功率下降。
- cross-skill disagreement 擴大。

單一慢速回答、單一 Hard 或單一低 R 不足以建立高風險。資料不足時安排 diagnostic，而不是直接宣告不熟。

## Cross-Skill 策略

每個 active skill 保留獨立 FSRS card：

```text
jp_to_meaning  → receptive
meaning_to_jp  → productive
context_to_word → contextual
```

允許的跨技能作用：

- vocabulary-level confidence 更新。
- cross-skill disagreement 判定。
- Meta Scheduler 的 bounded queue suppression。
- 較難方向成功後，降低同 session 較容易方向的非必要 priority。

禁止的作用：

- 修改另一張卡的 Stability 或 Difficulty。
- 將另一 skill 標成已複習。
- 永久移除另一 skill 的 due review。

## Meta Scheduler

候選項目以 `wordId + skill + attemptKind` 表示。排序為 lexicographic policy，不使用未校準的線性總分：

1. 已到期 scheduled review。
2. 高 weakness risk 的 diagnostic。
3. likely unfamiliar 且有足夠 confidence 的 skill。
4. cross-skill disagreement diagnostic。
5. 新 skill acquisition。
6. 其他 stable cards 不用來湊滿 session。

同 priority 內才依 due、retrievability、recent exposure 與 deterministic tie-break 排序。queue 必須能少於上限；上限不是最低題數。

## Leech State

```ts
export type LeechState =
  | "normal"
  | "struggling"
  | "leech"
  | "scaffolded"
  | "recovering"
  | "mastered";
```

```text
normal
  → struggling：跨 session 的獨立失敗或持續提示依賴
  → leech：跨日、跨題型仍失敗，或同一 confused-word pattern 重複
  → scaffolded：已啟動拆解、對比、例句或假名介入
  → recovering：scaffold 後完成無提示 diagnostic
  → mastered：間隔後再次完成獨立 retrieval
```

任何後續獨立失敗都可從 `recovering` 或 `mastered` 回到 `struggling`。Leech transition policy 集中在單一 pure module，不能由 UI 自行判斷。

## Storage 與相容性

- schema v3 採 additive migration，保留 v1/v2 匯入。
- legacy 欄位不足時標記 `unknown`，不能虛構 response、session 或 reveal timing。
- 第一個 release 保留 `history` 與 `events` 相容 projection，不立即刪除欄位。
- IndexedDB 將 memory snapshots、review attempts 與同步狀態分 store，避免每次複習重寫完整資料。
- 任何 migration 先 clone/validate，全部成功後才切換 active schema。
- 使用者取消或 migration 失敗時保留既有資料。

## 日文特徵

可先新增或衍生：

- `partOfSpeech`
- `scriptType`
- `hasKanji`
- `wordLength`
- `moraCount`
- 後續資料可用時再加入 frequency、cognate、transitivity pair、confusion set。

這些特徵只進 telemetry 與分析資料集；第一版不乘上 FSRS Difficulty。

## 個人化上線門檻

第一版只使用 FSRS defaults 與 rule-based mastery。未來 optimizer/model 必須：

1. 在 historical time-split replay 上優於 default profile。
2. 同時改善 log loss、calibration 與 workload simulation，而非只改善 training loss。
3. 對 receptive、productive、contextual 分別檢查偏差。
4. 允許資料不足的使用者繼續使用 default/neutral prior。
5. 每次 profile 切換建立 snapshot cutoff，並可回復。

## 驗收結果

完成 Conservative Option A 後，系統必須能以可解釋理由回答：

- 今日最需要複習哪 15 個單字與技能。
- 哪些單字 receptive 熟、productive 弱。
- 哪些單字尚未答錯但 weakness risk 上升。
- 哪些單字已進入 scaffolded/recovering。
- 哪些 stable cards 今天沒有必要出現。
