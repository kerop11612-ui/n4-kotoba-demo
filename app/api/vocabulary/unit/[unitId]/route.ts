import vocabularyData from "../../../../../public/vocabulary-n4.json";
import { parseVocabulary } from "../../../../../src/vocabulary/parser";
import { selectVocabularyUnit } from "../../../../../src/vocabulary/index-builder";

const vocabulary = parseVocabulary(vocabularyData);
const unitIds = [...new Set(vocabulary.map((word) => `n4-${word.chapterNumber}-${word.sectionNumber}`))];

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return unitIds.map((unitId) => ({ unitId }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ unitId: string }> },
) {
  const { unitId } = await context.params;
  const words = selectVocabularyUnit(vocabulary, unitId);
  if (!words.length) return Response.json({ error: "單元不存在" }, { status: 404 });
  return Response.json(
    { unitId, words },
    { headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
