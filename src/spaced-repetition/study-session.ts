import type { ReviewFormat, ReviewRating, UnitStats, WordMemoryRecord } from "./types.ts";
import type { VocabularyChapter } from "../vocabulary/catalog.ts";
import type { VocabularyIndexItem } from "../vocabulary/types.ts";

const DEFAULT_SECONDS_PER_REVIEW = 15;

export function estimateReviewMinutes(
  remainingItems: number,
  secondsPerReview = DEFAULT_SECONDS_PER_REVIEW,
): number {
  if (!Number.isFinite(remainingItems) || remainingItems <= 0) return 0;
  const safeSeconds = Number.isFinite(secondsPerReview) && secondsPerReview > 0
    ? secondsPerReview
    : DEFAULT_SECONDS_PER_REVIEW;
  return Math.max(1, Math.ceil((Math.floor(remainingItems) * safeSeconds) / 60));
}

export type ReviewShortcut = "reveal" | "hint" | ReviewRating;

export type StudyDashboard = {
  reviewedWords: number;
  dueToday: number;
  weakWords: number;
  suggestedNewWords: number;
  estimatedMinutes: number;
};

export type StudyOverview = {
  dashboard: StudyDashboard;
  chapterProgress: Record<number, number>;
  recommendedUnit: { chapter: number; section: number } | null;
};

export type LearningRecommendationAction =
  | "weak_practice"
  | "due_review"
  | "reduce_new_cards"
  | "learn_new"
  | "gather_evidence";

export type LearningRecommendationViewModel = {
  title: string;
  reason: string;
  action: LearningRecommendationAction;
  evidenceLabel: string;
  confidencePercent: number | null;
};

export function buildHomeRecommendation(
  overview: Pick<StudyOverview, "dashboard">,
): LearningRecommendationViewModel {
  const dashboard = overview.dashboard;
  if (dashboard.dueToday > 100) {
    return {
      title: "先降低複習負擔",
      reason: `目前有 ${dashboard.dueToday} 個到期單字，先完成到期複習並暫停新增。`,
      action: "reduce_new_cards",
      evidenceLabel: `到期 ${dashboard.dueToday} 個`,
      confidencePercent: 100,
    };
  }
  if (dashboard.dueToday > 0) {
    return {
      title: "先完成今天到期的複習",
      reason: `有 ${dashboard.dueToday} 個單字已到期，先處理它們可以維持複習節奏。`,
      action: "due_review",
      evidenceLabel: `到期 ${dashboard.dueToday} 個`,
      confidencePercent: 100,
    };
  }
  if (dashboard.weakWords > 0) {
    return {
      title: "安排一輪弱項複習",
      reason: `目前有 ${dashboard.weakWords} 個弱項，先複習熟悉度較低的單字。`,
      action: "weak_practice",
      evidenceLabel: `弱項 ${dashboard.weakWords} 個`,
      confidencePercent: dashboard.reviewedWords >= 3 ? 100 : null,
    };
  }
  if (dashboard.suggestedNewWords > 0) {
    return {
      title: "今天可以學幾個新字",
      reason: `複習負擔正常，建議新增 ${dashboard.suggestedNewWords} 個單字。`,
      action: "learn_new",
      evidenceLabel: `建議新字 ${dashboard.suggestedNewWords} 個`,
      confidencePercent: dashboard.reviewedWords >= 3 ? 100 : null,
    };
  }
  return {
    title: "再累積幾次複習",
    reason: "目前還沒有足夠的近期資料建立更精準的學習建議。",
    action: "gather_evidence",
    evidenceLabel: "資料不足",
    confidencePercent: null,
  };
}

export function buildUnitRecommendation(
  input: { stats: UnitStats },
): LearningRecommendationViewModel {
  const { stats } = input;
  const confidencePercent = stats.reviewCount >= 3 ? Math.min(100, Math.round((stats.reviewCount / 3) * 100)) : null;
  if (stats.priorityReviewWords > 0 && stats.reviewCount >= 3) {
    return {
      title: "先練習目前最需要再看的單字",
      reason: `本單元有 ${stats.priorityReviewWords} 個單字的目前記憶率偏低，先做一輪聚焦複習。`,
      action: "weak_practice",
      evidenceLabel: `優先複習 ${stats.priorityReviewWords} 個・共 ${stats.reviewCount} 次複習`,
      confidencePercent,
    };
  }
  if (stats.dueToday > 0) {
    return {
      title: "先完成本單元到期複習",
      reason: `本單元有 ${stats.dueToday} 個單字已到期，先完成它們再新增內容。`,
      action: "due_review",
      evidenceLabel: `到期 ${stats.dueToday} 個`,
      confidencePercent,
    };
  }
  if (stats.coveragePercent < 100) {
    return {
      title: "繼續學習本單元的新字",
      reason: `目前已學習 ${stats.coveragePercent}% 的單字，可以繼續往下完成本單元。`,
      action: "learn_new",
      evidenceLabel: `單元完成度 ${stats.coveragePercent}%`,
      confidencePercent,
    };
  }
  return {
    title: "再累積幾次複習",
    reason: "本單元目前沒有明確的優先項目，再累積幾次複習後會有更可靠的建議。",
    action: "gather_evidence",
    evidenceLabel: stats.reviewCount ? `目前 ${stats.reviewCount} 次複習` : "資料不足",
    confidencePercent,
  };
}

export function buildStudyDashboard(
  memories: WordMemoryRecord[],
  totalWords: number,
  now = new Date(),
  newWordLimit = 5,
): StudyDashboard {
  const learned = new Map<string, WordMemoryRecord>();
  for (const memory of memories) {
    if (memory.skill !== "jp_to_meaning" || memory.reviewCount <= 0) continue;
    const previous = learned.get(memory.wordId);
    if (!previous || Date.parse(memory.updatedAt) >= Date.parse(previous.updatedAt)) {
      learned.set(memory.wordId, memory);
    }
  }

  const dueWordIds = new Set<string>();
  const weakWordIds = new Set<string>();
  for (const memory of learned.values()) {
    const dueAt = Date.parse(memory.fsrsCard.due);
    if (Number.isFinite(dueAt) && dueAt <= now.getTime()) dueWordIds.add(memory.wordId);
    const independentRate = memory.reviewCount > 0
      ? memory.independentCorrectCount / memory.reviewCount
      : 0;
    if (memory.lapseCount >= 2 || (memory.reviewCount >= 3 && independentRate < 0.6)) {
      weakWordIds.add(memory.wordId);
    }
  }

  const availableNewWords = Math.max(0, Math.floor(totalWords) - learned.size);
  const suggestedNewWords = Math.min(
    Math.max(0, Math.floor(newWordLimit)),
    availableNewWords,
  );
  const focusedWordIds = new Set([...dueWordIds, ...weakWordIds]);

  return {
    reviewedWords: learned.size,
    dueToday: dueWordIds.size,
    weakWords: weakWordIds.size,
    suggestedNewWords,
    estimatedMinutes: estimateReviewMinutes(focusedWordIds.size + suggestedNewWords),
  };
}

/**
 * 組合首頁需要的學習摘要。
 *
 * 保持為純函式，讓首頁只負責載入資料與呈現 UI；章節進度、今日摘要
 * 與推薦單元的規則可以獨立測試，也能被其他入口重用。
 */
export function buildStudyOverview(
  memories: WordMemoryRecord[],
  words: VocabularyIndexItem[],
  chapters: VocabularyChapter[],
  now = new Date(),
  totalWords = words.length,
  newWordLimit = 5,
): StudyOverview {
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const learnedWordIdsByChapter = new Map<number, Set<string>>();

  for (const memory of memories) {
    if (memory.skill !== "jp_to_meaning" || memory.reviewCount <= 0) continue;
    const word = wordsById.get(memory.wordId);
    if (!word) continue;
    const learnedWordIds = learnedWordIdsByChapter.get(word.chapterNumber) ?? new Set<string>();
    learnedWordIds.add(word.id);
    learnedWordIdsByChapter.set(word.chapterNumber, learnedWordIds);
  }

  const chapterProgress: Record<number, number> = {};
  for (const chapter of chapters) {
    const reviewedWordIds = learnedWordIdsByChapter.get(chapter.number) ?? new Set<string>();
    chapterProgress[chapter.number] = chapter.words
      ? Math.min(100, Math.round((reviewedWordIds.size / chapter.words) * 100))
      : 0;
  }

  const reviewedMemories = memories.filter(
    (memory) => memory.skill === "jp_to_meaning" && memory.reviewCount > 0,
  );
  const recommendedMemory = reviewedMemories
    .slice()
    .sort((a, b) => Date.parse(a.fsrsCard.due) - Date.parse(b.fsrsCard.due))[0];
  const unitMatch = recommendedMemory?.unitId.match(/^n4-(\d+)-(\d+)$/);

  return {
    dashboard: buildStudyDashboard(memories, totalWords, now, newWordLimit),
    chapterProgress,
    recommendedUnit: unitMatch
      ? { chapter: Number(unitMatch[1]), section: Number(unitMatch[2]) }
      : null,
  };
}

type ReviewShortcutContext = {
  reviewFormat: ReviewFormat;
  answerVisible: boolean;
};

const ratingByCode: Partial<Record<string, ReviewRating>> = {
  Digit1: "again",
  Numpad1: "again",
  Digit2: "hard",
  Numpad2: "hard",
  Digit3: "good",
  Numpad3: "good",
  Digit4: "easy",
  Numpad4: "easy",
};

export function resolveReviewShortcut(
  code: string,
  context: ReviewShortcutContext,
): ReviewShortcut | null {
  if (context.answerVisible) return ratingByCode[code] ?? null;
  if (code === "Space" && context.reviewFormat !== "cloze") return "reveal";
  if (code === "KeyH" && context.reviewFormat === "jp-to-zh") return "hint";
  return null;
}
