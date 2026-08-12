"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendChatMessage,
  buildChatRequest,
  normalizeChatQuestion,
  type AiChatContext,
  type AiChatMessage,
  type AiChatRecord,
} from "../../src/ai/chat.ts";
import { LocalAiClient } from "../../src/ai/local-ai-client.ts";

const MAX_MESSAGES = 30;

export type AiChatStatus = "idle" | "streaming" | "ready" | "error";

export type AiChatState = {
  contextKey: string;
  messages: AiChatMessage[];
  draft: string;
  status: AiChatStatus;
  error: string | null;
  isOpen: boolean;
};

export type AiChatStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type AiChatClient = Pick<LocalAiClient, "chatJapanese">;

export function createChatState(contextKey: string): AiChatState {
  return {
    contextKey,
    messages: [],
    draft: "",
    status: "idle",
    error: null,
    isOpen: false,
  };
}

export function reduceChatRecord(state: AiChatState, record: AiChatRecord): AiChatState {
  if (record.type === "delta") {
    const last = state.messages.at(-1);
    const messages = last?.role === "assistant"
      ? appendChatMessage(state.messages.slice(0, -1), { ...last, text: last.text + record.text })
      : appendChatMessage(state.messages, {
        id: `assistant-${state.messages.length}`,
        role: "assistant",
        text: record.text,
        createdAt: new Date().toISOString(),
      });
    return { ...state, messages, status: "streaming", error: null };
  }
  if (record.type === "done") return { ...state, status: "ready", error: null };
  return { ...state, status: "error", error: record.reason };
}

export function loadChatMessages(serialized: string | null | undefined): AiChatMessage[] {
  if (!serialized) return [];
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    return value.filter(isChatMessage).slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function saveChatMessages(messages: AiChatMessage[]): string {
  return JSON.stringify(messages.filter(isChatMessage).slice(-MAX_MESSAGES));
}

export function getAiChatStorageKey(context: AiChatContext): string {
  return `n4-kotoba:ai-chat:v1:${context.scope}:${context.unitId ?? "home"}`;
}

export function useAiChat({
  context,
  client,
  storage,
  enabled = true,
}: {
  context: AiChatContext;
  client?: AiChatClient;
  storage?: AiChatStorage;
  enabled?: boolean;
}) {
  const contextKey = getAiChatStorageKey(context);
  const defaultClient = useMemo(() => new LocalAiClient(), []);
  const activeClient = client ?? defaultClient;
  const [state, setState] = useState<AiChatState>(() => createChatState(contextKey));
  const controllerRef = useRef<AbortController | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const skipPersistRef = useRef(false);

  useEffect(() => {
    loadedKeyRef.current = null;
    let messages: AiChatMessage[] = [];
    try {
      const activeStorage = storage ?? browserStorage();
      messages = loadChatMessages(activeStorage?.getItem(contextKey));
    } catch {
      messages = [];
    }
    loadedKeyRef.current = contextKey;
    setState((current) => ({
      ...createChatState(contextKey),
      isOpen: current.contextKey === contextKey ? current.isOpen : false,
      messages,
    }));
  }, [contextKey, storage]);

  useEffect(() => {
    if (loadedKeyRef.current !== contextKey) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    try {
      const activeStorage = storage ?? browserStorage();
      activeStorage?.setItem(contextKey, saveChatMessages(state.messages));
    } catch {
      // Local persistence is best effort and must not block learning.
    }
  }, [contextKey, state.messages, storage]);

  const setDraft = useCallback((draft: string) => {
    setState((current) => ({ ...current, draft }));
  }, []);

  const open = useCallback((initialQuestion = "") => {
    setState((current) => ({ ...current, isOpen: true, draft: initialQuestion }));
  }, []);

  const close = useCallback(() => {
    setState((current) => ({ ...current, isOpen: false }));
  }, []);

  const runSend = useCallback(async (rawQuestion: string, appendUser: boolean) => {
    if (!enabled || state.status === "streaming") return;
    let question: string;
    try {
      question = normalizeChatQuestion(rawQuestion);
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "question_required",
      }));
      return;
    }

    const request = buildChatRequest({ context, messages: state.messages, question });
    const controller = new AbortController();
    controllerRef.current = controller;
    const userMessage: AiChatMessage = {
      id: createMessageId("user"),
      role: "user",
      text: question,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: AiChatMessage = {
      id: createMessageId("assistant"),
      role: "assistant",
      text: "",
      createdAt: new Date().toISOString(),
    };
    const startMessages = appendUser
      ? appendChatMessage(state.messages, userMessage)
      : state.messages.slice(0, Math.max(0, state.messages.map((message) => message.role).lastIndexOf("user") + 1));
    setState((current) => ({
      ...current,
      draft: "",
      messages: appendChatMessage(startMessages, assistantMessage),
      status: "streaming",
      error: null,
    }));

    try {
      for await (const record of activeClient.chatJapanese(request, controller.signal)) {
        setState((current) => reduceChatRecord(current, record));
      }
      setState((current) => current.status === "streaming" ? { ...current, status: "ready" } : current);
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "ai_unavailable",
      }));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [activeClient, context, enabled, state.messages, state.status]);

  const send = useCallback(() => runSend(state.draft, true), [runSend, state.draft]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    setState((current) => current.status === "streaming"
      ? { ...current, status: "ready", error: null }
      : current);
  }, []);

  const retry = useCallback(() => {
    const lastQuestion = [...state.messages].reverse().find((message) => message.role === "user");
    if (lastQuestion) void runSend(lastQuestion.text, false);
  }, [runSend, state.messages]);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    skipPersistRef.current = true;
    try {
      const activeStorage = storage ?? browserStorage();
      activeStorage?.removeItem(contextKey);
    } catch {
      // Local persistence is best effort.
    }
    setState((current) => ({ ...createChatState(contextKey), isOpen: current.isOpen }));
  }, [contextKey, storage]);

  return {
    messages: state.messages,
    draft: state.draft,
    setDraft,
    status: state.status,
    error: state.error,
    isOpen: state.isOpen,
    open,
    close,
    send,
    stop,
    retry,
    clear,
  };
}

function isChatMessage(value: unknown): value is AiChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return typeof message.id === "string"
    && (message.role === "user" || message.role === "assistant")
    && typeof message.text === "string"
    && typeof message.createdAt === "string";
}

function createMessageId(role: AiChatMessage["role"]): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${role}-${crypto.randomUUID()}`;
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function browserStorage(): AiChatStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
