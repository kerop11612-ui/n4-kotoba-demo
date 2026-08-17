export type VocabularyWord = {
  id: string;
  number: number;
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
  word: string;
  reading: string;
  partOfSpeech: string;
  meaningZhTw: string;
  example: string;
  exampleZhTw: string;
  wordAudio: string;
  sentenceAudio: string;
};

export type VocabularyIndexItem = Pick<
  VocabularyWord,
  "id" | "number" | "chapterNumber" | "chapterTitle" | "sectionNumber" | "sectionTitle"
>;

export type VocabularyIndex = {
  totalWords: number;
  items: VocabularyIndexItem[];
};
