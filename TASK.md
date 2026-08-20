# Current Task

## 目前狀態

- `/practice` 已接上 adaptive per-card format、composite retry queue、practice session version 2（可遷移 version 1）、progressive hint ladder、推薦優先與可展開自訂練習。
- 推薦選題現在以 `isNeedsPractice` 統一已到期、低於 0.7、Again、提示與連錯訊號；推薦模式會逐單字檢查所有已建立技能，仍要求 `jp_to_meaning` 已學過，並排除尚未到抽查日的手動熟悉單字。
- 已保留既有 MemoryRepository、FSRS、learning event schema、unit review session、同步流程、自訂格式、queue 上限、recent delay 與 leech 限制；未建立 Supabase 專案、未部署、未新增套件。
- 本次實際驗證：`node --experimental-strip-types --test tests/practice-area.test.mjs`（18 passed）、`npm test`（160 passed）、`npm run lint:app`、核心檔案限定 `tsc` 與 `git diff --check` 均通過。`npm run check:types` 被既有 `.next/dev/types` 語法錯誤阻擋；`npm run check` 被既有 `.worktrees/personal-practice` 生成輸出觸發的大量 lint 錯誤阻擋。
- 本機瀏覽器 smoke check：`/practice` 在 390px（scrollWidth 375）與 1440px（scrollWidth 1425）均無水平溢出；已確認空狀態與 responsive layout，非空題目流程仍待實際操作驗收。

## 下一步

1. 使用瀏覽器於 `/practice` 實測 390px 與 1440px 的提示、答錯、延後重試、暫停/恢復及完成摘要流程。
2. 若要恢復全域 `check`／型別驗證，先清理或排除既有 `.next` 與 `.worktrees` 生成輸出，再重跑命令；目前不部署、不建立 Supabase 專案。
