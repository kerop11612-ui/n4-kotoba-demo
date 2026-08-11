# N4 ことば帳：AI 聊天抽屜設計

日期：2026-08-11  
狀態：使用者已核准本輪範圍，待實作計畫

## 1. 目標

在首頁與單元頁的建議卡上加入可用的聊天抽屜，讓使用者能查看目前學習 context、詢問「為什麼推薦」或提出簡短日文學習問題。AI 不可阻塞單字瀏覽、複習、FSRS 排程或本機紀錄；AI 不可直接修改任何 FSRS 資料。

本輪完成聊天抽屜 MVP 與既有本機 AI bridge 的串接。跨裝置同步、聊天內容同步、錯題專用解釋流程與完整 App Server protocol adapter 不在本輪內。

## 2. 使用情境與入口

- 首頁與單元頁各維持一個共用 `AiChatDrawer`。
- 建議卡的「為什麼推薦？」打開抽屜並預填問題「為什麼推薦這個？」；使用者仍需按送出才呼叫 AI。
- 抽屜提供預設問題：「今天先學什麼」、「為什麼推薦這個」、「比較這兩個單字」；預設問題只填入輸入框，不自動送出。
- 使用者可輸入一般日文問題，輸入長度上限為 500 個 Unicode 字元。
- 對話只保存本機最近 30 則訊息；本輪不跨裝置同步、不送出完整 storage export。

## 3. UI 與可及性

- 390px 以下由畫面底部展開為近全高 drawer，保留可見的關閉按鈕與安全邊距。
- 768px 以上由右側展開固定寬度 drawer，正文仍可辨識且不產生水平捲動。
- 抽屜包含標題、目前 context 摘要、訊息列表、預設問題、輸入框、送出按鈕、停止按鈕、重試按鈕與清除對話按鈕。
- 開啟時將焦點移到輸入框；關閉時回到開啟抽屜的來源按鈕。Escape 關閉抽屜，Tab 不可穿透至背景內容。
- 抽屜使用 `role="dialog"`、`aria-modal="true"` 與可理解的 `aria-labelledby`；串流狀態使用 `role="status"`，不只依靠顏色表達狀態。
- 所有互動按鈕至少 44px 高，訊息與輸入區在 390px 不超出 viewport。

## 4. 資料流與責任邊界

```text
current page context + local conversation
        ↓
useAiChat
        ↓
LocalAiClient.chatJapanese (最多最近 6 輪)
        ↓ NDJSON stream
AiChatDrawer
```

- `AiChatDrawer` 只負責呈現與事件回呼，不直接呼叫 fetch 或讀寫 FSRS。
- `useAiChat` 管理開啟時的本機訊息、輸入值、串流狀態、AbortController、錯誤與重試。
- `LocalAiClient` 增加 `chatJapanese`，送出經壓縮的 context、最近 6 輪訊息與目前問題；不送出 Codex token、同步金鑰或完整 repository export。
- bridge 增加受限的 chat 命令，只能呼叫既有唯讀 AI 分析流程；輸出轉成前端可解析的 NDJSON `baseline`／`delta`／`done`／`fallback` 記錄。
- AI 內容只提供解釋與建議；若回覆帶有學習 action，前端只接受目前詞庫存在的 word ID，否則顯示文字而不執行動作。
- bridge 不可用、逾時、串流中斷或回覆格式錯誤時，保留使用者訊息並顯示可重試的離線提示；原有本機學習流程照常運作。

## 5. 對話狀態與持久化

- 初始狀態為 `closed`；開啟後為 `idle`、`streaming`、`ready` 或 `error`。
- 使用者按停止時 AbortController 中止目前請求，保留已收到的部分文字並標示「已停止」。
- 重試只重送最近一次使用者問題，不重複加入使用者訊息。
- 清除對話前要求瀏覽器確認，確認後清除目前頁面的本機對話並回到空狀態。
- 對話存在 React state 與指定的 localStorage key，寫入失敗時仍可在當前頁面使用；不影響 MemoryRepository。

## 6. 錯誤與 fallback

- 輸入為空或超過 500 字元：不送出，顯示可理解的欄位錯誤。
- AI 未連線：顯示「Codex 未連線，請確認本機 AI Bridge」與重試按鈕。
- timeout、AbortError、非法 NDJSON 或未知記錄：停止 loading，保留本次訊息，顯示不含技術堆疊的錯誤提示。
- 任何錯誤都不得清除既有單字資料、變更 rating、due、stability、difficulty 或 desired retention。

## 7. 測試與驗收

### 純邏輯與 client 測試

- chat request 只包含允許的 context、問題與最近 6 輪訊息。
- 空白／超長問題被拒絕，不呼叫 bridge。
- NDJSON delta 能累積成完整回答；done 會結束 streaming；fallback 與錯誤會進入可重試狀態。
- 停止請求不會把已存在的本機對話清除；重試不重複新增 user message。
- 對話最多保留 30 則訊息，localStorage 失敗不阻塞當前互動。

### UI 驗收

- 首頁與單元頁的「為什麼推薦？」能打開同一套抽屜並預填問題。
- 390px 為底部抽屜、768px 為右側抽屜，兩者均無水平捲動。
- 開關抽屜、Escape、焦點返回、預設問題、送出、停止、重試與清除均可用鍵盤完成。
- AI Bridge 停止時仍可瀏覽單字、開始複習、完成作答與保存 FSRS。

## 8. 不在本輪範圍

- 真正的跨裝置同步與聊天內容同步。
- 錯題專用「為什麼錯？」快取與對比題流程。
- AI 自動修改 FSRS card 或排程。
- 在網站內提供模型選擇、任意 Codex command、shell、檔案或工具執行能力。
