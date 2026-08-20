"use client";

import { FormEvent, useState } from "react";
import { useLearningData } from "../hooks/useLearningData";
import styles from "./SyncAccountCard.module.css";

export function SyncAccountCard() {
  const { authStatus, syncStatus, pendingCount, user, sendOtp, verifyOtp, retrySync, signOut } = useLearningData();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSendOtp(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try { await sendOtp(email.trim()); } catch (reason) { setError(reason instanceof Error ? reason.message : "驗證碼寄送失敗。"); }
    finally { setSubmitting(false); }
  }

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try { await verifyOtp(email.trim(), token.trim()); } catch (reason) { setError(reason instanceof Error ? reason.message : "登入驗證失敗。"); }
    finally { setSubmitting(false); }
  }

  async function handleSignOut() {
    setSubmitting(true);
    setError("");
    try { await signOut(); } catch (reason) { setError(reason instanceof Error ? reason.message : "登出失敗。"); }
    finally { setSubmitting(false); }
  }

  return (
    <section className={styles.card} aria-label="同步帳號">
      <div className={styles.heading}>
        <p className={styles.eyebrow}>三裝置同步</p>
        <strong>{user ? user.email ?? "已登入同步帳號" : "學習紀錄同步"}</strong>
      </div>
      {authStatus === "loading" && <p>正在準備本機學習資料…</p>}
      {!user && authStatus !== "loading" && authStatus !== "otp_sent" && (
        <form onSubmit={handleSendOtp} className={styles.form}>
          <p>目前只保存在這台裝置</p>
          <label htmlFor="sync-email">Email</label>
          <input id="sync-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          <button type="submit" disabled={submitting}>{submitting ? "寄送中…" : "寄送驗證碼"}</button>
        </form>
      )}
      {!user && authStatus === "otp_sent" && (
        <form onSubmit={handleVerifyOtp} className={styles.form}>
          <label htmlFor="sync-otp">Email 驗證碼</label>
          <input id="sync-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={token} onChange={(event) => setToken(event.target.value)} required />
          <button type="submit" disabled={submitting}>{submitting ? "確認中…" : "確認登入"}</button>
        </form>
      )}
      {user && <p>{syncStatus === "syncing" ? "正在合併三台裝置的學習紀錄…" : syncStatus === "synced" ? "已同步" : syncStatus === "pending" ? `有 ${pendingCount} 筆待同步` : "同步失敗，學習紀錄仍保存在本機"}</p>}
      {user && (syncStatus === "error" || syncStatus === "pending") && <button type="button" onClick={() => void retrySync()} disabled={submitting}>重新同步</button>}
      {user && <button type="button" onClick={() => void handleSignOut()} disabled={submitting}>登出</button>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
