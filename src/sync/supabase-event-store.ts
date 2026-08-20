import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudEventRow, CloudEventStore } from "./cloud-event-store.ts";
import type { LearningEvent } from "./learning-events.ts";

const EVENT_TYPES = new Set(["review", "manual_mastery", "memory_snapshot"]);
const SKILLS = new Set(["jp_to_meaning", "meaning_to_jp", "kanji_to_reading", "audio_to_meaning", "context_to_word"]);

export class SupabaseEventStore implements CloudEventStore {
  constructor(private readonly client: SupabaseClient) {}

  async upload(userId: string, events: LearningEvent[]): Promise<void> {
    if (!events.length) return;
    const rows = events.map((event) => ({
      user_id: userId,
      event_id: event.id,
      device_id: event.deviceId,
      event_type: event.type,
      word_id: event.wordId,
      unit_id: event.unitId,
      skill: event.skill,
      occurred_at: event.occurredAt,
      payload: event.payload,
    }));
    const { error } = await this.client
      .from("learning_events")
      .upsert(rows, { onConflict: "user_id,event_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  async pull(userId: string, afterSeq: number, limit: number): Promise<CloudEventRow[]> {
    const { data, error } = await this.client
      .from("learning_events")
      .select("event_id, device_id, event_type, word_id, unit_id, skill, occurred_at, payload, server_seq")
      .eq("user_id", userId)
      .gt("server_seq", afterSeq)
      .order("server_seq", { ascending: true })
      .limit(limit);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Supabase 學習事件格式無效");
    return data.map((row) => ({
      event: parseCloudEvent(row),
      serverSeq: parseServerSeq(row.server_seq),
    }));
  }

  async clear(userId: string): Promise<void> {
    const { error } = await this.client.from("learning_events").delete().eq("user_id", userId);
    if (error) throw error;
  }
}

function parseCloudEvent(value: unknown): LearningEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Supabase 學習事件格式無效");
  const row = value as Record<string, unknown>;
  if (typeof row.event_id !== "string" || typeof row.device_id !== "string"
    || typeof row.event_type !== "string" || !EVENT_TYPES.has(row.event_type)
    || typeof row.word_id !== "string" || typeof row.unit_id !== "string"
    || typeof row.skill !== "string" || !SKILLS.has(row.skill)
    || typeof row.occurred_at !== "string" || !Number.isFinite(Date.parse(row.occurred_at))
    || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
    throw new Error("Supabase 學習事件格式無效");
  }
  return {
    version: 1,
    id: row.event_id,
    deviceId: row.device_id,
    type: row.event_type as LearningEvent["type"],
    wordId: row.word_id,
    unitId: row.unit_id,
    skill: row.skill as LearningEvent["skill"],
    occurredAt: row.occurred_at,
    payload: row.payload as LearningEvent["payload"],
  } as LearningEvent;
}

function parseServerSeq(value: unknown): number {
  const seq = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(seq) || seq < 0) throw new Error("Supabase server_seq 格式無效");
  return seq;
}
