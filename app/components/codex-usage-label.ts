import type { AiStatus, CodexUsageWindow } from "../../src/ai/local-ai-client.ts";

export function formatCodexUsageLabel(
  status: AiStatus | null,
  locale = "zh-TW",
  timeZone = "Asia/Taipei",
): string {
  if (!status) return "正在確認 Codex 用量…";
  if (status.reason === "codex_chatgpt_login_required") {
    return "請先用 ChatGPT 登入 Codex；本功能不使用 API key。";
  }
  if (!status.connected || !status.usage) {
    return "Codex AI bridge 未連線，單字學習仍可正常使用。";
  }
  const plan = status.usage.planType
    ? status.usage.planType[0].toUpperCase() + status.usage.planType.slice(1)
    : "ChatGPT";
  const parts = [`Codex ${plan}`];
  if (status.usage.primary) parts.push(formatWindow("主要用量", status.usage.primary, locale, timeZone));
  if (status.usage.secondary) parts.push(formatWindow("次要用量", status.usage.secondary, locale, timeZone));
  if (!status.usage.primary && !status.usage.secondary) parts.push("目前沒有可顯示的用量窗口");
  return parts.join("・");
}

function formatWindow(label: string, value: CodexUsageWindow, locale: string, timeZone: string): string {
  const reset = new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value.resetsAt));
  return `${label}已用 ${value.usedPercent}%・${reset} 重置`;
}
