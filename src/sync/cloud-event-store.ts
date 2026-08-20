import type { LearningEvent } from "./learning-events.ts";

export type CloudEventRow = { event: LearningEvent; serverSeq: number };

export interface CloudEventStore {
  upload(userId: string, events: LearningEvent[]): Promise<void>;
  pull(userId: string, afterSeq: number, limit: number): Promise<CloudEventRow[]>;
  clear(userId: string): Promise<void>;
}
