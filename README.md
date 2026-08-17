# N4 ことば帳 Demo

從原網站獨立出的手機優先 JLPT N4 學習專案。包含完整 N4 詞庫，預設從第一個單元開始，包含：

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

## Windows 快速啟動

確認已安裝 Node.js 並完成一次 `npm install` 後，可直接雙擊專案根目錄的 `N4-Kotoba-Demo.cmd`。它會自動啟動本機 Demo，等待 http://localhost:3000 就緒後開啟瀏覽器。

`N4-Kotoba-Demo.cmd` 必須與 `package.json` 放在同一個專案根目錄；關閉開發伺服器可在終端機停止 `npm run dev`。

## 驗證

```bash
npm run check
npm run verify
```

專案規則放在 `AGENTS.md`，目前工作範圍放在 `TASK.md`。

## 頁面

- /：單字與複習 Demo
- /home：首頁版面 Demo
- /units：7 章／36 節單元導覽 Demo
- /favorites：收藏單字
