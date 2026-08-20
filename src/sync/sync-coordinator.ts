import type { MemoryRepository } from "../storage/memory-repository.ts";
import { replayLearningEvents } from "./replay-learning-events.ts";
import { compareEvents, deduplicateEvents, seedLearningEvents, type LearningEvent } from "./learning-events.ts";
import type { CloudEventStore } from "./cloud-event-store.ts";
import { LocalSyncStateStore } from "./local-sync-state.ts";

export type SyncStatus = "local" | "syncing" | "synced" | "pending" | "error";

type SyncCoordinatorOptions = {
  cloud: CloudEventStore;
  stateStore: LocalSyncStateStore;
  deviceId: string;
};

export class SyncCoordinator {
  status: SyncStatus = "local";
  pendingCount = 0;
  private readonly cloud: CloudEventStore;
  private readonly stateStore: LocalSyncStateStore;
  readonly deviceId: string;
  private userId: string | null = null;
  private repository: MemoryRepository | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(options: SyncCoordinatorOptions) {
    this.cloud = options.cloud;
    this.stateStore = options.stateStore;
    this.deviceId = options.deviceId;
  }

  async start(userId: string, repository: MemoryRepository): Promise<void> {
    this.userId = userId;
    this.repository = repository;
    const data = await repository.exportData();
    const seeded = seedLearningEvents(data, this.deviceId);
    if (seeded.length) this.stateStore.enqueue(userId, seeded);
    try {
      await this.syncNow();
    } catch {
      // Offline-first startup keeps the owner repository usable while the outbox waits for retry.
    }
  }

  record(event: LearningEvent): Promise<void> {
    if (!this.userId) return Promise.resolve();
    this.stateStore.enqueue(this.userId, [event]);
    this.updatePendingCount();
    void this.syncNow().catch(() => undefined);
    return Promise.resolve();
  }

  syncNow(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performSync().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async replaceWithImport(data: Parameters<MemoryRepository["importData"]>[0]): Promise<void> {
    if (!this.userId || !this.repository) throw new Error("尚未登入同步帳號");
    await this.cloud.clear(this.userId);
    await this.repository.importData(data);
    this.stateStore.clear(this.userId);
    const next = this.stateStore.read(this.userId);
    const seeded = seedLearningEvents(await this.repository.exportData(), this.deviceId);
    this.stateStore.write(this.userId, { ...next, knownEvents: seeded, outbox: seeded });
    await this.syncNow();
  }

  async reset(): Promise<void> {
    if (!this.userId || !this.repository) return;
    await this.cloud.clear(this.userId);
    await this.repository.reset();
    this.stateStore.clear(this.userId);
    this.status = "synced";
    this.pendingCount = 0;
  }

  stop(): void {
    this.userId = null;
    this.repository = null;
    this.status = "local";
    this.pendingCount = 0;
  }

  private async performSync(): Promise<void> {
    if (!this.userId || !this.repository) return;
    const userId = this.userId;
    this.status = "syncing";
    const state = this.stateStore.read(userId);
    const uploadedIds = new Set(state.outbox.map((event) => event.id));
    try {
      await this.cloud.upload(userId, state.outbox);
      const pulled = [];
      let cursor = state.lastServerSeq;
      while (true) {
        const page = await this.cloud.pull(userId, cursor, 500);
        pulled.push(...page);
        if (!page.length) break;
        cursor = Math.max(cursor, ...page.map((row) => row.serverSeq));
        if (page.length < 500) break;
      }
      const events = deduplicateEvents([
        ...state.knownEvents,
        ...state.outbox,
        ...pulled.map((row) => row.event),
      ]).sort(compareEvents);
      await this.repository.importData(replayLearningEvents(events));
      this.stateStore.write(userId, {
        version: 1,
        deviceId: state.deviceId || this.deviceId,
        lastServerSeq: cursor,
        knownEvents: events,
        outbox: state.outbox.filter((event) => !uploadedIds.has(event.id)),
      });
      this.updatePendingCount();
      this.status = this.pendingCount ? "pending" : "synced";
    } catch (error) {
      this.updatePendingCount();
      this.status = "error";
      throw error;
    }
  }

  private updatePendingCount(): void {
    if (!this.userId) {
      this.pendingCount = 0;
      return;
    }
    this.pendingCount = this.stateStore.read(this.userId).outbox.length;
  }
}
