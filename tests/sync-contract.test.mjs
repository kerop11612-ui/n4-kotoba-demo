import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("learning_events migration is owner-scoped and append-only", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608200001_create_learning_events.sql", import.meta.url), "utf8");
  assert.match(sql, /primary key \(user_id, event_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\) = user_id/i);
  assert.match(sql, /for select/i);
  assert.match(sql, /for insert/i);
  assert.match(sql, /for delete/i);
  assert.doesNotMatch(sql, /for update/i);
});
