import vocabularyData from "../../../../public/vocabulary-n4.json";
import { buildVocabularyIndex } from "../../../../src/vocabulary/index-builder";
import { parseVocabulary } from "../../../../src/vocabulary/parser";

export const dynamic = "force-static";

export function GET() {
  const index = buildVocabularyIndex(parseVocabulary(vocabularyData));
  return Response.json(index, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
