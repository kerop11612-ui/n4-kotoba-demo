const COMBINING_KANA = new Set([
  "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゃ", "ゅ", "ょ", "ゎ",
  "ゕ", "ゖ", "゙", "゚",
]);

function splitKanaUnits(reading: string): string[] {
  const units: string[] = [];
  for (const character of Array.from(reading.trim())) {
    if (units.length > 0 && COMBINING_KANA.has(character)) {
      units[units.length - 1] += character;
    } else {
      units.push(character);
    }
  }
  return units;
}

/** Returns a safe prefix while leaving at least one kana unit for recall. */
export function getKanaHint(reading: string, requestedUnits: number): string {
  const units = splitKanaUnits(reading);
  if (units.length <= 1) return "";
  const count = Math.min(
    Math.max(1, Math.floor(requestedUnits)),
    units.length - 1,
  );
  return units.slice(0, count).join("");
}
