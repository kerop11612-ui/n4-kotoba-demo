# N4 ことば帳：AI 學習教練與雙裝置同步設計

日期：2026-08-11  
狀態：使用者已核准架構與互動方向，待規格審閱

## 1. 目標

在既有 JLPT N4 單字學習 Demo 加入個人使用的 AI 教練，滿足下列需求：

1. 根據 FSRS、最近複習事件與單元進度，提出有證據、可立即執行的學習建議。
2. 在同一個聊天抽屜回答一般日文問題，包括單字、文法、例句、語意差異與學習方法。
3. 兩台個人電腦各自使用同一個 ChatGPT／Codex 帳號登入本機 Codex，無須輸入 OpenAI Platform API Key。
4. 兩台電腦自動同步學習進度；同步資料在送出裝置前完成加密，Cloudflare 無法讀取內容。
5. AI、同步或網路故障不得阻塞單字瀏覽、作答、FSRS 排程或本機紀錄保存。

## 2. 已確認的限制與設計原則

- 現有 Next.js 使用 `output: "export"`，繼續維持純靜態前端與 Cloudflare Pages 部署。
- Codex OAuth 不作為網站 OAuth provider。每台電腦透過本機 Codex App Server 自行完成 ChatGPT 登入。
- Codex App Server 僅監聽 `127.0.0.1`，不開放區域網路或公網。
- AI 只提供解讀與建議，不得修改 FSRS card、rating、due、stability、difficulty 或 desired retention。
- 本機 deterministic analysis 永遠存在，是無 AI、逾時、格式錯誤與低證據量時的正式 fallback。
- 學習操作採 local-first；同步與 AI 都是可延後的背景能力。
- 不新增與本功能無關的套件或重構。

## 3. 整體架構

每台電腦包含四個邊界清楚的單元：

### 3.1 靜態網頁

- 顯示單字、複習流程、單元進度、AI 建議卡與聊天抽屜。
- 使用現有 `MemoryRepository` 保存本機資料。
- 呼叫本機 AI Bridge，不直接接觸 Codex token 或 App Server protocol。
- 使用 Web Crypto 加密同步 envelope，再呼叫 Cloudflare Sync Worker。

### 3.2 本機 AI Bridge

- 只監聽 loopback 位址。
- 啟動或連接本機 Codex App Server。
- 將前端的有限命令轉成 App Server request：`analyze-learning` 與 `chat-japanese`。
- 將 Codex 串流事件轉成前端 `fetch()` 可逐段讀取的 newline-delimited JSON（NDJSON）。
- 不提供任意 shell、檔案讀寫、MCP 或通用 Codex command passthrough。
- 拒絕所有 approval 與工具執行請求；AI thread 使用唯讀 sandbox、`approvalPolicy: never` 與禁用網路搜尋。
- 驗證前端 origin 與短效本機 session token，避免其他網頁濫用 localhost 服務。

### 3.3 Codex App Server

- 每台電腦各自執行，使用該電腦現有的 ChatGPT／Codex 登入。
- 負責模型對話、conversation history 與串流事件。
- App Server token、ChatGPT token 與登入快取永遠不傳到瀏覽器或 Cloudflare。

### 3.4 Cloudflare Sync Worker

- 與 Pages 專案分離，僅提供同步 API。
- 使用 Cloudflare D1 保存加密 envelope、vault ID、device public key、事件 ID、版本、nonce 與同步游標。
- 不持有 Codex token、OpenAI API Key 或可解密學習內容的金鑰。
- 以裝置簽章、時間窗、nonce 與速率限制驗證同步請求並防止重放。
- Worker 仍可看見 vault／device ID、同步時間、事件數量與密文大小；UI 的隱私說明必須揭露這些 metadata，不宣稱完全匿名。

## 4. AI 能力

### 4.1 學習分析

分析來源限制為：

- 最近 3 個日曆日的複習事件；提示率、反應速度、錯誤與混淆只使用此期間資料。
- 目前選取單元的進度與 FSRS snapshot。
- 全局到期卡量、新卡量及單元完成度。
- 最多 5 個經本機規則排序的弱項。
- 每個弱項最多 3 個混淆詞與 3 種錯誤類型。

每次分析產生：

- 最多 3 個 findings。
- 1 個主要 recommended action。
- 一個 UI 主要建議，供首頁或單元頁的情境建議卡使用。
- 每項 finding 必須包含資料來源、期間、證據量與信心值。

建議類型包含：

- 低 30 天保持率。
- 提示依賴偏高。
- 無提示回想速度偏慢。
- 單字混淆。
- 到期複習過載。
- 證據不足。

`periodReviewCount` 與 `lifetimeReviewCount` 必須分開；分析門檻和信心值使用期間內證據，不得以終身次數放大短期樣本。
目前 FSRS 記憶率與 30 天保持率可作長期背景，但不得將 3 天以前的事件混入近期行為指標。若 3 天內相關複習少於 3 次，該項標示證據不足，不回退到更長事件期間製造表面信心。

### 4.2 單元進度建議

首頁建議在所有單元中選出一個最有價值的下一步：

- 有到期卡時優先完成到期複習。
- 無到期卡但單元保持率偏低時，安排聚焦複習。
- 到期量過載時暫停新卡。
- 複習負擔正常時才建議新增最多 5 個新詞。

單元頁建議只針對目前單元，並提供可執行按鈕，例如：

- 開始建議複習。
- 開始本單元弱單字練習。
- 開始混淆對比練習。
- 複習讀音。
- 問 AI「為什麼」。

若沒有足夠證據，卡片顯示還需要累積多少次複習，不呼叫 AI。

「本單元弱單字練習」預設建立 5 題聚焦佇列，依近期低保持率、提示依賴、慢回想與混淆訊號排序，混合日文→中文、中文→日文、例句填空及混淆對比題。題目只能來自本機已驗證的候選單字；每題仍走既有作答紀錄與 FSRS rating 流程。完成摘要需比較本次表現並列出仍需複習的單字。

弱單字候選排序、5 題佇列、題型混合、延遲重測與完成摘要全部由本機 deterministic 邏輯產生，不為每題呼叫 AI。AI 每日分析只負責解讀既有訊號與選出一個主要行動。

### 4.3 一般日文問答

聊天抽屜接受：

- 單字意思、讀音與使用差異。
- 文法解釋。
- 例句與改寫。
- N4 程度的練習題。
- 學習方法與記憶技巧。

回答必須區分：

- 「依據你的學習紀錄」：只在回答確實引用已提供的學習摘要時顯示。
- 「一般日文說明」：不宣稱來自個人學習數據。

聊天不得直接調整 FSRS；需要安排練習時，只回傳允許的 action，由前端建立既有複習流程。

### 4.4 錯題解釋

- 正確答案、讀音、詞義與既有固定提示先由本機顯示，不呼叫 AI。
- 只有使用者主動按下「為什麼錯？」才呼叫 AI。
- AI 回傳簡短錯誤原因、一條適用規則與一組對比例句。
- 相同 `wordId + skill + normalizedAnswer + errorTypes + promptVersion` 使用同一 error-explanation cache；命中時不重複呼叫。
- AI 解釋不參與 FSRS rating，只補充理解。

## 5. AI 輸入與輸出契約

### 5.1 輸入

前端只送出壓縮後的 `LearningAnalysisAgentContext`，並新增：

- `promptVersion`
- `schemaVersion`
- `thresholdVersion`
- `analysisDay`
- `currentUnit`（可選）
- `userQuestion`（聊天時使用，設長度上限）
- `efficiencyPolicyVersion`

不得送出完整 storage export、Codex token、裝置同步金鑰或不在分析期間內的事件。
詞義、讀音、音訊路徑、搜尋與單一詞庫查詢由本機處理；只有比較、解釋或開放式問題才進入 AI Bridge。

### 5.2 輸出驗證

現有 shape validation 之外，必須增加 context-aware semantic validation：

- 所有 `wordIds` 必須存在於輸入 context。
- 字串不得為空，陣列需去重。
- `overallStatus` 必須與 findings 一致。
- action 必須是前端支援且與 finding 相容的類型。
- AI 不得回傳任何 FSRS mutation 欄位。
- 任一驗證失敗時，整份結果回退 deterministic baseline，不採部分不可信結果。

### 5.3 快取

快取 key 由下列內容的 canonical JSON 計算 SHA-256：

- 固定日期桶。
- 壓縮後輸入。
- prompt、schema、threshold 與 policy 版本。
- efficiency policy 版本。
- 使用的模型識別。

同一個同步 vault 每個日曆日最多產生一次 AI 學習分析；當天後續作答立即更新本機 deterministic 建議，AI 解讀於隔日重新產生。在線時裝置先向 Worker 取得以 `vaultId + analysisDay` 為鍵的短效分析 lease，只有取得者能呼叫 AI；離線時只使用 deterministic 建議，不產生新的 AI 分析。兩台裝置共用端對端加密的結構化分析快取，避免相同資料各呼叫一次。聊天問題與錯題解釋不共用每日分析快取。
MVP 使用該電腦 Codex 登入後的預設模型，不在網站內提供模型選擇；App Server 回報的實際模型識別會寫入快取 metadata。

## 6. UI 與互動

採已核准的「情境建議卡＋聊天抽屜」。

### 6.1 情境建議卡

- 首頁顯示全局最重要的一則建議。
- 單元頁顯示目前單元最重要的一則建議。
- 顯示建議標題、簡短原因、證據量、信心值與最後分析時間。
- 第一個按鈕至少 44px，直接開始建議練習。
- 第二個按鈕打開聊天抽屜並預填「為什麼推薦這個？」。
- 載入 AI 時仍先顯示 deterministic 建議，不使用阻塞 skeleton 取代完整卡片。

### 6.2 聊天抽屜

- 手機版由底部展開，桌面版由右側展開。
- 頂端顯示目前 context，例如「第 4 章第 2 節＋最近 3 天」。
- 支援串流、停止產生、重試與清除本機對話。
- 預設問題包含「今天先學什麼」、「為什麼推薦這個」、「比較這兩個單字」與一般文法提問。
- 回覆中的單字 action 只能操作目前詞庫中存在的 ID。
- 對話預設只保存本機最近 30 則，不跨裝置同步。
- 每次 AI 請求最多攜帶最近 6 輪訊息；更早內容只保留由本機抽取的主題、word ID 與使用者偏好，不額外呼叫 AI 產生摘要。
- 預設回答限制為 3 個簡短重點；使用者明確要求詳細說明時才放寬輸出。

### 6.3 狀態顯示

- `本機規則`：未呼叫 AI 或 AI fallback。
- `AI 分析`：通過語意驗證的 Codex 結果。
- `快取`：顯示上次有效分析。
- `Codex 未連線`：提供重新連線與登入說明，但不阻塞學習。
- `同步中／已同步／離線／衝突已合併`：以低干擾狀態顯示。

## 7. 雙裝置端對端加密同步

### 7.1 配對

第一台電腦建立隨機 vault ID、256-bit AES-GCM vault key，以及不可匯出的 ECDSA P-256 裝置簽章私鑰。Cloudflare D1 只登記裝置 public key。

- 第一台向 Worker 取得一次性、短效 pairing invite。
- UI 將 vault ID、vault key 與 invite 組成高熵配對碼，並提供離線恢復碼。
- 第二台輸入配對碼後產生自己的 ECDSA key pair，用 invite 登記 public key，再將 vault key 匯入為不可匯出的 CryptoKey。
- 後續同步請求由各裝置私鑰簽章；Worker 只需 public key 即可驗證，不保存共享驗證密鑰。

第一台只顯示一次高熵配對碼。配對碼不是六位數短碼；invite 使用後立即失效，並具有短效期限。兩台將不可匯出的 vault key 與 device private key 保存於 IndexedDB。

若使用者遺失所有已配對裝置與配對碼，Cloudflare 上的密文無法復原；UI 必須在配對時明確提醒並提供離線保存恢復碼。

### 7.2 同步資料

預設同步：

- Review events。
- 可由 review events 重建的 FSRS memory。
- 收藏狀態。
- 顯示與學習偏好。
- 每日結構化 AI 分析快取與錯題解釋快取；兩者在裝置端加密後同步。

預設不同步：

- AI 對話原文。
- Codex conversation ID。
- Codex 或 ChatGPT 憑證。
- 未完成的串流回覆與一般聊天 cache。

### 7.3 衝突合併

- Review event 採 append-only、全域唯一 ID 與冪等上傳。
- 裝置下載未知事件後，按 `reviewedAt`、device sequence、event ID 的穩定順序重播受影響卡片，讓兩台最終得到相同 FSRS card。
- 收藏與偏好使用 per-key last-write-wins record；相同時間以 device ID 作穩定 tie-breaker。
- 不直接以整份 storage blob 的最後寫入覆蓋另一台資料。

### 7.4 同步時機

- 作答完成先 atomic commit 本機資料。
- 2–5 秒 debounce 後批次上傳新事件。
- 頁面啟動、切回前景、完成複習及手動刷新時執行 pull。
- 離線操作進入本機 outbox，恢復網路後重試。

## 8. 錯誤處理

### 8.1 AI Bridge／Codex

- App Server 未安裝：顯示安裝或登入說明，使用 deterministic 建議。
- 未登入：引導執行本機登入，不讀取或複製 auth cache。
- 逾時：中止 turn，保留 deterministic 建議與使用者問題供重試。
- 串流中斷：標記回答未完成，不將其當成有效分析快取。
- 非法 JSON、未知 word ID 或工具請求：拒絕結果並 fallback。

### 8.2 同步

- Worker 無法連線：保留 outbox，顯示離線狀態。
- 驗證失敗：停止自動重試，要求重新配對。
- 解密失敗：隔離該 envelope，不覆蓋現有資料並提供診斷匯出。
- quota 或 server error：使用指數退避與上限，不影響本機 commit。

## 9. 效能要求

- 單字瀏覽、作答及本機 commit 不等待 AI 或同步。
- AI 建議先呈現 deterministic 結果，再非同步更新通過驗證的 AI 結果。
- AI input 維持最近 3 個日曆日與最多 5 個弱項。
- 首頁與所有單元頁共用同一份每日分析，不為不同頁面重複呼叫。
- 本機 request router 在送出前攔截詞庫查詢、統計、選題與固定錯誤提示。
- 同步採增量事件與 cursor，不在每次作答傳輸完整 export。
- 手機 390px 與平板 768px 不得產生水平捲動。
- 所有可操作控制至少 44px，抽屜具有 focus trap、Escape 關閉及回焦。

## 10. 測試策略

### 10.1 單元測試

- 期間次數與終身次數分離。
- AI semantic validator 拒絕未知單字、空值、矛盾狀態與 FSRS mutation。
- canonical cache key 的版本、日期桶與輸入穩定性。
- request router 在詞庫查詢、統計、選題與固定提示時不呼叫 adapter。
- 每日分析限制為 5 個輸入弱項、3 個 findings 與 1 個 action。
- 聊天 context 只攜帶最近 6 輪，舊內容使用本機結構化狀態。
- 錯題解釋 signature 相同時命中 cache。
- AES-GCM 加密／解密、ECDSA 簽章、public-key 驗證與 nonce 驗證。
- append-only event merge、冪等同步與 FSRS replay 最終一致性。
- 收藏與偏好的 conflict tie-breaker。

### 10.2 整合測試

- 模擬 App Server 的成功串流、未登入、逾時、斷線、非法 JSON、工具請求與 fallback。
- Worker 的合法同步、重放攻擊、錯誤簽章、未登記裝置、過期 invite、過期時間戳、重複事件與 rate limit。
- 兩台裝置競爭同一天分析 lease 時只有一台取得，另一台讀取加密分析快取。
- IndexedDB outbox 在離線後恢復上傳。
- 第二台裝置配對、首次同步與並行複習合併。

### 10.3 端到端測試

- 首頁與單元建議卡。
- 開啟／關閉聊天抽屜、串流停止、重試與清除。
- Codex 未連線時仍可完成複習。
- 390px／768px 無水平捲動、鍵盤操作與 focus restoration。

## 11. 實作階段劃分

1. 修正 AI 分析期間證據語意並完成 context-aware validation。
2. 建立可 mock 的 AI adapter contract 與 deterministic fallback 整合。
3. 建立 loopback AI Bridge 與 Codex App Server integration。
4. 加入情境建議卡與聊天抽屜。
5. 將 review event 升級為可重播同步來源並完成 repository migration。
6. 建立 Web Crypto vault、裝置配對與本機 outbox。
7. 建立 Cloudflare Sync Worker 與端對端整合測試。
8. 完成雙電腦驗收、效能與可及性檢查。

每一階段都必須維持現有 `npm run verify` 通過；資料與 FSRS 變更另外執行所有核心測試。

## 12. 不在本次範圍

- 公開多使用者註冊、付費、管理後台或社群功能。
- 使用 Codex OAuth 作為網站身分提供者。
- 將 ChatGPT／Codex token 上傳到 Cloudflare。
- AI 自動修改 FSRS 參數或排程。
- AI 對話跨裝置同步。
- 公開部署 Codex App Server。
- 語音對話、圖片辨識或即時網路搜尋。
