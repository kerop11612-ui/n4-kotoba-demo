import type {
  LearningAnalysis,
  LearningAnalysisAgentContext,
} from "../spaced-repetition/ai-learning-analysis.ts";

export interface CachedAnalysis {
  cacheKey: string;
  analysis: LearningAnalysis;
  analysisDay: string;
  schemaVersion: string;
  model: string;
  completedAt: string;
}

export interface AnalysisCache {
  get(key: string): Promise<CachedAnalysis | null>;
  put(value: CachedAnalysis): Promise<void>;
}

export function isUsableCachedAnalysis(
  value: CachedAnalysis | null,
  context: LearningAnalysisAgentContext,
  validate: (value: unknown, input: LearningAnalysisAgentContext["input"]) => boolean,
): value is CachedAnalysis {
  if (!value) return false;
  return value.cacheKey === context.cacheKey
    && value.analysisDay === context.versions.analysisDay
    && value.schemaVersion === context.versions.schemaVersion
    && validate(value.analysis, context.input);
}
