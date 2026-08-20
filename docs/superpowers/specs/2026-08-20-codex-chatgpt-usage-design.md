# Codex ChatGPT 用量串接設計

## 目標

N4 ことば帳的 AI 分析與 AI 助教只能透過本機 `codex app-server` 使用目前登入的 ChatGPT／Codex 方案額度，不得使用 OpenAI API key。AI 抽屜需顯示 Codex 用量百分比與重置時間。

## 已確認需求

- 保留既有 `codex app-server --stdio` 與本機 `127.0.0.1:3765` bridge。
- 每次模型呼叫前以 `account/read` 確認帳號類型為 `chatgpt`。
- `apiKey`、未登入或其他 provider 不得執行 AI turn。
- 使用 `account/rateLimits/read` 取得 ChatGPT Codex 的 primary／secondary rate-limit window。
- UI 顯示方案、已用百分比與本地化重置時間；沒有 secondary window 時不顯示空欄位。
- 不把 email、access token、session token 或完整 account payload 傳到瀏覽器。
- Codex 未登入、bridge 離線或用量讀取失敗時，單字、音訊、FSRS 與本機建議仍可正常使用。
- 不新增套件、不部署、不改全域 Codex 設定。

## 架構

`AppServerClient` 新增帳號檢查與用量讀取方法。純資料驗證與正規化放在獨立的 `codex-usage.mjs`；`createAppServerModel.complete()` 在建立或重用 thread 前都先確認 ChatGPT 登入，避免 Codex CLI 若被設成 API key 時產生 API 費用。

AI bridge 的 `/v1/status` 回傳經過白名單化的用量快照。瀏覽器端以 `LocalAiClient.status()` 解析快照；AI 抽屜開啟時讀取，AI 回覆完成後再刷新一次。用量狀態只存在記憶體，不寫入學習資料或 localStorage。

## UI 狀態

- 讀取中：`正在確認 Codex 用量…`
- 已連線：`Codex Pro・主要用量已用 25%・14:30 重置`
- 有 secondary window：另顯示 `次要用量已用 …`
- 未登入或 API key：`請先用 ChatGPT 登入 Codex；本功能不使用 API key。`
- bridge 離線：`Codex AI bridge 未連線，單字學習仍可正常使用。`

狀態區使用一個 `role="status" aria-atomic="true"`，避免多個 live region 重複朗讀。390px 寬度允許自然換行，不增加水平捲動；既有互動按鈕維持至少 44px。

## 非目標

- 不在 App 內實作 ChatGPT OAuth／device-code 登入流程。
- 不讀取或顯示帳號 email。
- 不串接 OpenAI Usage API、Billing API 或 API key。
- 不修改模型、FSRS、推薦門檻或學習資料格式。
- 不顯示精確帳務金額；本功能顯示 App Server 提供的 Codex rate-limit 使用百分比與重置時間。

## 驗收條件

1. ChatGPT 模式可正常完成 AI chat 與 learning analysis。
2. API key 或未登入時，`thread/start` 與 `turn/start` 都不會送出。
3. `/v1/status` 不包含 email、token 或未白名單欄位。
4. AI 抽屜在 390px 顯示主要／次要用量，且沒有水平捲動。
5. 用量 API 失敗不影響本機學習功能。
6. `npm test`、`npm run check:types`、`npm run lint:app`、`npm run build` 全數通過。

## 依據

OpenAI Codex App Server 官方文件：<https://developers.openai.com/codex/app-server/>。使用 `account/read` 判斷 `chatgpt`／`apiKey`，使用 `account/rateLimits/read` 取得 `usedPercent`、`windowDurationMins` 與 `resetsAt`。
