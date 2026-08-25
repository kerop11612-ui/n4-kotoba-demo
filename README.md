# Kotoba N4

> 手機優先的 JLPT N4 日語單字學習網站，結合單字音訊、FSRS 間隔複習、個人化練習與可選的 AI 助教。
>
> A mobile-first JLPT N4 vocabulary learning site with audio, FSRS spaced repetition, adaptive practice, and an optional AI study coach.

[🚀 開啟線上 Demo](https://a7b1c9e2.n4-kotoba-demo.pages.dev/?chapter=1&section=1) 

<img width="2217" height="1111" alt="Snipaste_2026-08-25_11-31-06" src="https://github.com/user-attachments/assets/7da6f6ac-e063-493d-bf87-83b2693cc90b" />

## 專案簡介

Kotoba N4 是一個以日常學習為目標的 JLPT N4 單字學習網站。專案將 N4 單字依 **7 章、36 節**整理，從單字瀏覽、假名與中文意思，到音訊練習、複習追蹤與個人化題目，提供一條可以持續使用的學習流程。

它適合：

- 正在準備 JLPT N4、想系統化整理單字的人
- 想利用手機與零碎時間複習的人
- 需要音訊、搜尋、收藏與學習狀態篩選的人
- 希望依自己的記憶狀況安排複習，而不是每次從頭開始的人
- 希望學習紀錄預設留在瀏覽器本機、不必先建立帳號的人

## 線上使用

直接開啟 [Kotoba N4 線上 Demo](https://a7b1c9e2.n4-kotoba-demo.pages.dev/?chapter=1&section=1)，即可從第 1 章第 1 節開始瀏覽單字。

網站目前是 learning-focused Demo。學習紀錄預設保存在目前瀏覽器；如果清除瀏覽器資料、使用無痕模式或更換裝置，尚未同步的紀錄可能會遺失。

## 核心功能

### 單字庫與章節導覽

- 依章節與單元瀏覽 N4 單字
- 以單字、假名或中文意思搜尋
- 查看單字例句、詞性、學習狀態與目前進度
- 從章節、單元、收藏或單字卡直接切換學習範圍

### 音訊學習

- 播放單字與例句音訊
- 支援連續播放，適合跟讀或通勤複習
- 可調整播放速度與顯示設定
- 對沒有聲音或載入失敗的情況保留文字學習流程

### FSRS 間隔複習

- 依作答結果與複習紀錄安排下一次複習時間
- 顯示到期、需要加強與已熟悉的學習狀態
- 以複習提示協助使用者在適當時間回來練習
- 保留既有學習紀錄，讓複習節奏會隨使用情況逐步調整

### 個人化練習

- 根據學習紀錄產生今日推薦練習清單
- 優先處理到期、低熟練度、曾答錯或需要提示的單字
- 支援漸進式提示、查看答案、錯題延後重試與完成摘要
- 可展開自訂練習，依需求選擇練習格式與範圍

### 收藏與學習追蹤

- 收藏想再次複習的單字
- 依學習狀態篩選單字
- 查看單元完成度與個人學習摘要
- 透過首頁與個人學習頁快速回到下一個學習任務

### 本機優先與選配功能

- 未設定雲端服務時，仍可完整使用單字庫與複習功能
- 可選擇使用 Supabase 進行帳號與學習紀錄同步
- 可選擇啟動 Codex AI bridge，取得學習分析與 AI 助教建議
- AI 或同步服務未連線時，不影響核心單字學習流程

## 建議學習流程

```text
選擇章節／單元
      ↓
瀏覽單字、假名、中文意思與音訊
      ↓
進行單字複習與個人化練習
      ↓
依作答結果更新 FSRS 複習節奏
      ↓
回到首頁查看進度，繼續下一次學習
```

第一次使用時，可以先從單字庫選擇一個單元，聽過單字與例句後開始練習。之後直接進入 `/practice`，讓系統根據目前紀錄整理需要優先處理的內容。

## 網站導覽

| Route | 功能說明 |
| --- | --- |
| `/` | 單字庫、搜尋、單字卡、收藏與單字複習 |
| `/home` | 首頁、學習進度摘要與學習入口 |
| `/practice` | 今日個人化練習、提示、重試與完成摘要 |
| `/units` | 7 章、36 節的單元導覽與篩選 |
| `/favorites` | 收藏單字與收藏音訊 |
| `/print` | 產生適合列印的練習單 |

## 技術架構

### 前端與頁面

- **Next.js App Router**：頁面、路由與 API route
- **React**：互動式單字卡、練習流程與學習控制元件
- **TypeScript**：詞庫資料、學習事件與 FSRS 流程的型別安全
- **CSS Modules / Global CSS**：手機優先與響應式版面

### 核心模組

| 模組 | 責任 |
| --- | --- |
| `app/` | 頁面、互動元件、hooks 與樣式 |
| `src/vocabulary/` | 詞庫載入、解析、章節與單元索引 |
| `src/spaced-repetition/` | FSRS、複習佇列、提示、練習計畫與摘要 |
| `src/storage/` | 瀏覽器本機學習紀錄、收藏與資料遷移 |
| `src/sync/` | 選配的學習事件同步與 Supabase 儲存 |
| `src/ai/`、`scripts/ai-bridge/` | 選配的 AI 分析、對話與 Codex bridge |
| `public/` | N4 詞庫 JSON 與單字／例句音訊 |
| `tests/` | FSRS、詞庫、練習、同步與版面相關測試 |

### 資料流概念

1. `public/vocabulary-n4.json` 提供單字、章節、單元與例句資料。
2. 前端依目前路由載入詞庫，建立單元索引與單字顯示內容。
3. 使用者的作答、提示、收藏與複習行為轉成學習紀錄。
4. 本機儲存保留學習狀態，FSRS 根據紀錄計算複習佇列。
5. 若啟用 Supabase，同步流程會將學習事件送往選配的雲端儲存。

## 技術堆疊

- Next.js 16
- React 19
- TypeScript
- FSRS / [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)
- Supabase（選配的帳號與學習紀錄同步）
- Codex AI bridge（選配的 AI 學習助教）

## 本機開發

### 系統需求

- Node.js 20 或以上
- npm

### 安裝與啟動

```bash
npm install
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000) 即可使用本機版本。

### Windows 快速啟動

完成一次 `npm install` 後，可直接雙擊專案根目錄的 `N4-Kotoba-Demo.cmd`。腳本會啟動開發伺服器，等待服務就緒後開啟瀏覽器。

如果只需要啟動開發伺服器，也可以使用：

```bash
npm run dev
```

## 選配設定

### Supabase 同步

若要啟用帳號與學習紀錄同步，請複製 `.env.example` 為 `.env.local`，再填入 Supabase 專案設定：

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

未設定 Supabase 時，仍可使用本機學習紀錄；這是預設且最簡單的使用方式。

### AI 學習助教

AI 助教是選配功能。若本機已具備 Codex 登入環境，可另開終端機啟動 AI bridge：

```bash
npm run dev:ai-bridge
```

AI bridge 未連線時，單字瀏覽、音訊、收藏、FSRS 與個人化練習仍可正常使用。

## 驗證與品質檢查

完整檢查：

```bash
npm run check
npm run verify
```

常用的單獨檢查指令：

```bash
npm test
npm run lint:app
npm run check:types
npm run build
```

其中：

- `npm test`：執行學習、詞庫、FSRS、同步、練習與版面測試
- `npm run lint:app`：檢查 `app/` 與 `src/` 的程式碼風格與常見錯誤
- `npm run check:types`：執行 TypeScript 型別檢查
- `npm run build`：建立正式版 Next.js 應用程式

## 專案狀態與已知限制

Kotoba N4 目前是以學習流程為核心的 Demo，優先處理以下方向：

- 手機優先、可觸控操作與響應式版面
- 本機資料安全與沒有帳號時的可用性
- 可理解的複習提示與個人化練習節奏
- 保留核心功能，再逐步改善學習體驗

目前使用者資料預設留在瀏覽器本機；Supabase 同步與 AI 助教都需要額外設定，並非線上 Demo 的必要條件。專案尚未提供公開發行版本的 License 條款。

## License

License information will be added when the project is ready for public redistribution.
