export interface ClozeResult {
  text: string;
  replaced: boolean;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createClozeSentence(
  sentence: string,
  targets: string[],
): ClozeResult {
  const usableTargets = [...new Set(targets)]
    .filter((target) => target.trim().length > 0)
    .sort((a, b) => b.length - a.length);
  if (!usableTargets.length) return { text: sentence, replaced: false };

  const matcher = new RegExp(usableTargets.map(escapeRegExp).join("|"), "u");
  const match = matcher.exec(sentence);
  if (match && match.index >= 0) {
    return {
      text:
        sentence.slice(0, match.index) +
        "＿＿＿" +
        sentence.slice(match.index + match[0].length),
      replaced: true,
    };
  }

  // Examples store furigana as 漢字[かんじ]. Search visible text while
  // replacing the corresponding source range so other ruby remains.
  const mapped = mapRubySource(sentence);
  const visible = mapped.map((item) => item.char).join("");
  const visibleTarget = usableTargets.find((target) => visible.includes(target));
  if (!visibleTarget) return { text: sentence, replaced: false };
  const visibleIndex = visible.indexOf(visibleTarget);
  const sourceStart = mapped[visibleIndex]?.sourceStart;
  const sourceEnd = mapped[visibleIndex + Array.from(visibleTarget).length - 1]?.sourceEnd;
  if (sourceStart === undefined || sourceEnd === undefined) {
    return { text: sentence, replaced: false };
  }

  return {
    text: sentence.slice(0, sourceStart) + "＿＿＿" + sentence.slice(sourceEnd),
    replaced: true,
  };
}

function mapRubySource(sentence: string) {
  const mapped: Array<{ char: string; sourceStart: number; sourceEnd: number }> = [];
  const ruby = /([^\[\]\n]+)\[([^\[\]\n]+)\]/gu;
  let cursor = 0;

  const appendPlain = (text: string, sourceStart: number) => {
    let offset = 0;
    for (const char of Array.from(text)) {
      mapped.push({ char, sourceStart: sourceStart + offset, sourceEnd: sourceStart + offset + char.length });
      offset += char.length;
    }
  };

  for (const match of sentence.matchAll(ruby)) {
    const index = match.index ?? 0;
    appendPlain(sentence.slice(cursor, index), cursor);
    let offset = 0;
    const baseChars = Array.from(match[1]);
    const sourceEnd = index + match[0].length;
    for (const [baseIndex, char] of baseChars.entries()) {
      const start = index + offset;
      mapped.push({
        char,
        sourceStart: start,
        sourceEnd: baseIndex === baseChars.length - 1 ? sourceEnd : start + char.length,
      });
      offset += char.length;
    }
    cursor = sourceEnd;
  }
  appendPlain(sentence.slice(cursor), cursor);
  return mapped;
}

