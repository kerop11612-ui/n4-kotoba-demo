# 自適應提示練習設計

## 目標

將 `/practice` 優化為以主動回想為核心的「今日最佳練習」：每一題可依單字目前最需要加強的技能選擇日文到中文、中文到日文或例句填空，並提供逐步提示、延後重試與可解釋的完成摘要。

## 範圍

- 保留既有 FSRS、MemoryRepository、append-only learning events、離線 outbox 與同步格式。
- 保留三種單一題型，移至「自訂練習」。
- 新增預設的「今日最佳練習」，每個單字每輪只選一種主要題型。
- 使用提示仍視為非獨立回想：FSRS 維持 `Again`，摘要另記為「提示後完成」。
- 無法可靠挖空的題目改用中文到日文，不顯示技術性 fallback 訊息。
- 答錯或使用提示的題目在兩個其他題目之後重試一次；每題、每輪都設上限。
- practice session 升級為 version 2，並可讀取 version 1。
- 不新增套件、不部署、不建立 Supabase 專案、不改全域設定。

## 題目模型

每一題使用 `PracticePlanItem`，身分由 `wordId + format` 組成：

```ts
export type PracticePlanItem = {
  itemId: string;
  wordId: string;
  unitId: string;
  format: ReviewFormat;
  skill: MemorySkill;
};
```

session 儲存目前完整 queue；延後重試可再次插入同一 `itemId`，而 `retryItemIds` 確保每個主要題目最多安排一次重試。結果仍保存 `wordId` 與 `reviewFormat`，不變更既有 learning event schema。

## 推薦規則

1. 僅使用至少完成一次 `jp_to_meaning` 回想的單字。
2. 先沿用既有 focused queue，決定本輪單字與到期／弱項優先順序。
3. 每個單字從可用題型中選擇目前 retrievability 最低的已建立技能。
4. 尚未建立的 `meaning_to_jp` 或 `context_to_word` 可作為技能拓展題，但每輪最多占 30%。
5. `cloze` 只有在 `createClozeSentence(...).replaced === true` 時可選。
6. 不讓同一題型連續超過兩題；不改變到期題優先於弱項、弱項優先於穩定題的核心順序。
7. 自訂模式直接將 focused queue 映射為使用者指定的單一格式。

## 提示階梯

- 日文到中文：挖空例句 → 完整例句 → 顯示答案。
- 中文到日文：字數 → 第一個假名 → 第二個假名或音檔 → 顯示答案。
- 例句填空：首次提交前不提示；第一次錯誤後提供第一個假名，再提供第二個假名或音檔；第二次錯誤後顯示答案。

提示種類以 `HintKind[]` 記錄，`HintLevel` 繼續保存最高階層以維持既有事件與統計相容。播放題目本身的音訊不能自動發生，避免洩漏答案。

## 評分與重試

- 未使用提示且正確：依現有 raw rating／客觀結果更新 FSRS。
- 使用任何人工提示：保留畫面上的成功狀態，但 FSRS 為 `Again`。
- 單純揭曉答案不算人工提示；若使用者自評 `again`，仍安排重試。
- 提示或失敗題插入目前索引後第三個位置，即中間至少隔兩題；短 queue 則插入尾端。
- 同一 `itemId` 每輪最多重試一次，避免無限 session。

## UI

- `/practice` 預設顯示「今日最佳練習」與推薦原因。
- 「自訂練習」展開後才顯示三種單一題型。
- 答題卡頂部顯示本題題型，切題時保持主要操作區位置穩定。
- 完成摘要分為「獨立答對」、「提示後完成」、「需要再看」，另列三個技能的題數與結果；不把客觀填空與自評題混成單一答對率。
- 390px 不得水平捲動，互動目標至少 44px，動態回饋使用適量 `aria-live`，切題後焦點回到題目標題或輸入欄。

## 相容與失敗處理

- version 1 session 讀取時，將共同 `format` 套用至每個 `wordRef`，在下一次寫入時保存為 version 2。
- 缺失單字只移除對應題目；若剩餘 queue 為空，清除 session 並回到練習區。
- 某題 cloze 在恢復時失去可用例句，轉成 `zh-to-jp`，並以新的 `itemId` 繼續。
- repository commit 失敗時停留原題，不能前進索引或重複插入 retry。

## 驗收

- 純函式測試涵蓋推薦上限、cloze eligibility、格式交錯、composite retry、version 1 migration 與 version 2 round-trip。
- 既有 142 項以上測試保持通過，資料／FSRS 修改必須執行 `npm test`。
- 通過 `npm run check:types`、`npm run lint:app` 與 `npm run build`。
- 390px 與 1440px 驗收開始、提示、答錯、重試、暫停、恢復及完成摘要，且無水平溢出。
