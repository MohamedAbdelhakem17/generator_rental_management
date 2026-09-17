/**
 * TASK-032 Section 11/28: a generic storage abstraction so the specific provider (local disk
 * for V1) is swappable without touching `AttachmentService` or its controller/routes — provider
 * choice is a deployment concern, out of scope per this PRD's explicit exclusions. Swappability
 * is verified by `InMemoryStorageAdapter`, a second implementation used in tests.
 */
export interface StorageAdapter {
  /** Persists the file and returns an adapter-internal reference — never exposed raw to the
   * client (Section 10: `storagePath` is an internal reference). */
  save(input: { buffer: Buffer; originalName: string }): Promise<{ storagePath: string }>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
}
