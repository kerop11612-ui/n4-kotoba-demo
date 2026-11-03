# N4 ことば帳 Demo

## 回覆與工作方式

- 使用繁體中文，結論優先。
- 先讀 `TASK.md`，只檢查與任務直接相關的檔案。
- 採用：檢查 → 最小修改 → 聚焦測試。
- 保留既有 UI、資料格式與功能；不做推測性重構。
- 未明確要求時，不部署、不新增套件、不修改全域設定。

## 專案範圍

- 手機優先的 JLPT N4 單字學習 Demo。
- `app/`：頁面與樣式。
- `src/spaced-repetition/`：FSRS、提示與複習佇列。
- `src/storage/`：瀏覽器本機學習紀錄。
- `public/`：第 1 章第 1 節的單字 JSON 與音訊。
- `tests/`：間隔複習核心測試。

## 程式碼地圖（改動前先對照）

| 要改的事 | 先看 | 對應測試 |
| --- | --- | --- |
| 首頁／今日推薦 | `app/home/`、`hooks/useLearningRecommendation.ts` | `ui-contract` |
| 單字庫、單字卡 | `app/page.tsx`、`components/WordCard.tsx`、`demo.module.css` | `typography-layout`、`meaning-hover-reveal` |
| 練習 `/practice` | `hooks/usePracticeSession.ts`、`src/spaced-repetition/practice-*.ts` | `practice-area`、`spaced-repetition` |
| 複習與 FSRS | `src/spaced-repetition/fsrs-*.ts`、`review-*.ts` | `spaced-repetition` |
| 列印 `/print` | `app/print/print-utils.ts`（邏輯）、`page.tsx`（UI） | `print-utils`、`print-recommendation` |
| 儲存與備份匯入 | `src/storage/`（IndexedDB、memory-migration） | `spaced-repetition` |
| 雲端同步（選配） | `src/sync/` | `sync-contract`、`learning-sync` |
| 詞庫解析 | `src/vocabulary/` | `vocabulary` |

## 維護規則

- 新測試放 `tests/*.test.mjs`，`npm test` 自動掃描，不需改 `package.json`。
- 頁面邏輯放 hooks 或 `src/`，`page.tsx` 只負責組合；可單測的純函式優先放 `src/`。
- 已移除 AI 助教與 Codex bridge；不要重新加入聊天 UI 或 `scripts/ai-bridge`。`ai-learning-analysis.ts` 是保留的非 UI 學習分析。
- 新樣式使用頁面專屬 CSS module；`demo.module.css` 只做修補，不再擴充。
- `node_modules` 缺少時用 `npm ci`，不要 `npm install` 新套件。

## 指令

- 快速檢查：`npm run check`
- 完整驗證：`npm run verify`
- 本機開發：`npm run dev`

## 修改原則

- UI 修改先確認 390px 手機寬度，不產生水平捲動。
- 觸控按鈕至少 44px，焦點狀態清楚。
- 資料或 FSRS 修改必須執行 `npm test`。
- 完成後更新 `TASK.md`，只保留目前狀態與下一步。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
