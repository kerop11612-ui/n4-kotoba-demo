"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildLearningAnalysisAgentContext,
  type LearningAnalysis,
  type LearningAnalysisAgentContext,
  type LearningAnalysisInput,
} from "../../src/spaced-repetition/ai-learning-analysis.ts";
import { LocalAiClient, type AiAnalysisRecord } from "../../src/ai/local-ai-client.ts";

export type AiCoachState = {
  analysis: LearningAnalysis;
  source: "local" | "ai" | "cache";
  status: "idle" | "connecting" | "streaming" | "ready" | "offline" | "error";
  generatedAt: string | null;
  error: string | null;
};

export type AiCoachClient = Pick<LocalAiClient, "analyzeLearning">;

export function createInitialAiCoachState(context: LearningAnalysisAgentContext): AiCoachState {
  return {
    analysis: context.baseline,
    source: "local",
    status: "idle",
    generatedAt: null,
    error: null,
  };
}

export function reduceAiCoachRecord(state: AiCoachState, record: AiAnalysisRecord): AiCoachState {
  if (record.type === "baseline") {
    return { ...state, analysis: record.analysis, source: "local", error: null };
  }
  if (record.type === "done") {
    return {
      ...state,
      analysis: record.analysis,
      source: record.source,
      status: "ready",
      generatedAt: record.completedAt ?? state.generatedAt,
      error: null,
    };
  }
  return {
    ...state,
    analysis: record.analysis,
    source: "local",
    status: "offline",
    error: record.reason,
  };
}

export function useAiCoach({
  input,
  client,
  enabled = true,
}: {
  input: LearningAnalysisInput;
  client?: AiCoachClient;
  enabled?: boolean;
}) {
  const context = useMemo(() => buildLearningAnalysisAgentContext(input), [input]);
  const defaultClient = useMemo(() => new LocalAiClient(), []);
  const activeClient = client ?? defaultClient;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<AiCoachState & { contextKey: string }>(() => ({
    ...createInitialAiCoachState(context),
    contextKey: context.cacheKey,
  }));

  const visibleState = state.contextKey === context.cacheKey
    ? state
    : {
      ...createInitialAiCoachState(context),
      status: enabled && context.shouldCallAi ? "connecting" as const : "idle" as const,
    };

  useEffect(() => {
    const controller = new AbortController();
    if (!enabled || !context.shouldCallAi) return () => controller.abort();

    let active = true;
    void (async () => {
      try {
        for await (const record of activeClient.analyzeLearning(context, controller.signal)) {
          if (!active) return;
          setState((current) => {
            const base = current.contextKey === context.cacheKey
              ? current
              : { ...createInitialAiCoachState(context), contextKey: context.cacheKey };
            const next = reduceAiCoachRecord(base, record);
            return {
              ...next,
              contextKey: context.cacheKey,
              ...(record.type === "baseline" ? { status: "streaming" as const } : {}),
            };
          });
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setState((current) => ({
          ...(current.contextKey === context.cacheKey ? current : createInitialAiCoachState(context)),
          source: "local",
          status: "offline",
          error: error instanceof Error ? error.message : "ai_unavailable",
          contextKey: context.cacheKey,
        }));
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeClient, context, enabled, revision]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { ...visibleState, context, retry };
}
