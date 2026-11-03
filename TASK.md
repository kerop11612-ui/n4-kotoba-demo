# Current Task

## 目前狀態

- `/practice` 已接上 adaptive per-card format、重試佇列、提示階梯、推薦優先與可展開自訂練習。
- 保存資料匯入會拒絕空白、格式錯誤、部分損毀與全無效備份，並保留既有資料與匯入前備份。
- 首頁、單字庫、收藏頁與列印頁已完成手機優先 UI；單字庫寬螢幕 3／2／1 欄。
- 已清除 AI 殘留：`src/ai/`、`scripts/ai-bridge/`、`useAiCoach`、`useCodexUsage`、`dev:ai-bridge` 與對應測試；保留非 UI 的 `ai-learning-analysis.ts`。
- `npm test` 改為掃描 `tests/*.test.mjs`；`AGENTS.md` 新增程式碼地圖與維護規則。
- 驗證：`check:fast` 通過（型別、lint、122 項測試）。

## 下一步

1. 瀏覽器實測 `/practice` 的提示、答錯、延後重試、暫停／恢復與完成摘要。
2. 確認音訊（約 75MB）與詞庫 JSON（約 733KB）按需載入。
3. 補 IndexedDB 端到端測試，再評估分開保存記憶卡與複習事件。
4. 逐頁拆分 `app/demo.module.css`（2307 行），每次一頁並以 390px 驗證。
5. 評估 `ai-learning-analysis.ts`（698 行）是否仍有使用者，無用則移除。
