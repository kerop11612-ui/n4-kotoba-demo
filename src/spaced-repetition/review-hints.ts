import type { HintKind, HintLevel, ReviewFormat } from "./types.ts";

export type ReviewHintState = {
  level: HintLevel;
  kinds: HintKind[];
  answerVisible: boolean;
};

export function nextReviewHint(
  format: ReviewFormat,
  state: ReviewHintState,
  options: { hasSecondKana: boolean; hasAudio: boolean; clozeAttempts: number },
): ReviewHintState {
  if (format === "cloze") {
    if (options.clozeAttempts >= 2) return { ...state, level: 3, answerVisible: true };
    if (options.clozeAttempts < 1) return state;
    const kind: HintKind = state.level === 0 ? "kana-1" : options.hasSecondKana ? "kana-2" : "audio";
    if (state.kinds.includes(kind)) return state;
    return { ...state, level: Math.min(2, state.level + 1) as HintLevel, kinds: [...state.kinds, kind] };
  }
  if (format === "jp-to-zh") {
    const ladder: HintKind[] = ["sentence-cloze", "sentence-full"];
    const index = Math.min(ladder.length, state.kinds.length);
    if (index >= ladder.length) return { ...state, level: 3, answerVisible: true };
    return { ...state, level: (index + 1) as HintLevel, kinds: [...state.kinds, ladder[index]] };
  }
  const ladder: HintKind[] = ["length", "kana-1"];
  if (options.hasSecondKana) ladder.push("kana-2");
  else if (options.hasAudio) ladder.push("audio");
  const index = Math.min(ladder.length, state.kinds.length);
  if (index >= ladder.length) return { ...state, level: 4, answerVisible: true };
  return { ...state, level: (index + 1) as HintLevel, kinds: [...state.kinds, ladder[index]] };
}
