import type { LearningEvent } from "./learning-events.ts";

export type RepositoryNamespace = "guest" | `user:${string}`;

export type LocalSyncState = {
  version: 1;
  deviceId: string;
  lastServerSeq: number;
  knownEvents: LearningEvent[];
  outbox: LearningEvent[];
};

type SyncStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const SYNC_STATE_PREFIX = "n4-kotoba-sync-v1:";
const DEVICE_ID_KEY = "n4-kotoba-device-v1";

export class LocalSyncStateStore {
  private readonly storage: SyncStorage | null;
  private readonly deviceId: string;

  constructor(storage?: SyncStorage | null) {
    this.storage = storage ?? getBrowserStorage();
    this.deviceId = readOrCreateDeviceId(this.storage);
  }

  read(userId: string): LocalSyncState {
    const fallback = createEmptySyncState(this.deviceId);
    if (!this.storage) return fallback;
    try {
      const raw = this.storage.getItem(`${SYNC_STATE_PREFIX}${userId}`);
      if (!raw) return fallback;
      const value: unknown = JSON.parse(raw);
      return isLocalSyncState(value) ? normalizeState(value, this.deviceId) : fallback;
    } catch {
      return fallback;
    }
  }

  write(userId: string, state: LocalSyncState): void {
    const normalized = normalizeState(state, this.deviceId);
    this.storage?.setItem(`${SYNC_STATE_PREFIX}${userId}`, JSON.stringify(normalized));
  }

  enqueue(userId: string, events: LearningEvent[]): void {
    const state = this.read(userId);
    const knownEvents = deduplicateEvents([...state.knownEvents, ...events]);
    const outbox = deduplicateEvents([...state.outbox, ...events]);
    this.write(userId, { ...state, knownEvents, outbox });
  }

  clear(userId: string): void {
    this.storage?.removeItem(`${SYNC_STATE_PREFIX}${userId}`);
  }
}

export function createEmptySyncState(deviceId = readOrCreateDeviceId(getBrowserStorage())): LocalSyncState {
  return { version: 1, deviceId, lastServerSeq: 0, knownEvents: [], outbox: [] };
}

function normalizeState(state: LocalSyncState, deviceId: string): LocalSyncState {
  return {
    version: 1,
    deviceId: typeof state.deviceId === "string" && state.deviceId ? state.deviceId : deviceId,
    lastServerSeq: Number.isInteger(state.lastServerSeq) && state.lastServerSeq >= 0 ? state.lastServerSeq : 0,
    knownEvents: deduplicateEvents(state.knownEvents),
    outbox: deduplicateEvents(state.outbox),
  };
}

function deduplicateEvents(events: LearningEvent[]): LearningEvent[] {
  return [...new Map(events.map((event) => [event.id, structuredClone(event)])).values()];
}

function isLocalSyncState(value: unknown): value is LocalSyncState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<LocalSyncState>;
  return candidate.version === 1
    && typeof candidate.deviceId === "string"
    && typeof candidate.lastServerSeq === "number"
    && Number.isInteger(candidate.lastServerSeq)
    && candidate.lastServerSeq >= 0
    && Array.isArray(candidate.knownEvents)
    && candidate.knownEvents.every(isLearningEvent)
    && Array.isArray(candidate.outbox)
    && candidate.outbox.every(isLearningEvent);
}

function isLearningEvent(value: unknown): value is LearningEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<LearningEvent>;
  return event.version === 1
    && typeof event.id === "string"
    && event.id.length > 0
    && typeof event.deviceId === "string"
    && typeof event.wordId === "string"
    && typeof event.unitId === "string"
    && typeof event.skill === "string"
    && typeof event.occurredAt === "string"
    && Number.isFinite(Date.parse(event.occurredAt))
    && (event.type === "review" || event.type === "manual_mastery" || event.type === "memory_snapshot")
    && Boolean(event.payload);
}

function readOrCreateDeviceId(storage: SyncStorage | null): string {
  const existing = storage?.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = globalThis.crypto?.randomUUID?.()
    ?? `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try { storage?.setItem(DEVICE_ID_KEY, created); } catch { /* restricted storage uses an ephemeral id */ }
  return created;
}

function getBrowserStorage(): SyncStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}
