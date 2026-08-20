import { createLearningEventId, reviewHistoryToLearningEvent } from "./learning-events.ts";
import type { SyncCoordinator } from "./sync-coordinator.ts";
import type { MemoryRepository } from "../storage/memory-repository.ts";
import { isImportableMemoryData } from "../storage/memory-repository-utils.ts";
import type { MemoryRepositoryData, ReviewHistoryRecord, VocabularyReviewEvent, WordMemoryRecord } from "../spaced-repetition/types.ts";

export class SyncingMemoryRepository implements MemoryRepository {
  private readonly local: MemoryRepository;
  private readonly coordinator: SyncCoordinator;

  constructor(
    local: MemoryRepository,
    coordinator: SyncCoordinator,
  ) {
    this.local = local;
    this.coordinator = coordinator;
  }

  getWordMemory(wordId: string, skill?: Parameters<MemoryRepository["getWordMemory"]>[1]) {
    return this.local.getWordMemory(wordId, skill);
  }

  async saveWordMemory(record: WordMemoryRecord): Promise<void> {
    const previous = await this.local.getWordMemory(record.wordId, record.skill);
    await this.local.saveWordMemory(record);
    const previousMastered = previous?.manualMastered ?? false;
    if (previousMastered === record.manualMastered) return;
    await this.coordinator.record({
      version: 1,
      id: createLearningEventId(),
      deviceId: this.coordinator.deviceId,
      wordId: record.wordId,
      unitId: record.unitId,
      skill: record.skill,
      occurredAt: record.updatedAt,
      type: "manual_mastery",
      payload: { mastered: record.manualMastered },
    });
  }

  async commitReview(memory: WordMemoryRecord, history: ReviewHistoryRecord, event: VocabularyReviewEvent): Promise<void> {
    await this.local.commitReview(memory, history, event);
    await this.coordinator.record(reviewHistoryToLearningEvent(history, this.coordinator.deviceId));
  }

  getUnitMemories(unitId: string) {
    return this.local.getUnitMemories(unitId);
  }

  getReviewHistory(unitId?: string) {
    return this.local.getReviewHistory(unitId);
  }

  appendReviewHistory(record: ReviewHistoryRecord) {
    return this.local.appendReviewHistory(record);
  }

  getReviewEvents(unitId?: string) {
    return this.local.getReviewEvents(unitId);
  }

  appendReviewEvent(record: VocabularyReviewEvent) {
    return this.local.appendReviewEvent(record);
  }

  migrate() {
    return this.local.migrate();
  }

  exportData(): Promise<MemoryRepositoryData> {
    return this.local.exportData();
  }

  async importData(value: unknown): Promise<void> {
    if (!isImportableMemoryData(value)) throw new Error("學習資料格式無效");
    await this.coordinator.replaceWithImport(value);
  }

  reset(): Promise<void> {
    return this.coordinator.reset();
  }
}
