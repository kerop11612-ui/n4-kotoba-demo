import { getUnitId } from "./catalog.ts";
import type { VocabularyIndex, VocabularyWord } from "./types.ts";

export function buildVocabularyIndex(words: VocabularyWord[]): VocabularyIndex {
  return {
    totalWords: words.length,
    items: words.map(({ id, number, chapterNumber, chapterTitle, sectionNumber, sectionTitle }) => ({
      id,
      number,
      chapterNumber,
      chapterTitle,
      sectionNumber,
      sectionTitle,
    })),
  };
}

export function selectVocabularyUnit(words: VocabularyWord[], unitId: string): VocabularyWord[] {
  const match = /^n4-(\d+)-(\d+)$/.exec(unitId);
  if (!match) return [];
  const chapterNumber = Number(match[1]);
  const sectionNumber = Number(match[2]);
  return words.filter((word) =>
    getUnitId(word.chapterNumber, word.sectionNumber) === getUnitId(chapterNumber, sectionNumber),
  );
}
