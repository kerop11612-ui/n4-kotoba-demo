import type { VocabularyWord } from "./types.ts";

export function selectUnitWords(
  words: VocabularyWord[],
  chapterNumber: number,
  sectionNumber: number,
): VocabularyWord[] {
  return words.filter((word) =>
    word.chapterNumber === chapterNumber && word.sectionNumber === sectionNumber,
  );
}

export function searchVocabulary(words: VocabularyWord[], query: string): VocabularyWord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return words;

  return words.filter((word) => [
    word.word,
    word.reading,
    word.meaningZhTw,
    word.exampleZhTw,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
}
