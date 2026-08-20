# N4 練習區與三裝置同步設計

## 目標

為單一使用者新增獨立練習區，並讓同一個 Email OTP 帳號在三台裝置之間安全同步 FSRS 學習紀錄。既有單字庫、單元複習、本機匯出格式與 AI bridge 必須維持可用。

## 使用流程

- 主要導覽新增「練習」，`/home` 的「開始今日學習」改連到 `/practice`。
- 練習首頁從全部已有學習紀錄的單字中推薦最多 10 題；全新單字不加入。
- 題目依抽查／今日到期、低記憶率、學習中排序。預設日文→中文，可切換中文→日文或例句填空；一輪只使用一種題型。
- 單題流程重用既有提示、音訊、自評、填空判定、同輪重試、暫停續答與完成摘要，不加入倒數計時或排行榜。
- 單題介面必須重用既有 `ReviewPanel`；練習續答使用獨立 `PRACTICE_SESSION_KEY`，不得覆蓋單元複習暫存。
- 未登入仍可使用本機資料；登入後先完成首次合併，再提供跨裝置同步。同步失敗不阻擋答題。

## 單一帳號與同步

- 使用 Supabase Email OTP。三台裝置登入同一帳號；建立擁有者帳號後在 Supabase 關閉新註冊。
- Codex／ChatGPT 登入只供 AI bridge 使用，不傳送或重用其 token、email 或帳號識別。
- 學習操作先寫入本機 repository，再將不可變事件加入 outbox。雲端恢復後冪等補傳並下載新事件。
- 雲端事件包含 `review`、`manual_mastery`，以及只用於舊資料／匯入相容的 `memory_snapshot`。事件以 `(user_id, event_id)` 去重。
- 合併時依 `occurred_at`、`event_id` 穩定排序；以最新 snapshot 為基準，再重播其後的複習與手動狀態事件。不同裝置的事件不以整張記憶卡 last-write-wins 覆蓋。
- 本機 IndexedDB 以 `guest` 或 `user:<id>` 命名空間隔離。首次登入成功同步後清空 guest；登出清除該帳號快取並回到空白 guest，避免共用裝置殘留資料。

## 資料與安全

- Supabase `learning_events` 欄位：`user_id`、`event_id`、`device_id`、`event_type`、`word_id`、`unit_id`、`skill`、`occurred_at`、`payload`、`server_seq`、`created_at`。
- RLS 僅允許 `auth.uid() = user_id` 的 SELECT、INSERT、DELETE；事件不可 UPDATE。
- 瀏覽器只使用 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，不得加入 service/secret key。
- 現有 `MemoryRepositoryData` 匯出格式不變。登入時匯入或重設必須同時取代／清除雲端與該使用者本機資料。

## 介面與無障礙

- 390px 採單欄；品牌與四個主要導覽項目可換列且不得水平捲動。
- 所有按鈕至少 44px，鍵盤焦點清楚；錯誤／正確不得只靠顏色傳達。
- 練習頁顯示「本機使用／同步中／已同步／待同步／同步失敗」文字狀態，並提供可操作的重試。
- Email OTP 使用可見 label、email 與 numeric input mode、明確錯誤訊息及送出中狀態。

## 不在範圍內

- 多使用者管理、個人資料、社群登入、排行榜、計時測驗、伺服器端單字庫、部署與 Codex 身分登入。
