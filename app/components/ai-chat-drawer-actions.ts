import type { AiChatStatus } from "../hooks/useAiChat.ts";

export function getAiChatDrawerActions(status: AiChatStatus): string[] {
  return [
    "關閉",
    "清除對話",
    status === "streaming" ? "停止產生" : status === "error" ? "重試" : "送出",
  ];
}
