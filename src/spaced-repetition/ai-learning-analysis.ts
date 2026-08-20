import { calculateMasterySnapshot } from "./mastery.ts";
import type {
  MemorySkill,
  ReviewErrorType,
  VocabularyReviewEvent,
  WordMemoryRecord,
} from "./types.ts";
import { getMemoryKey } from "./types.ts";

export type LearningFindingType =
  | "weak_retention"
  | "hint_dependency"
  | "slow_recall"
  | "word_confusion"
  | "review_overload"
  | "insufficient_evidence";

export type LearningActionType =
  | "contrast_quiz"
  | "reading_quiz"
  | "context_sentence"
  | "audio_quiz"
  | "reduce_new_cards"
  | "maintain_new_cards";

export interface WeakLearningItem {
  wordId: string;
  word: string;
  reading?: string;
  skill: MemorySkill;
  currentRecall: number;
  retention30d: number;
  independentAccuracy: number;
  hintRate: number;
  averageResponseMs: number;
  periodReviewCount: number;
  lifetimeReviewCount: number;
  /** @deprecated Use periodReviewCount for evidence and lifetimeReviewCount for display. */
  reviewCount: number;
  lapseCount: number;
  confusedWordIds: string[];
  errorTypes: ReviewErrorType[];
}

export interface LearningAnalysisInput {
  periodStart: string;
  periodEnd: string;
  summary: {
    totalReviews: number;
    uniqueWords: number;
    independentRecallRate: number;
    hintRate: number;
    averageResponseMs: number;
    dueReviewCount: number;
    newCardCount: number;
  };
  weakItems: WeakLearningItem[];
}

export interface LearningSignal {
  type: LearningFindingType;
  wordIds: string[];
  reason: string;
  evidence: string[];
  confidence: number;
}

export interface AnalysisThresholds {
  weakRetention: number;
  hintDependency: number;
  slowRecallMs: number;
  minimumEvidenceReviews: number;
  reviewOverloadCount: number;
}

/**
 * AI Agent 的輸入上限。先在本地篩選，避免每次分析都傳送完整學習紀錄。
 */
export interface LearningAnalysisAgentPolicy {
  minimumReviews: number;
  maxWeakItems: number;
  maxConfusedWordIds: number;
  maxErrorTypes: number;
}

export const AI_AGENT_POLICY: LearningAnalysisAgentPolicy = {
  minimumReviews: 3,
  maxWeakItems: 5,
  maxConfusedWordIds: 3,
  maxErrorTypes: 3,
};

const MAX_AI_RESPONSE_CHARS = 50_000;
const MAX_ANALYSIS_TEXT_LENGTH = 120;

export const ANALYSIS_THRESHOLDS: AnalysisThresholds = {
  weakRetention: 0.5,
  hintDependency: 0.3,
  slowRecallMs: 5000,
  minimumEvidenceReviews: 3,
  reviewOverloadCount: 100,
};

export interface LearningAnalysis {
  overallStatus: "good" | "warning" | "overloaded";
  findings: Array<{
    type: LearningFindingType;
    wordIds: string[];
    reason: string;
    evidence: string[];
    confidence: number;
  }>;
  recommendedActions: Array<{
    action: LearningActionType;
    wordIds: string[];
    priority: number;
    questionCount: number;
    reason: string;
  }>;
}

export interface AnalysisVocabularyItem {
  wordId: string;
  word: string;
  reading?: string;
}

export const AI_LEARNING_SYSTEM_PROMPT = `你是日文單字學習分析 Agent。

你只能分析已提供的聚合資料。
你不能自行修改 FSRS 排程、到期時間、stability、difficulty、desired retention 或 rating。
你不能聲稱資料可以證明沒有提供的事情。
你需要區分：
1. 已觀察到的資料
2. 根據資料做出的推論
3. 建議採取的行動

最多回傳 3 個 findings。
最多回傳 1 個 recommendedAction。
只回傳符合 schema 的 JSON。`;

export const LEARNING_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overallStatus", "findings", "recommendedActions"],
  properties: {
    overallStatus: { type: "string", enum: ["good", "warning", "overloaded"] },
    findings: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "wordIds", "reason", "evidence", "confidence"],
        properties: {
          type: { type: "string", enum: ["weak_retention", "hint_dependency", "slow_recall", "word_confusion", "review_overload", "insufficient_evidence"] },
          wordIds: { type: "array", maxItems: 3, items: { type: "string" } },
          reason: { type: "string", maxLength: 120 },
          evidence: { type: "array", maxItems: 3, items: { type: "string", maxLength: 120 } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    recommendedActions: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "wordIds", "priority", "questionCount", "reason"],
        properties: {
          action: { type: "string", enum: ["contrast_quiz", "reading_quiz", "context_sentence", "audio_quiz", "reduce_new_cards", "maintain_new_cards"] },
          wordIds: { type: "array", maxItems: 3, items: { type: "string" } },
          priority: { type: "number", minimum: 0, maximum: 1 },
          questionCount: { type: "integer", minimum: 1, maximum: 20 },
          reason: { type: "string", maxLength: 120 },
        },
      },
    },
  },
} as const;

export function aggregateLearningAnalysis(
  events: VocabularyReviewEvent[],
  memories: WordMemoryRecord[],
  vocabulary: AnalysisVocabularyItem[],
  periodStart: string,
  periodEnd: string,
  now = new Date(),
): LearningAnalysisInput {
  const parsedStart = Date.parse(periodStart);
  const parsedEnd = Date.parse(periodEnd);
  const end = Number.isFinite(parsedEnd) ? parsedEnd : now.getTime();
  const start = Math.max(
    Number.isFinite(parsedStart) ? parsedStart : end - 14 * 86_400_000,
    end - 14 * 86_400_000,
  );
  const inPeriod = events.filter((event) => {
    const time = Date.parse(event.reviewedAt);
    return Number.isFinite(time) && time >= start && time <= end;
  });
  const vocabularyById = new Map(vocabulary.map((item) => [item.wordId, item]));
  const eventsByMemory = new Map<string, VocabularyReviewEvent[]>();
  for (const event of inPeriod) {
    const key = getMemoryKey(event.wordId, event.skill);
    const current = eventsByMemory.get(key) ?? [];
    current.push(event);
    eventsByMemory.set(key, current);
  }
  const memoryByKey = new Map(memories.map((memory) => [getMemoryKey(memory.wordId, memory.skill), memory]));
  // 沒有本分析期間事件的記憶卡不送給 Agent；它們只能用於整體到期統計，
  // 否則長期累積的歷史卡片會浪費 context，並讓 Agent 誤判目前弱項。
  const keys = [...eventsByMemory.keys()].sort();
  const weakItems = keys.map((key) => {
    const memory = memoryByKey.get(key);
    const eventsForMemory = eventsByMemory.get(key) ?? [];
    const wordId = memory?.wordId ?? eventsForMemory[0]?.wordId ?? key.split(":")[0];
    const skill = memory?.skill ?? eventsForMemory[0]?.skill ?? "jp_to_meaning";
    const vocabularyItem = vocabularyById.get(wordId);
    const snapshot = calculateMasterySnapshot(memory, now, 30);
    const periodReviewCount = eventsForMemory.length;
    const lifetimeReviewCount = memory?.reviewCount ?? periodReviewCount;
    const independentEvents = eventsForMemory.filter((event) => event.recalledWithoutHint);
    const independentCorrect = independentEvents.filter((event) => event.correct).length;
    const independentAccuracy = independentEvents.length
      ? independentCorrect / independentEvents.length
      : lifetimeReviewCount > 0 ? snapshot.independentRecallRatePercent / 100 : 0;
    const hintRate = eventsForMemory.length
      ? eventsForMemory.filter((event) => event.usedHint ?? event.hintLevel > 0).length / eventsForMemory.length
      : lifetimeReviewCount > 0 ? snapshot.hintDependencyPercent / 100 : 0;
    const responseTimes = eventsForMemory.map((event) => event.responseMs).filter(isValidDuration);
    const confusedWordIds = [...new Set(eventsForMemory.flatMap((event) => event.confusedWordIds ?? []))].sort().slice(0, 3);
    const errorTypes = [...new Set(eventsForMemory.flatMap((event) => event.errorTypes))].slice(0, 3);
    return {
      wordId,
      word: vocabularyItem?.word ?? wordId,
      reading: vocabularyItem?.reading,
      skill,
      currentRecall: snapshot.currentRecallPercent / 100,
      retention30d: snapshot.masteryPercent / 100,
      independentAccuracy: clamp(independentAccuracy, 0, 1),
      hintRate: clamp(hintRate, 0, 1),
      averageResponseMs: responseTimes.length ? average(responseTimes) : 0,
      periodReviewCount,
      lifetimeReviewCount,
      reviewCount: periodReviewCount,
      lapseCount: memory?.lapseCount ?? 0,
      confusedWordIds,
      errorTypes,
    };
  }).filter((item) => item.periodReviewCount > 0 || eventsByMemory.has(getMemoryKey(item.wordId, item.skill)))
    .sort(compareWeakItems)
    .slice(0, 20);
  const validResponseTimes = inPeriod.map((event) => event.responseMs).filter(isValidDuration);
  const independentEvents = inPeriod.filter((event) => event.recalledWithoutHint);
  return {
    periodStart,
    periodEnd,
    summary: {
      totalReviews: inPeriod.length,
      uniqueWords: new Set(inPeriod.map((event) => event.wordId)).size,
      independentRecallRate: independentEvents.length
        ? independentEvents.filter((event) => event.correct).length / independentEvents.length
        : 0,
      hintRate: inPeriod.length
        ? inPeriod.filter((event) => event.usedHint ?? event.hintLevel > 0).length / inPeriod.length
        : 0,
      averageResponseMs: validResponseTimes.length ? average(validResponseTimes) : 0,
      dueReviewCount: memories.filter((memory) => Date.parse(memory.fsrsCard.due) <= now.getTime()).length,
      newCardCount: memories.filter((memory) => memory.reviewCount <= 0).length,
    },
    weakItems,
  };
}

export interface LearningAnalysisContextVersions {
  promptVersion: string;
  schemaVersion: string;
  thresholdVersion: string;
  analysisDay: string;
  efficiencyPolicyVersion: string;
  model: string;
}

export interface LearningAnalysisAgentContext {
  input: LearningAnalysisInput;
  baseline: LearningAnalysis;
  cacheKey: string;
  versions: LearningAnalysisContextVersions;
  shouldCallAi: boolean;
}

export function detectLearningSignals(
  input: LearningAnalysisInput,
  thresholds: AnalysisThresholds = ANALYSIS_THRESHOLDS,
): LearningSignal[] {
  const signals: LearningSignal[] = [];
  for (const item of input.weakItems) {
    const periodReviewCount = getPeriodReviewCount(item);
    if (item.retention30d < thresholds.weakRetention && periodReviewCount >= thresholds.minimumEvidenceReviews) {
      signals.push({
        type: "weak_retention",
        wordIds: [item.wordId],
        reason: "30 天保持率偏低",
        evidence: [`30 天保持率 ${percent(item.retention30d)}`, `近 3 天複習 ${periodReviewCount} 次`],
        confidence: confidence(periodReviewCount, thresholds.minimumEvidenceReviews),
      });
    }
    if (item.hintRate >= thresholds.hintDependency && periodReviewCount >= thresholds.minimumEvidenceReviews) {
      signals.push({
        type: "hint_dependency",
        wordIds: [item.wordId],
        reason: "提示依賴偏高",
        evidence: [`提示後答對率 ${percent(item.hintRate)}`, `近 3 天複習 ${periodReviewCount} 次`],
        confidence: confidence(periodReviewCount, thresholds.minimumEvidenceReviews),
      });
    }
    if (item.averageResponseMs >= thresholds.slowRecallMs && item.independentAccuracy >= 0.6) {
      signals.push({
        type: "slow_recall",
        wordIds: [item.wordId],
        reason: "無提示回想速度偏慢",
        evidence: [`平均作答 ${Math.round(item.averageResponseMs)} ms`, `無提示答對率 ${percent(item.independentAccuracy)}`],
        confidence: 0.7,
      });
    }
    if (item.confusedWordIds.length > 0) {
      signals.push({
        type: "word_confusion",
        wordIds: [item.wordId, ...item.confusedWordIds],
        reason: "作答紀錄出現混淆單字",
        evidence: [`混淆單字 ${item.confusedWordIds.join(", ")}`],
        confidence: 0.8,
      });
    }
    if (periodReviewCount < thresholds.minimumEvidenceReviews) {
      signals.push({
        type: "insufficient_evidence",
        wordIds: [item.wordId],
        reason: "複習證據不足",
        evidence: [`近 3 天僅複習 ${periodReviewCount} 次`],
        confidence: 1,
      });
    }
  }
  if (input.summary.dueReviewCount > thresholds.reviewOverloadCount) {
    signals.push({
      type: "review_overload",
      wordIds: [],
      reason: "待複習卡片數量過高",
      evidence: [`到期卡 ${input.summary.dueReviewCount} 張`],
      confidence: 1,
    });
  }
  return signals.sort(compareSignals);
}

export function buildDeterministicLearningAnalysis(
  input: LearningAnalysisInput,
  thresholds: AnalysisThresholds = ANALYSIS_THRESHOLDS,
): LearningAnalysis {
  const signals = detectLearningSignals(input, thresholds);
  const findings = signals.slice(0, 3).map((signal) => ({ ...signal }));
  const recommendedActions = signals
    .filter((signal) => signal.type !== "insufficient_evidence")
    .map(toAction)
    .filter((action, index, items) => items.findIndex((item) => item.action === action.action) === index)
    .slice(0, 1);
  return {
    overallStatus: signals.some((signal) => signal.type === "review_overload")
      ? "overloaded"
      : signals.length ? "warning" : "good",
    findings,
    recommendedActions,
  };
}

/**
 * 將 Agent 輸入限制在最有價值的弱項，降低 token、延遲與誤判機率。
 */
export function compactLearningAnalysisInput(
  input: LearningAnalysisInput,
  policy: LearningAnalysisAgentPolicy = AI_AGENT_POLICY,
): LearningAnalysisInput {
  const maxWeakItems = safeLimit(policy.maxWeakItems, AI_AGENT_POLICY.maxWeakItems);
  const maxConfusedWordIds = safeLimit(policy.maxConfusedWordIds, AI_AGENT_POLICY.maxConfusedWordIds);
  const maxErrorTypes = safeLimit(policy.maxErrorTypes, AI_AGENT_POLICY.maxErrorTypes);
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    summary: { ...input.summary },
    weakItems: input.weakItems.slice(0, maxWeakItems).map((item) => ({
      ...item,
      confusedWordIds: item.confusedWordIds.slice(0, maxConfusedWordIds),
      errorTypes: item.errorTypes.slice(0, maxErrorTypes),
    })),
  };
}

/**
 * 只有本地規則已找到可行動訊號，且證據量足夠時才呼叫 AI。
 */
export function shouldRunAiLearningAnalysis(
  input: LearningAnalysisInput,
  baseline: LearningAnalysis = buildDeterministicLearningAnalysis(input),
  policy: LearningAnalysisAgentPolicy = AI_AGENT_POLICY,
): boolean {
  const minimumReviews = safeLimit(policy.minimumReviews, AI_AGENT_POLICY.minimumReviews);
  return input.summary.totalReviews >= minimumReviews
    && input.weakItems.length > 0
    && baseline.findings.some((finding) => finding.type !== "insufficient_evidence");
}

/**
 * 建立可直接交給 API/Agent adapter 使用的上下文；本函數不會執行網路呼叫。
 */
export function buildLearningAnalysisAgentContext(
  input: LearningAnalysisInput,
  thresholds: AnalysisThresholds = ANALYSIS_THRESHOLDS,
  policy: LearningAnalysisAgentPolicy = AI_AGENT_POLICY,
  versions?: Partial<LearningAnalysisContextVersions>,
): LearningAnalysisAgentContext {
  const compactInput = compactLearningAnalysisInput(input, policy);
  const baseline = buildDeterministicLearningAnalysis(compactInput, thresholds);
  const resolvedVersions = {
    ...getDefaultContextVersions(compactInput),
    ...versions,
  };
  return {
    input: compactInput,
    baseline,
    cacheKey: createLearningAnalysisCacheKey(compactInput, resolvedVersions),
    versions: resolvedVersions,
    shouldCallAi: shouldRunAiLearningAnalysis(compactInput, baseline, policy),
  };
}

/**
 * 內容相同時產生相同 key，讓上層可避免重複呼叫 AI。
 */
export function createLearningAnalysisCacheKey(
  input: LearningAnalysisInput,
  versions: Partial<LearningAnalysisContextVersions> | string = {},
): string {
  const resolvedVersions = typeof versions === "string"
    ? { ...getDefaultContextVersions(input), schemaVersion: versions }
    : { ...getDefaultContextVersions(input), ...versions };
  return `sha256:${sha256Text(canonicalize({ input, versions: resolvedVersions }))}`;
}

export function validateLearningAnalysis(value: unknown): value is LearningAnalysis {
  if (!isRecord(value) || !hasExactKeys(value, ["overallStatus", "findings", "recommendedActions"])) return false;
  if (value.overallStatus !== "good" && value.overallStatus !== "warning" && value.overallStatus !== "overloaded") return false;
  if (!Array.isArray(value.findings) || value.findings.length > 3 || !value.findings.every(isValidFinding)) return false;
  return Array.isArray(value.recommendedActions)
    && value.recommendedActions.length <= 1
    && value.recommendedActions.every(isValidAction);
}

export function validateLearningAnalysisForContext(
  value: unknown,
  input: LearningAnalysisInput,
): value is LearningAnalysis {
  if (!validateLearningAnalysis(value)) return false;
  const allowedWordIds = new Set(input.weakItems.flatMap((item) => [item.wordId, ...item.confusedWordIds]));
  const allItems = [...value.findings, ...value.recommendedActions];
  if (allItems.some((item) => item.wordIds.some((wordId) => !allowedWordIds.has(wordId)))) return false;
  if (allItems.some((item) => new Set(item.wordIds).size !== item.wordIds.length)) return false;
  const hasOverloadFinding = value.findings.some((finding) => finding.type === "review_overload");
  if ((value.overallStatus === "overloaded") !== hasOverloadFinding) return false;
  if (value.recommendedActions.some((action) => action.action === "reduce_new_cards") && !hasOverloadFinding) return false;
  return true;
}

export function parseLearningAnalysisJson(
  text: string,
  fallbackInput: LearningAnalysisInput | LearningAnalysisAgentContext,
): LearningAnalysis {
  const input = isLearningAnalysisAgentContext(fallbackInput) ? fallbackInput.input : fallbackInput;
  const fallback = isLearningAnalysisAgentContext(fallbackInput)
    ? fallbackInput.baseline
    : buildDeterministicLearningAnalysis(input);
  if (typeof text !== "string" || text.length > MAX_AI_RESPONSE_CHARS) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isLearningAnalysisAgentContext(fallbackInput)
      ? validateLearningAnalysisForContext(parsed, input) ? normalizeAnalysis(parsed) : fallback
      : validateLearningAnalysis(parsed) ? normalizeAnalysis(parsed) : fallback;
  } catch {
    return fallback;
  }
}

function isValidFinding(value: unknown): value is LearningAnalysis["findings"][number] {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "wordIds", "reason", "evidence", "confidence"])) return false;
  return isFindingType(value.type)
    && isBoundedStringArray(value.wordIds, 3)
    && isNonEmptyBoundedString(value.reason, MAX_ANALYSIS_TEXT_LENGTH)
    && isNonEmptyBoundedStringArray(value.evidence, 3, MAX_ANALYSIS_TEXT_LENGTH)
    && isFiniteNumber(value.confidence) && value.confidence >= 0 && value.confidence <= 1;
}

function isValidAction(value: unknown): value is LearningAnalysis["recommendedActions"][number] {
  if (!isRecord(value) || !hasExactKeys(value, ["action", "wordIds", "priority", "questionCount", "reason"])) return false;
  return isActionType(value.action) && isBoundedStringArray(value.wordIds, 3) && isFiniteNumber(value.priority)
    && value.priority >= 0 && value.priority <= 1 && isFiniteNumber(value.questionCount)
    && Number.isInteger(value.questionCount)
    && value.questionCount >= 1 && value.questionCount <= 20
    && isNonEmptyBoundedString(value.reason, MAX_ANALYSIS_TEXT_LENGTH);
}

function normalizeAnalysis(value: LearningAnalysis): LearningAnalysis {
  return {
    overallStatus: value.overallStatus,
    findings: value.findings.slice(0, 3).map((finding) => ({ ...finding, confidence: clamp(finding.confidence, 0, 1) })),
    recommendedActions: value.recommendedActions.slice(0, 1).map((action) => ({
      ...action,
      priority: clamp(action.priority, 0, 1),
      questionCount: Math.max(1, Math.min(20, Math.round(action.questionCount))),
    })),
  };
}

function toAction(signal: LearningSignal): LearningAnalysis["recommendedActions"][number] {
  const action: LearningActionType = signal.type === "slow_recall"
    ? "reading_quiz"
    : signal.type === "word_confusion" ? "contrast_quiz"
      : signal.type === "review_overload" ? "reduce_new_cards"
        : signal.type === "hint_dependency" ? "context_sentence"
          : "contrast_quiz";
  return {
    action,
    wordIds: signal.wordIds,
    priority: clamp(signal.confidence, 0, 1),
    questionCount: Math.min(5, Math.max(1, signal.wordIds.length)),
    reason: signal.reason,
  };
}

function compareWeakItems(a: WeakLearningItem, b: WeakLearningItem): number {
  return a.retention30d - b.retention30d
    || b.hintRate - a.hintRate
    || b.averageResponseMs - a.averageResponseMs
    || a.wordId.localeCompare(b.wordId)
    || a.skill.localeCompare(b.skill);
}

function compareSignals(a: LearningSignal, b: LearningSignal): number {
  return b.confidence - a.confidence || a.type.localeCompare(b.type) || a.wordIds.join(",").localeCompare(b.wordIds.join(","));
}

function confidence(reviewCount: number, minimum: number): number {
  return clamp(reviewCount / Math.max(minimum, 5), 0, 1);
}

function getPeriodReviewCount(item: WeakLearningItem): number {
  return Number.isFinite(item.periodReviewCount) ? item.periodReviewCount : Math.max(0, item.reviewCount ?? 0);
}

function getDefaultContextVersions(input: LearningAnalysisInput): LearningAnalysisContextVersions {
  const parsedEnd = Date.parse(input.periodEnd);
  const analysisDay = Number.isFinite(parsedEnd)
    ? new Date(parsedEnd).toISOString().slice(0, 10)
    : input.periodEnd.slice(0, 10);
  return {
    promptVersion: "learning-v2",
    schemaVersion: "analysis-v1",
    thresholdVersion: "thresholds-v1",
    analysisDay,
    efficiencyPolicyVersion: "efficiency-v1",
    model: "default",
  };
}

function percent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isValidDuration(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isNonEmptyBoundedString(value: unknown, maxLength: number): value is string {
  return isBoundedString(value, maxLength) && value.trim().length > 0;
}

function isBoundedStringArray(value: unknown, maxItems: number, maxLength?: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => typeof item === "string" && (maxLength === undefined || item.length <= maxLength));
}

function isNonEmptyBoundedStringArray(value: unknown, maxItems: number, maxLength?: number): value is string[] {
  return isBoundedStringArray(value, maxItems, maxLength)
    && value.every((item) => item.trim().length > 0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFindingType(value: unknown): value is LearningFindingType {
  return value === "weak_retention" || value === "hint_dependency" || value === "slow_recall"
    || value === "word_confusion" || value === "review_overload" || value === "insufficient_evidence";
}

function isActionType(value: unknown): value is LearningActionType {
  return value === "contrast_quiz" || value === "reading_quiz" || value === "context_sentence"
    || value === "audio_quiz" || value === "reduce_new_cards" || value === "maintain_new_cards";
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function safeLimit(value: number, fallback: number): number {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function isLearningAnalysisAgentContext(value: LearningAnalysisInput | LearningAnalysisAgentContext): value is LearningAnalysisAgentContext {
  return isRecord(value) && "input" in value && "baseline" in value && "versions" in value;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256Text(value: string): string {
  const source = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const message = new Uint8Array(paddedLength);
  message.set(source);
  message[source.length] = 0x80;
  const view = new DataView(message.buffer);
  const bitLength = source.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const roundConstants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let offset = 0; offset < message.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + roundConstants[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      [a, b, c, d, e, f, g, h] = [(temp1 + temp2) >>> 0, a, b, c, (d + temp1) >>> 0, e, f, g];
    }
    hash = hash.map((value, index) => (value + [a, b, c, d, e, f, g, h][index]) >>> 0);
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
