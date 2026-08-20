"use client";

import { useEffect, useRef, type FormEvent } from "react";
import type { AiChatContext, AiChatMessage } from "../../src/ai/chat.ts";
import type { AiChatStatus } from "../hooks/useAiChat.ts";
import { useCodexUsage } from "../hooks/useCodexUsage.ts";
import { formatCodexUsageLabel } from "./codex-usage-label.ts";
import styles from "./AiChatDrawer.module.css";

type Props = {
  open: boolean;
  context: AiChatContext;
  messages: AiChatMessage[];
  draft: string;
  status: AiChatStatus;
  error: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  onClear: () => void;
  onClose: () => void;
};

const presetQuestions = ["為什麼推薦這個？", "我今天該先學什麼？", "怎麼複習比較有效？"];

export function AiChatDrawer({
  open,
  context,
  messages,
  draft,
  status,
  error,
  onDraftChange,
  onSend,
  onStop,
  onRetry,
  onClear,
  onClose,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const previousChatStatusRef = useRef<AiChatStatus>(status);
  const { state: codexUsageState, refresh: refreshCodexUsage } = useCodexUsage(open);
  const usageLabel = formatCodexUsageLabel(codexUsageState.status);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      openerRef.current?.focus();
    };
  }, [onClose, open]);

  useEffect(() => {
    const previous = previousChatStatusRef.current;
    previousChatStatusRef.current = status;
    if (open && previous === "streaming" && status === "ready") {
      void refreshCodexUsage();
    }
  }, [open, refreshCodexUsage, status]);

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "streaming" && codexUsageState.status?.connected === true) onSend();
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-title"
        aria-describedby="ai-chat-context"
      >
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>AI 學習助教</p>
            <h2 id="ai-chat-title">問問 AI</h2>
          </div>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="關閉 AI 對話">
            關閉
          </button>
        </header>

        <p className={styles.context} id="ai-chat-context">
          目前範圍：{context.label}・{context.recentPeriodLabel}
        </p>
        <p className={styles.usageStatus} role="status" aria-atomic="true">
          {usageLabel}
        </p>

        <div className={styles.messages} aria-live="polite" aria-busy={status === "streaming"}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>可以從目前的學習建議開始問</strong>
              <p>AI 只會解讀學習資料並提供建議，不會修改你的複習排程。</p>
            </div>
          ) : messages.map((message) => (
            <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} key={message.id}>
              <span>{message.role === "user" ? "你" : "AI 助教"}</span>
              <p>{message.text || (status === "streaming" ? "正在思考…" : "未產生回覆")}</p>
            </article>
          ))}
        </div>

        {messages.length === 0 && (
          <div className={styles.presets} aria-label="建議問題">
            {presetQuestions.map((question) => (
              <button key={question} type="button" onClick={() => onDraftChange(question)}>
                {question}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {formatError(error)}
          </p>
        )}

        <form className={styles.composer} onSubmit={handleSubmit}>
          <label htmlFor="ai-chat-question">輸入問題</label>
          <textarea
            ref={textareaRef}
            id="ai-chat-question"
            value={draft}
            maxLength={500}
            rows={3}
            placeholder="例如：為什麼建議我先複習弱項？"
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <div className={styles.composerMeta}>
            <span>{draft.length}／500</span>
            <div className={styles.actions}>
              <button className={styles.clearButton} type="button" onClick={onClear} disabled={!messages.length && !draft}>
                清除對話
              </button>
              {status === "streaming" ? (
                <button className={styles.primaryButton} type="button" onClick={onStop}>停止產生</button>
              ) : status === "error" && messages.some((message) => message.role === "user") ? (
                <button className={styles.primaryButton} type="button" onClick={onRetry}>重試</button>
              ) : (
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={!draft.trim() || codexUsageState.loading || codexUsageState.status?.connected !== true}
                >
                  送出
                </button>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function formatError(error: string): string {
  if (error === "question_required") return "請先輸入問題。";
  if (error === "question_too_long") return "問題最多 500 個字。";
  return "AI 服務目前未連線，單字學習仍可正常使用。";
}
