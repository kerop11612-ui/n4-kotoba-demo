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
