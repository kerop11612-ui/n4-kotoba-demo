import type { VocabularyIndex, VocabularyIndexItem, VocabularyWord } from "./types.ts";

const REQUIRED_STRING_FIELDS = [
  "id",
  "chapterTitle",
  "sectionTitle",
  "word",
  "reading",
  "partOfSpeech",
  "meaningZhTw",
  "example",
  "exampleZhTw",
  "wordAudio",
  "sentenceAudio",
] as const;

const REQUIRED_NUMBER_FIELDS = [
  "number",
  "chapterNumber",
  "sectionNumber",
] as const;

const REQUIRED_INDEX_STRING_FIELDS = ["id", "chapterTitle", "sectionTitle"] as const;
const REQUIRED_INDEX_NUMBER_FIELDS = ["number", "chapterNumber", "sectionNumber"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isVocabularyWord(value: unknown): value is VocabularyWord {
  if (!isRecord(value)) return false;
  if (!REQUIRED_STRING_FIELDS.every((field) => typeof value[field] === "string")) return false;
  return REQUIRED_NUMBER_FIELDS.every((field) => Number.isInteger(value[field]) && Number(value[field]) > 0);
}

export function parseVocabulary(value: unknown): VocabularyWord[] {
  if (!Array.isArray(value) || !value.every(isVocabularyWord)) {
    throw new Error("詞庫資料格式無效");
  }

  const ids = new Set<string>();
  for (const word of value) {
    if (ids.has(word.id)) throw new Error(`詞庫 ID 重複: ${word.id}`);
    ids.add(word.id);
  }
  return value;
}

export function parseVocabularyIndex(value: unknown): VocabularyIndex {
  if (!isRecord(value) || !Number.isInteger(value.totalWords) || !Array.isArray(value.items)) {
    throw new Error("詞庫索引格式無效");
  }
  if (value.totalWords !== value.items.length || !value.items.every(isVocabularyIndexItem)) {
    throw new Error("詞庫索引格式無效");
  }

  const ids = new Set<string>();
  for (const item of value.items) {
    if (ids.has(item.id)) throw new Error(`詞庫索引 ID 重複: ${item.id}`);
    ids.add(item.id);
  }
  return { totalWords: value.totalWords, items: value.items };
}

function isVocabularyIndexItem(value: unknown): value is VocabularyIndexItem {
  if (!isRecord(value)) return false;
  if (!REQUIRED_INDEX_STRING_FIELDS.every((field) => typeof value[field] === "string")) return false;
  return REQUIRED_INDEX_NUMBER_FIELDS.every((field) => Number.isInteger(value[field]) && Number(value[field]) > 0);
}
