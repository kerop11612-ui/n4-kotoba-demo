"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocalAiClient, type AiStatus } from "../../src/ai/local-ai-client.ts";

export type CodexUsageState = {
  status: AiStatus | null;
  loading: boolean;
};

export function useCodexUsage(open: boolean, client?: Pick<LocalAiClient, "status">) {
  const defaultClient = useMemo(() => new LocalAiClient(), []);
  const activeClient = client ?? defaultClient;
  const controllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<CodexUsageState>({ status: null, loading: false });

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({ ...current, loading: true }));
    const status = await activeClient.status(controller.signal);
    if (!controller.signal.aborted) setState({ status, loading: false });
  }, [activeClient]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [open, refresh]);

  return { state, refresh };
}
