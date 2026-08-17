import { parseVocabulary, parseVocabularyIndex } from "./parser.ts";
import type { VocabularyIndex, VocabularyWord } from "./types.ts";

const VOCABULARY_INDEX_URL = "/api/vocabulary/index";
const VOCABULARY_UNIT_URL = (unitId: string) => `/api/vocabulary/unit/${encodeURIComponent(unitId)}`;
const unitPromises = new Map<string, Promise<VocabularyWord[]>>();
let vocabularyIndexPromise: Promise<VocabularyIndex> | null = null;
let vocabularyPromise: Promise<VocabularyWord[]> | null = null;

export function loadVocabularyIndex(): Promise<VocabularyIndex> {
  vocabularyIndexPromise ??= fetch(VOCABULARY_INDEX_URL, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("詞庫載入失敗");
      return response.json() as Promise<unknown>;
    })
    .then(parseVocabularyIndex);
  return vocabularyIndexPromise;
}

export function loadVocabularyUnit(unitId: string): Promise<VocabularyWord[]> {
  const cached = unitPromises.get(unitId);
  if (cached) return cached;
  const promise = fetch(VOCABULARY_UNIT_URL(unitId), { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("單元詞庫載入失敗");
      return response.json() as Promise<unknown>;
    })
    .then((value) => {
      if (!isRecord(value) || value.unitId !== unitId || !Array.isArray(value.words)) {
        throw new Error("單元詞庫格式無效");
      }
      return parseVocabulary(value.words);
    });
  unitPromises.set(unitId, promise);
  return promise;
}

export function loadVocabularyUnits(unitIds: string[]): Promise<VocabularyWord[]> {
  return Promise.all([...new Set(unitIds)].map(loadVocabularyUnit)).then((groups) => groups.flat());
}

/** Compatibility loader for callers that explicitly need the complete vocabulary. */
export function loadVocabulary(): Promise<VocabularyWord[]> {
  vocabularyPromise ??= loadVocabularyIndex()
    .then((index) => [...new Set(index.items.map((item) => `n4-${item.chapterNumber}-${item.sectionNumber}`))])
    .then(loadVocabularyUnits);
  return vocabularyPromise;
}

export function clearVocabularyCache(): void {
  vocabularyIndexPromise = null;
  unitPromises.clear();
  vocabularyPromise = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
