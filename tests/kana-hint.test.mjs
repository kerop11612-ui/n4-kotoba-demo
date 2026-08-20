import test from "node:test";
import assert from "node:assert/strict";
import { getKanaHint } from "../src/spaced-repetition/kana-hint.ts";

test("kana hint keeps contracted sounds together", () => {
  assert.equal(getKanaHint("やくそく", 1), "や");
  assert.equal(getKanaHint("やくそく", 2), "やく");
  assert.equal(getKanaHint("きょう", 1), "きょ");
  assert.equal(getKanaHint("きょう", 2), "きょ");
});

test("kana hint never exposes the whole short answer", () => {
  assert.equal(getKanaHint("うえ", 2), "う");
  assert.equal(getKanaHint("め", 1), "");
});
