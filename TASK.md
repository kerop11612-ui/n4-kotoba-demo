# Current Task

## 目前狀態

- 已完成單字記憶架構優化（Work Package 1: Rating Evidence Contract & Scheduler Profile Isolation）。
- 已完成單字掌握度引擎與弱點模型（Work Package 2: Per-Skill Mastery and Predictive Weakness）。
- 已完成 Meta Scheduler、重試語意與 Leech 恢復流程（Work Package 3: Meta Scheduler, Retry Semantics, and Leech Recovery）。
- 已完成產品整合與發布驗證（Work Package 4: Product Integration & Release Verification）：
  1. **三項核心技能掌握度 UI 整合**：單字卡以 `VocabularyMastery` 真實快照呈現 `看懂（日→中）`、`想得出來（中→日）`、`語境運用`；未知狀態顯示「尚未練習」，證據不足顯示「資料累積中」，不偽造 0%。
  2. **練習推薦原因語意整合**：練習區只依 `PracticePlanItem.reason` 顯示去重後的安排原因；沒有 reason 時不渲染原因區塊。
  3. **專注列印設定減負**：用途改為快速選擇，題目設定與進階顯示分組；進階選項預設收合，並提供清楚的「開始列印」主按鈕。
  3. **合約與端到端多技能重放測試**：在 `tests/ui-contract.test.mjs` 與 `tests/learning-sync.test.mjs` 加入多裝置、跨 3 種技能、鷹架練習與無序重放等冪性驗證。
  4. **手機優先 390px 佈局與可及性確認**：無水平捲動，觸控互動目標均達 44px 以上。
- 驗證通過：聚焦 UI／列印測試（12/12）、`npm run check:types`、`npm run lint:app`（0 錯誤，4 個既有 warning）、`npm test`（173/173）、`npm run build`（靜態網頁與 API 輸出成功）；390×844 首頁、`/practice` 與列印設定頁均無水平捲動。
- 已知工具問題：`npm run check` 仍會掃描 `.worktrees/**/.next` 與 `.worktrees/**/out` 產物，本次未修改全域 ESLint 設定。

## 下一步

1. 彙整全 4 個 Work Package 的成果回報供審查。
2. 規劃未來的多設備雲端即時同步實機測試與效能監控。
