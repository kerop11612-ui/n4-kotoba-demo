export type PrintMode = "practice" | "study" | "answers";
export type PrintLayout = "two-column" | "single-column";
export type PracticeDirection = "ja-to-zh" | "zh-to-ja" | "both";
export type QuestionCount = 10 | 20 | "all";

const TWO_COLUMN_CAPACITY = 34;
const SINGLE_COLUMN_CAPACITY = 17;

export function selectQuestionWords<T>(words: T[], count: QuestionCount = 20): T[] {
  return count === "all" ? words : words.slice(0, count);
}

export function chunkWords<T>(words: T[], size: number): T[][] {
  if (size <= 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size));
  }
  return chunks;
}

export function getPrintPageCount({
  mode,
  direction = "ja-to-zh",
  wordCount,
  layout,
  includeAnswerKey = true,
}: {
  mode: PrintMode;
  direction?: PracticeDirection;
  wordCount: number;
  layout: PrintLayout;
  includeAnswerKey?: boolean;
}): number {
  if (wordCount <= 0) return 0;
  const capacity = layout === "two-column" ? TWO_COLUMN_CAPACITY : SINGLE_COLUMN_CAPACITY;
  const listPages = Math.ceil(wordCount / capacity);

  if (mode === "practice") {
    const directionCount = direction === "both" ? 2 : 1;
    return listPages * directionCount + (includeAnswerKey ? listPages : 0);
  }

  return listPages;
}
