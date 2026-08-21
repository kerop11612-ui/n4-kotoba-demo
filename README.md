# Kotoba N4

> A mobile-first JLPT N4 vocabulary trainer with audio, FSRS spaced repetition, adaptive practice, and an optional AI study coach.
>
> 手機優先的 JLPT N4 單字學習工具，結合音訊、FSRS 間隔複習、個人化練習與可選 AI 助教。

Kotoba N4 將 N4 單字依 7 章、36 節整理，從單字學習、音訊練習到複習追蹤，提供一個適合日常使用的學習流程。

## Features

- 依章節與單元瀏覽 N4 單字
- 單字與例句音訊播放
- 搜尋單字、假名或中文意思
- 收藏單字與學習狀態篩選
- 連續播放、播放速度與顯示設定
- FSRS 間隔複習與複習提示
- 依學習紀錄產生個人化練習清單
- 漸進式提示、錯題延後重試與完成摘要
- 本機優先儲存學習紀錄
- 可選的 AI 學習助教與學習建議
- 手機優先、支援響應式版面與安全區域

## Pages

| Route | Description |
| --- | --- |
| `/home` | 首頁與學習進度摘要 |
| `/practice` | 今日個人化練習 |
| `/` | 單字庫、搜尋、收藏與單字複習 |
| `/units` | 7 章、36 節單元導覽 |
| `/favorites` | 收藏單字與音訊 |
| `/print` | 列印練習單 |

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- FSRS / `ts-fsrs`
- Supabase（選配的帳號同步）
- Codex AI bridge（選配的 AI 助教）

## Getting Started

### Requirements

- Node.js 20+
- npm

### Install and run

```bash
npm install
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。

### Windows quick start

完成一次 `npm install` 後，可直接雙擊專案根目錄的 `N4-Kotoba-Demo.cmd` 啟動本機 Demo。腳本會啟動開發伺服器，等待服務就緒後開啟瀏覽器。

## Optional Configuration

### Supabase sync

若要啟用帳號同步，請複製 `.env.example` 為 `.env.local`，填入 Supabase 專案設定：

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

未設定 Supabase 時，仍可使用本機學習紀錄。

### AI study coach

AI 助教是選配功能。若本機已具備 Codex 登入環境，可啟動 AI bridge：

```bash
npm run dev:ai-bridge
```

AI bridge 未連線時，單字學習與複習功能仍可正常使用。

## Verification

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

## Project Structure

```text
app/                   Next.js pages, components, and styles
src/spaced-repetition/ FSRS and learning queue logic
src/storage/           Browser-local learning records
src/vocabulary/        Vocabulary loading and unit data access
public/                Vocabulary JSON and audio assets
tests/                 Learning, layout, and integration tests
```

## Project Status

Kotoba N4 is currently a learning-focused Demo. The project prioritizes a mobile-first study flow, local data safety, accessible interactions, and incremental practice improvements.

## License

License information will be added when the project is ready for public redistribution.
