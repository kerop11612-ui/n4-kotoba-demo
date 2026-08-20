function usageError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function requireChatGptAccount(accountResult) {
  if (accountResult?.account?.type !== "chatgpt") {
    throw usageError("codex_chatgpt_login_required");
  }
  return accountResult.account;
}

export function normalizeCodexUsage(accountResult, rateLimitResult, nowMs = Date.now()) {
  const account = requireChatGptAccount(accountResult);
  const limits = rateLimitResult?.rateLimits;
  return {
    connected: true,
    authMode: "chatgpt",
    planType: typeof account.planType === "string" ? account.planType : null,
    primary: normalizeWindow(limits?.primary),
    secondary: normalizeWindow(limits?.secondary),
    fetchedAt: new Date(nowMs).toISOString(),
  };
}

function normalizeWindow(value) {
  if (!value || typeof value !== "object") return null;
  const usedPercent = Number(value.usedPercent);
  const windowDurationMins = Number(value.windowDurationMins);
  const resetsAt = Number(value.resetsAt);
  if (!Number.isFinite(usedPercent)
    || !Number.isFinite(windowDurationMins)
    || !Number.isFinite(resetsAt)) return null;
  return {
    usedPercent: Math.min(100, Math.max(0, Math.round(usedPercent))),
    windowDurationMins: Math.max(0, Math.round(windowDurationMins)),
    resetsAt: new Date(resetsAt * 1000).toISOString(),
  };
}
