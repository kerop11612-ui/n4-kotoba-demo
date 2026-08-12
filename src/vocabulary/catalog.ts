import type { VocabularyIndexItem } from "./types.ts";

export type VocabularySection = {
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
  wordCount: number;
};

export type VocabularyChapter = {
  number: number;
  title: string;
  words: number;
  sections: VocabularySection[];
};

export function getUnitId(chapterNumber: number, sectionNumber: number): string {
  return `n4-${chapterNumber}-${sectionNumber}`;
}

export function buildVocabularySections(words: VocabularyIndexItem[]): VocabularySection[] {
  const sections = new Map<string, VocabularySection>();
  for (const word of words) {
    const key = `${word.chapterNumber}-${word.sectionNumber}`;
    const section = sections.get(key);
    if (section) {
      section.wordCount += 1;
    } else {
      sections.set(key, {
        chapterNumber: word.chapterNumber,
        chapterTitle: word.chapterTitle,
        sectionNumber: word.sectionNumber,
        sectionTitle: word.sectionTitle,
        wordCount: 1,
      });
    }
  }
  return [...sections.values()].sort((a, b) =>
    a.chapterNumber - b.chapterNumber || a.sectionNumber - b.sectionNumber,
  );
}

export function buildVocabularyChapters(words: VocabularyIndexItem[]): VocabularyChapter[] {
  const chapters = new Map<number, VocabularyChapter>();
  for (const word of words) {
    const chapter = chapters.get(word.chapterNumber) ?? {
      number: word.chapterNumber,
      title: word.chapterTitle,
      words: 0,
      sections: [],
    };
    chapter.words += 1;
    const section = chapter.sections.find((item) => item.sectionNumber === word.sectionNumber);
    if (section) {
      section.wordCount += 1;
    } else {
      chapter.sections.push({
        chapterNumber: word.chapterNumber,
        chapterTitle: word.chapterTitle,
        sectionNumber: word.sectionNumber,
        sectionTitle: word.sectionTitle,
        wordCount: 1,
      });
    }
    chapters.set(word.chapterNumber, chapter);
  }
  return [...chapters.values()]
    .map((chapter) => ({
      ...chapter,
      sections: chapter.sections.sort((a, b) => a.sectionNumber - b.sectionNumber),
    }))
    .sort((a, b) => a.number - b.number);
}
