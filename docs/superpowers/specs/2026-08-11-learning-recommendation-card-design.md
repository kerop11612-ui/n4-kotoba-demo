# N4 ことば帳：學習建議卡設計

日期：2026-08-11  
狀態：使用者已核准本輪範圍，待實作前檢閱

## 1. 目標

將既有 deterministic learning analysis 接到首頁與單元頁，讓使用者一進入頁面就看見一個可執行的下一步。建議卡必須在沒有 AI、bridge 或網路時仍正常顯示，不能延遲單字瀏覽或 FSRS 複習。

本輪只完成建議卡；聊天抽屜、串流聊天、停止／重試聊天與「為什麼推薦？」的實際對話功能延後至下一輪。

## 2. 顯示位置與內容

### 2.1 首頁

在既有今日學習區塊附近顯示全局建議卡。建議依序使用：到期複習、到期量過載時減少新字、單元保持率偏低時聚焦複習、負擔正常時新增最多 5 個新字、證據不足時累積更多複習。

首頁卡片保留既有「開始今日學習」主要入口，不破壞章節進度、統計、資料匯入／匯出與章節導覽。

### 2.2 單元頁

在 `MasterySummary` 後、`LearningToolbar` 前顯示目前單元的建議卡。弱單字建議使用本機 deterministic queue，預設最多 5 題；到期複習沿用既有 `toggleReview`；證據不足時顯示還需要累積的複習次數，不呼叫 AI。

## 3. 卡片介面

共用元件 `LearningRecommendationCard` 接收：

```ts
type LearningRecommendationViewModel = {
  title: string;
  reason: string;
  action: "weak_practice" | "due_review" | "reduce_new_cards" | "learn_new" | "gather_evidence";
  evidenceLabel: string;
  confidencePercent: number | null;
};

type LearningRecommendationCardProps = {
  recommendation: LearningRecommendationViewModel;
  sourceLabel: "本機規則" | "AI 分析" | "快取";
  generatedAt?: string | null;
  onStart: () => void;
  onAskWhy?: () => void;
};
```

卡片內容固定包含：

- 來源狀態標籤：`本機規則`、`AI 分析` 或 `快取`。
- 一個建議標題與一段簡短原因。
- 證據量與信心值；證據不足時信心顯示「資料不足」，不顯示假百分比。
- 最近分析時間；尚未有 AI 分析時可顯示「剛剛由本機規則產生」。
- 一個主要行動按鈕，文字依 action 映射為「開始到期複習」、「開始弱單字練習」、「暫停新增單字」、「開始學新字」或「繼續累積資料」。
- 一個次要「為什麼推薦？」按鈕；本輪只呼叫 `onAskWhy`，不開啟聊天抽屜，也不送出 AI request。

## 4. 資料流與責任邊界

```text
MemoryRepository + vocabulary
        ↓
buildLearningAnalysisAgentContext
        ↓
buildHomeRecommendation / buildUnitRecommendation
        ↓
LearningRecommendationCard
        ↓
existing review actions
```

`buildHomeRecommendation` 與 `buildUnitRecommendation` 必須是純函式，方便在 Node test runner 驗證排序與 action。React hook 只負責組合目前頁面的 memory／event 資料與 memoized view model，不修改 FSRS。

AI source 在本輪只沿用 `useAiCoach` 可提供的狀態；即使 AI stream 逾時、輸出非法或 bridge 不存在，也必須立即使用同一份 deterministic recommendation。卡片不可用 loading skeleton 取代本機結果。

## 5. 響應式與可及性

- 390px 預設為單欄，卡片內按鈕上下排列；768px 可維持文字區與操作區左右排列。
- 所有按鈕 `min-height: 44px`，按鈕間保留至少 8px 間距。
- 使用語意標題、`aria-live="polite"` 更新來源／狀態，不以顏色單獨傳達信心或錯誤。
- Tab 順序依序為卡片內容、主要行動、次要行動；focus ring 使用既有全域樣式。
- 不依賴 hover 顯示原因或操作；手機與鍵盤都可完成主要行動。
- 390px 與 768px 不得出現水平捲動。

## 6. 錯誤與空狀態

- vocabulary 尚未載入：不渲染空的建議卡，沿用現有載入狀態。
- 本機資料不足：渲染「繼續累積資料」建議，並提供前往單元或開始第一個單字的主要按鈕。
- AI 未連線、逾時、非法 JSON 或 cache failure：卡片維持 `本機規則`，不顯示技術錯誤堆疊。
- 建議 action 找不到可用單字：退回既有到期複習或單元入口，不建立空複習佇列。

## 7. 測試與驗收

### 單元測試

- 到期卡存在時首頁優先推薦到期複習。
- 到期量過載時推薦減少新字。
- 單元弱項存在時推薦 5 題 deterministic weak practice。
- 證據不足時不呼叫 AI，confidence 為 `null`。
- 卡片 action 與 `onStart`／`onAskWhy` 正確映射。

### UI 驗收

- 首頁與單元頁都能看見一張建議卡。
- AI bridge 停止時仍能瀏覽單字、開始複習、完成作答與保存 FSRS。
- 390px／768px 無水平捲動。
- Tab 可到達兩個按鈕，focus ring 清楚，按鈕至少 44px。

## 8. 不在本輪範圍

- 聊天抽屜與一般日文問答。
- 「為什麼推薦？」的實際 AI 對話。
- AI 自動修改 FSRS card 或排程。
- 跨裝置同步建議與聊天內容。
