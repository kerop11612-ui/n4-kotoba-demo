"use client";

import { getAiChatFabProps } from "./ai-chat-fab-actions";
import styles from "./AiChatFab.module.css";

type Props = {
  onOpen: () => void;
};

export function AiChatFab({ onOpen }: Props) {
  const { label, ariaLabel } = getAiChatFabProps();

  return (
    <button className={styles.fab} type="button" aria-label={ariaLabel} onClick={onOpen}>
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 4v-4.2A3.5 3.5 0 0 1 5 11.5v-5Z" />
        <path d="M9 8.5h6M9 11h3.5" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
