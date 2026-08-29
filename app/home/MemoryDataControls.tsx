"use client";

import { useRef, useState } from "react";
import type { MemoryRepository } from "../../src/storage/memory-repository";
import { getMemoryDataImportSummary, type MemoryDataImportSummary } from "../../src/storage/memory-repository-utils";
import styles from "./home.module.css";

type MemoryDataControlsProps = {
  repository: MemoryRepository;
  onChanged: () => void;
};

type PendingImport = {
  value: unknown;
  summary: MemoryDataImportSummary;
};

function downloadMemoryData(data: unknown, suffix: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `n4-kotoba-memory-${new Date().toISOString().slice(0, 10)}${suffix}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatImportSummary(summary: MemoryDataImportSummary) {
  const formatLabel = summary.format === "legacy" ? "舊版格式" : `第 ${summary.format.slice(1)} 版格式`;
  return `${formatLabel}：記憶卡 ${summary.memories} 張、複習歷史 ${summary.history} 筆、學習事件 ${summary.events} 筆。`;
}

export function MemoryDataControls({ repository, onChanged }: MemoryDataControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  async function exportData() {
    setBusy(true);
    setMessage("");
    try {
      await repository.migrate();
      const data = await repository.exportData();
      downloadMemoryData(data, "");
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
      const summary = getMemoryDataImportSummary(value);
      if (!summary) throw new Error("學習資料格式無效");
      setPendingImport({ value, summary });
      setMessage("請確認匯入內容後再覆蓋現有紀錄。");
    } catch {
      setPendingImport(null);
      setMessage("匯入失敗：檔案格式無效，現有紀錄未被覆蓋。");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    setBusy(true);
    setMessage("");
    try {
      await repository.migrate();
      const currentData = await repository.exportData();
      downloadMemoryData(currentData, "-before-import");
      await repository.importData(pendingImport.value);
      setPendingImport(null);
      onChanged();
      setMessage("學習紀錄已匯入；覆蓋前的備份也已下載。");
    } catch {
      setMessage("匯入失敗，現有紀錄未被覆蓋。");
    } finally {
      setBusy(false);
    }
  }

  function cancelImport() {
    setPendingImport(null);
    setMessage("已取消匯入，現有紀錄未變更。");
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
      {pendingImport && (
        <div className={styles.importPreview} role="region" aria-labelledby="memory-import-preview-title">
          <strong id="memory-import-preview-title">匯入內容預覽</strong>
          <p>{formatImportSummary(pendingImport.summary)}</p>
          <p>確認後會先下載目前紀錄備份，再覆蓋現有資料。</p>
          <div className={styles.dataActions}>
            <button className={styles.actionPrimary} type="button" disabled={busy} onClick={() => void confirmImport()}>
              確認覆蓋並備份
            </button>
            <button className={styles.actionSecondary} type="button" disabled={busy} onClick={cancelImport}>
              取消匯入
            </button>
          </div>
        </div>
      )}
      {message && <p className={styles.dataNotice} role="status">{message}</p>}
    </section>
  );
}
