# Current Task

## 目前狀態

- `/practice` 跨單元練習區、今日推薦、三種回想格式、可恢復 practice session 與 responsive 導覽已完成。
- 單一 owner Email OTP、guest/owner namespace、append-only learning events、offline-first outbox、三裝置 merge 與 mutation interception 已完成。
- 已保留既有 MemoryRepository 資料格式、unit session key、單字庫匯出／匯入／清除流程；未建立 Supabase 專案、未套用 migration、未部署。
- 驗證通過：`npm test`（142 tests）、`npm run check:types`、`npm run lint:app`、`npx eslint . --ignore-pattern .next --ignore-pattern .worktrees`、`npm run build`。
- 本機 acceptance 通過：`/practice` 在 390px 與 1440px 無水平溢出；四個功能導覽連結正常；未設定 Supabase 時仍顯示本機學習／空練習狀態。
- `npm run verify` 原命令未通過，原因是既有 `.worktrees/personal-practice/.next` generated artifact 被全域 eslint 掃描；source-focused lint 與 production build 均已通過，未修改全域 lint 設定或刪除該 artifact。

## 下一步

1. 使用者以實際三台裝置與 development Supabase project 完成 Email OTP、跨裝置同步、離線重試、RLS 與登出清理驗收。
2. 驗收後再依實際練習量調整 queue size 或提示文案；目前不部署、不建立 Supabase 專案。
