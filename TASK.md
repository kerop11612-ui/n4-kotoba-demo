# Current Task

## 目前狀態

- 熟練度已改為 FSRS 目前記憶率與 30 天保持率快照，不再使用 `accuracy × retention`。
- 日文→中文、中文→日文、例句填空使用獨立的 FSRS Card 與記憶鍵。
- 每次作答會保存技能、提示、正確性、反應時間、錯誤類型與 FSRS 前測預測值。
- 已新增向後相容的 schema v2 migration，不刪除舊資料；未知的 future schema 會拒絕載入，不會被誤當成 legacy 資料重置。
- 已新增 deterministic learning signals、AI 輸出 schema 驗證與非法 JSON fallback；AI 不可修改 FSRS。
- AI Agent 已新增本地先分流、輸入壓縮與穩定 cache key；證據不足時不呼叫 AI，且分析期間外的卡片不送入 context。
- UI 顯示 30 天保持率、目前記憶率、無提示答對率與提示依賴率。
- 顯示設定已新增日文讀音顯示／隱藏切換；隱藏時單字卡會同步重新排列詞性與收藏按鈕。
- UI 已拆出 `MasterySummary`、`ReviewPanel`、`ReviewRatingButtons` 與 `WordCard`；`page.tsx` 已由 1185 行降至約 840 行。
- 例句填空現在會先顯示例句中文翻譯，再呈現日文挖空與作答欄位。
- 中文→日文已加入字數、首個假名、音檔與答案的逐級提示。
- 例句填空第一次答錯後可選擇顯示首個假名或再次播放單字音檔；二次作答才進入結果。
- 填空第一次答錯後第二次答對，不再記為完全獨立回想。
- 已新增 `check:types`、`lint:app`、`test:core` 與 `check:fast`，可先做分層快速驗證。
- 已新增 `createMemoryRepository` factory；頁面與複習流程改依賴 `MemoryRepository` 介面，未來切換 IndexedDB 時不需修改 UI。
- IndexedDB 已改為真正的單筆 readwrite transaction backend；首次開啟會保留並遷移既有 localStorage 紀錄，無 IndexedDB 時回退 localStorage。
- 首頁已加入學習紀錄匯出、匯入與清除控制；匯入會先通過 schema migration，失敗不覆蓋現有資料。
- 已將首頁章節進度、Dashboard 與推薦單元整理為可測試的 `buildStudyOverview` 純函式。
- 複習保存已改為單次 atomic commit，並加入 quota failure 保護、事件去重與回傳資料 clone。
- URL 無效章節會正規化，瀏覽器前進／後退會同步選擇狀態；首頁章節進度會從 FSRS memory 計算。
- 收藏頁與單字卡共用 ruby renderer；翻譯模糊改為明確的可及性 reveal button；收藏 hydration 不再讀取 server 不可見的 localStorage。
- 修正詞庫 `n4-0604` 的 110 番意思與例句翻譯。
- 已建立詞庫 index 與 36 個單元 static API；index 只保留目錄欄位，單元端點才提供完整單字資料。
- 首頁、章節頁、收藏頁改為先載入 index，進入單元或收藏清單時才載入必要的完整單字資料。
- 詞庫 index／單元回應已加上長效 immutable cache，並以 parser 與 endpoint smoke check 驗證 894 個單字。
- 已新增本單元練習單頁面；從單字工具列開啟後，可列印或另存為 PDF，內容包含日文→中文、中文→日文與答案頁。
- 練習單沿用單元 loader 與共用詞庫資料，不新增 PDF 套件，適合目前的 static export 部署方式。
- 練習單的日文題目與答案區已改為只顯示日文，不顯示讀音。
- 已新增 Windows `N4-Kotoba-Demo.cmd` 快速啟動指令檔；雙擊後會啟動本機 Demo、等待 3000 port 就緒並開啟瀏覽器，不需額外編譯 launcher。
- Next／eslint-config-next 已更新至 16.3.0，PostCSS 固定至 8.5.23；`npm ci` 與 production dependency audit 均通過，audit 為 0 vulnerabilities。
- 77 項測試、ESLint、TypeScript 檢查、production build 與 390px 手機版水平溢位檢查已通過。
- P1 UI 優化已完成：768px 工具列改為搜尋滿寬加三欄操作列；主要頁面共用導覽、搜尋標籤、答案 reveal、SVG 收藏圖示與 focus-visible 狀態已補齊，390px／768px 均無水平捲動。
- 高優先級 UI 優化已完成：手機版音訊播放器改為三列排版、章節快速連結在手機並排、掌握統計改為雙欄、翻譯不再因 hover 偷偷顯示。
- PDF 列印已改為先預覽再列印，不再載入完成後自動跳出列印視窗；新增默寫練習、學習清單、答案整理三種模式。
- PDF 列印設定已新增讀音顯示／隱藏、學習清單例句、單欄手寫版、答案頁開關，並可沿用單字頁目前的搜尋結果。
- PDF 分頁已改為練習內容自然接續，答案頁獨立從新頁開始；列印檔案標題會帶入單元與模式，手機版 390px 無水平捲動。
- 複習流程已補上題數／預估時間、完成摘要（答對率、提示、需要再看、下次複習日期），未完成複習可在同一工作階段恢復。
- 單字顯示設定已保存至瀏覽器 localStorage；搜尋工具列已加入結果數與清除按鈕。
- 本輪 UI 修改已通過 `npm run verify`，並以 390px Playwright 檢查列印設定、讀音切換、搜尋結果列印與無水平捲動。
- 首頁與單元頁已加入 AI 學習助教聊天抽屜；支援本機對話保存、停止、重試、清除、Escape 關閉與焦點返回，390px／768px 無水平捲動。
- AI 學習助教已接入本機登入中的 Codex App Server；Windows 快速啟動會先檢查 Codex 登入、啟動唯讀 AI bridge，再啟動 Demo。
- AI bridge 已限制為 loopback、唯讀 sandbox、禁止核准與工具呼叫；串流結束會確實釋放回合，可連續提問。
- 修正瀏覽器原生 `fetch` 接收者未綁定，導致 AI 請求在送出前即失敗的問題；390px 單元頁已實測取得 Codex 回覆。
- 已新增固定右下角的「AI 助教」文字膠囊浮動按鈕；首頁與單字頁共用，開啟抽屜時自動隱藏，390px／768px 無水平捲動。
- 本輪維持本機開發，尚未部署。

## 下一步

1. 已完成 `buildLearningAnalysisAgentContext` 的 3 天／5 weak items 壓縮、版本化 `cacheKey`、context-aware validation，以及 deterministic-first server-side adapter。
2. 已完成 loopback bridge 的 Origin/session/body 邊界、LocalAiClient NDJSON stream、Codex App Server client，以及 timeout／斷流／非法 JSON／cache failure fallback 測試。
3. 已完成首頁／單元頁的本機規則 AI 建議卡與響應式聊天抽屜；AI bridge 未連線時會保留學習功能並提供重試訊息。
4. 下一輪依實際學習資料校準 `FSRS_TUNING` 與 `ANALYSIS_THRESHOLDS`。
