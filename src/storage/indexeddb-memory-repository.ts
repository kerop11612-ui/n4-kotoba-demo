import { LocalStorageMemoryRepository } from "./memory-repository.ts";

/**
 * Placeholder boundary for a future IndexedDB backend. The application talks
 * to MemoryRepository, so moving persistence to IndexedDB does not change UI
 * or FSRS code.
 */
export class IndexedDbMemoryRepository extends LocalStorageMemoryRepository {}

