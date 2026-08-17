export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type AiChatContext = {
  scope: "home" | "unit";
  label: string;
  unitId?: string;
  recentPeriodLabel: string;
  recommendation?: {
    title: string;
    reason: string;
    evidenceLabel: string;
  };
};

export type AiChatRequest = {
  context: AiChatContext;
  messages: Array<Pick<AiChatMessage, "role" | "text">>;
  question: string;
};

export type AiChatRecord =
  | { type: "delta"; text: string }
  | { type: "done"; model?: string; completedAt?: string }
  | { type: "fallback"; reason: string };

export function normalizeChatQuestion(value: string): string {
  const question = value.trim();
  if (!question) throw new Error("question_required");
  if (Array.from(question).length > 500) throw new Error("question_too_long");
  return question;
}

export function buildChatRequest({
  context,
  messages,
  question,
}: {
  context: AiChatContext;
  messages: AiChatMessage[];
  question: string;
}): AiChatRequest {
  const safeContext: AiChatContext = {
    scope: context.scope,
    label: context.label,
    recentPeriodLabel: context.recentPeriodLabel,
    ...(context.unitId ? { unitId: context.unitId } : {}),
    ...(context.recommendation
      ? {
          recommendation: {
            title: context.recommendation.title,
            reason: context.recommendation.reason,
            evidenceLabel: context.recommendation.evidenceLabel,
          },
        }
      : {}),
  };

  return {
    context: safeContext,
    messages: toBridgeMessages(messages).slice(-6),
    question: normalizeChatQuestion(question),
  };
}

export function appendChatMessage(messages: AiChatMessage[], message: AiChatMessage): AiChatMessage[] {
  return [...messages, message].slice(-30);
}

export function toBridgeMessages(messages: AiChatMessage[]): AiChatRequest["messages"] {
  return messages.map(({ role, text }) => ({ role, text }));
}
