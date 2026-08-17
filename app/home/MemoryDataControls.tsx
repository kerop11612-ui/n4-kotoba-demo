"use client";

import { useRef, useState } from "react";
import type { MemoryRepository } from "../../src/storage/memory-repository";
import styles from "./home.module.css";

type MemoryDataControlsProps = {
  repository: MemoryRepository;
  onChanged: () => void;
};

export function MemoryDataControls({ repository, onChanged }: MemoryDataControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function exportData() {
    setBusy(true);
    setMessage("");
    try {
      await repository.migrate();
      const data = await repository.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `n4-kotoba-memory-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("學習紀錄已匯出。");
    } catch {
      setMessage("學習紀錄匯出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setMessage("");
    try {
      const value: unknown = JSON.parse(await file.text());
      await repository.importData(value);
      onChanged();
      setMessage("學習紀錄已匯入。");
    } catch {
      setMessage("匯入失敗：檔案格式無效，現有紀錄未被覆蓋。");
    } finally {
      setBusy(false);
    }
  }

  async function resetData() {
    if (!window.confirm("確定要清除所有學習紀錄嗎？此動作無法復原，請先匯出備份。")) return;

    setBusy(true);
    setMessage("");
    try {
      await repository.reset();
      onChanged();
      setMessage("學習紀錄已清除。");
    } catch {
      setMessage("清除失敗，現有紀錄未被變更。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.dataTools} aria-labelledby="memory-data-title">
      <div>
        <p className={styles.eyebrow}>資料管理</p>
        <h2 id="memory-data-title">備份你的學習紀錄</h2>
        <p>可將 FSRS 記憶卡、複習歷史與學習事件匯出，換裝置前請先備份。</p>
      </div>
      <div className={styles.dataActions}>
        <button className={styles.actionSecondary} type="button" disabled={busy} onClick={() => void exportData()}>
          匯出備份
        </button>
        <label className={`${styles.actionSecondary} ${styles.fileButton}`}>
          匯入備份
          <input ref={inputRef} type="file" accept="application/json,.json" disabled={busy} onChange={(event) => void importData(event)} />
        </label>
        <button className={styles.dangerButton} type="button" disabled={busy} onClick={() => void resetData()}>
          清除紀錄
        </button>
      </div>
      {message && <p className={styles.dataNotice} role="status">{message}</p>}
    </section>
  );
}
