# N4 ことば帳 Demo

從原網站獨立出的手機優先 JLPT N4 學習專案。目前聚焦第 1 章第 1 節，包含：

- 單字與例句音訊
- 搜尋、收藏與顯示設定
- 連續播放
- FSRS 間隔複習與提示
- 手機版觸控與安全區域調整

## 啟動

```bash
npm install
npm run dev
```

開啟 http://localhost:3000。

## 驗證

```bash
npm run check
npm run verify
```

專案規則放在 `AGENTS.md`，目前工作範圍放在 `TASK.md`。

## 頁面

- /：單字與複習 Demo
- /home：首頁版面 Demo
- /units：10 章／50 節單元導覽 Demo
- /favorites：收藏單字
