# Current Task

## 目前狀態

- 熟練度已改為 FSRS 目前記憶率與 30 天保持率快照，不再使用 `accuracy × retention`。
- 日文→中文、中文→日文、例句填空使用獨立的 FSRS Card 與記憶鍵。
- 每次作答會保存技能、提示、正確性、反應時間、錯誤類型與 FSRS 前測預測值。
- 已新增向後相容的 schema v2 migration，不刪除舊資料。
- 已新增 deterministic learning signals、AI 輸出 schema 驗證與非法 JSON fallback；AI 不可修改 FSRS。
- AI Agent 已新增本地先分流、輸入壓縮與穩定 cache key；證據不足時不呼叫 AI，且分析期間外的卡片不送入 context。
- UI 顯示 30 天保持率、目前記憶率、無提示答對率與提示依賴率。
- UI 已拆出 `MasterySummary`、`ReviewPanel`、`ReviewRatingButtons` 與 `WordCard`；`page.tsx` 已由 1185 行降至約 840 行。
- 例句填空現在會先顯示例句中文翻譯，再呈現日文挖空與作答欄位。
- 中文→日文已加入字數、首個假名、音檔與答案的逐級提示。
- 例句填空第一次答錯後可選擇顯示首個假名或再次播放單字音檔；二次作答才進入結果。
- 填空第一次答錯後第二次答對，不再記為完全獨立回想。
- 已新增 `check:types`、`lint:app`、`test:core` 與 `check:fast`，可先做分層快速驗證。
- 21 項測試、ESLint、TypeScript 檢查與 production build 已通過。
- 本輪維持本機開發，尚未部署。

## 下一步

1. 將 `buildLearningAnalysisAgentContext` 接到實際 AI adapter，使用 `cacheKey` 避免重複呼叫；再依實際學習資料校準 `FSRS_TUNING` 與 `ANALYSIS_THRESHOLDS`。
