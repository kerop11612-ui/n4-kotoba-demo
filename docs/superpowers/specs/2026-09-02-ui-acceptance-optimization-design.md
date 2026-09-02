# UI 驗收修整設計

## 目標

修正單字庫與練習區中已通過文字合約、但尚未正確連接真實資料或未符合手機觸控規格的介面，不改變既有視覺語言、資料格式與學習流程。

## 驗收發現

- 390px 視窗沒有水平捲動。
- 單字卡的「掌握度細項」使用不存在的 CSS Module class，瀏覽器呈現預設樣式；實測 summary 高度約 23px，低於 44px。
- `WordCard` 只收到 `jp_to_meaning` 的單筆 memory，因此另外兩項技能永遠顯示「資料不足」，不能代表實際多技能記錄。
- 練習推薦卡固定顯示「需要診斷」與「改用提示練習」，未讀取 `PracticePlanItem.reason`，可能與實際練習內容不符。
- `npm run check` 會掃描 `.worktrees/**/.next` 與 `.worktrees/**/out` 產物而失敗；本次不擴張範圍修改 ESLint 設定。

## 設計決策

1. 首頁以既有 `calculateVocabularyMastery()` 對每個單字建立三技能快照，將完整 `VocabularyMastery` 傳入 `WordCard`。
2. 技能文字只呈現可由快照證明的狀態：`unknown` 顯示「尚未練習」、低信心顯示「資料累積中」、有 30 天預測才顯示百分比。
3. 練習原因只從 `practiceItems[].reason` 產生；沒有任何 reason 時整個「安排原因」區塊不渲染。
4. 推薦原因中文映射集中在純函式，去重並保持排程順序，避免頁面內散落固定文案。
5. 「掌握度細項」保留原生 `<details>/<summary>` 語意，補齊 44px 觸控區、鍵盤焦點、展開狀態、三列資訊排版與 390px 換行。
6. 不新增套件、不改 FSRS 演算法、不改儲存格式、不重構其他頁面。

## 完成條件

- 三技能各自顯示真實且可解釋的狀態。
- 練習原因不再出現與 `practiceItems` 不一致的固定標籤。
- 390×844 下首頁與練習頁均無水平捲動。
- 所有互動式 summary 與按鈕至少 44px 高，焦點狀態清楚。
- `npm run check:types`、`npm run lint:app`、`npm test`、`npm run build` 通過。

