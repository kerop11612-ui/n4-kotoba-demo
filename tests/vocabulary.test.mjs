import test from "node:test";
import assert from "node:assert/strict";
import { parseVocabulary } from "../src/vocabulary/parser.ts";
import { buildVocabularyIndex, selectVocabularyUnit } from "../src/vocabulary/index-builder.ts";
import { parseVocabularyIndex } from "../src/vocabulary/parser.ts";
import { buildVocabularyChapters, buildVocabularySections, getUnitId } from "../src/vocabulary/catalog.ts";
import { searchVocabulary, selectUnitWords } from "../src/vocabulary/selectors.ts";
import { FAVORITES_STORAGE_KEY, readFavoriteIds, writeFavoriteIds } from "../src/storage/favorites.ts";

const word = (overrides = {}) => ({
  id: "n4-0001",
  number: 1,
  chapterNumber: 1,
  chapterTitle: "第一章",
  sectionNumber: 1,
  sectionTitle: "第一節",
  word: "電車",
  reading: "でんしゃ",
  partOfSpeech: "名詞",
  meaningZhTw: "電車",
  example: "電車に乗ります。",
  exampleZhTw: "搭電車。",
  wordAudio: "/audio/word.mp3",
  sentenceAudio: "/audio/sentence.mp3",
  ...overrides,
});

test("vocabulary parser validates required fields and unique IDs", () => {
  assert.equal(parseVocabulary([word()]).length, 1);
  assert.throws(() => parseVocabulary([{ ...word(), meaningZhTw: 123 }]), /詞庫資料格式無效/);
  assert.throws(() => parseVocabulary([word(), word()]), /詞庫 ID 重複/);
});

test("vocabulary index keeps only catalog fields and validates its shape", () => {
  const words = [
    word(),
    word({ id: "n4-0102", number: 2, sectionNumber: 2 }),
    word({ id: "n4-0201", number: 3, chapterNumber: 2 }),
  ];
  const index = buildVocabularyIndex(words);

  assert.equal(index.totalWords, 3);
  assert.deepEqual(Object.keys(index.items[0]).sort(), [
    "chapterNumber",
    "chapterTitle",
    "id",
    "number",
    "sectionNumber",
    "sectionTitle",
  ]);
  assert.deepEqual(parseVocabularyIndex(index), index);
  assert.throws(() => parseVocabularyIndex({ ...index, totalWords: 2 }));
  assert.throws(() => parseVocabularyIndex({
    ...index,
    items: [...index.items, index.items[0]],
    totalWords: 4,
  }));
  assert.deepEqual(selectVocabularyUnit(words, "n4-1-2").map((item) => item.id), ["n4-0102"]);
  assert.deepEqual(selectVocabularyUnit(words, "invalid").map((item) => item.id), []);
});

test("vocabulary catalog groups and sorts chapters and sections", () => {
  const words = [
    word({ id: "n4-0201", chapterNumber: 2, chapterTitle: "第二章", sectionNumber: 1, sectionTitle: "二之一" }),
    word({ id: "n4-0102", number: 2, sectionNumber: 2, sectionTitle: "一之二" }),
    word({ id: "n4-0101", number: 3 }),
  ];
  const sections = buildVocabularySections(words);
  const chapters = buildVocabularyChapters(words);
  assert.deepEqual(sections.map((section) => `${section.chapterNumber}-${section.sectionNumber}`), ["1-1", "1-2", "2-1"]);
  assert.equal(chapters[0].words, 2);
  assert.equal(chapters[0].sections[0].wordCount, 1);
  assert.equal(chapters[0].sections[1].wordCount, 1);
  assert.equal(getUnitId(2, 3), "n4-2-3");
});

test("favorite storage safely reads and writes IDs", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  writeFavoriteIds(new Set(["n4-0001", "n4-0002"]), storage);
  assert.deepEqual([...readFavoriteIds(storage)], ["n4-0001", "n4-0002"]);
  values.set(FAVORITES_STORAGE_KEY, "not-json");
  assert.deepEqual([...readFavoriteIds(storage)], []);
});

test("vocabulary selectors share unit and search rules", () => {
  const words = [
    word({ id: "n4-0101", word: "電車", chapterNumber: 1, sectionNumber: 1 }),
    word({ id: "n4-0102", word: "旅行", meaningZhTw: "旅遊", exampleZhTw: "去旅行。", chapterNumber: 1, sectionNumber: 2 }),
    word({ id: "n4-0201", word: "電気", chapterNumber: 2, sectionNumber: 1 }),
  ];

  assert.deepEqual(selectUnitWords(words, 1, 1).map((item) => item.id), ["n4-0101"]);
  assert.deepEqual(searchVocabulary(words, "電").map((item) => item.id), ["n4-0101", "n4-0201"]);
  assert.equal(searchVocabulary(words, "").length, 3);
});
