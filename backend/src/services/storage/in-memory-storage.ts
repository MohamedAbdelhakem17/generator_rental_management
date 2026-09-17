import { randomUUID } from 'node:crypto';

import type { StorageAdapter } from './storage-adapter.js';

/** Section 28 DoD: a second implementation proving `AttachmentService` never depends on the
 * local-disk specifics — used by this module's own tests so they don't touch the filesystem. */
export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly files = new Map<string, Buffer>();

  async save(input: { buffer: Buffer; originalName: string }): Promise<{ storagePath: string }> {
    const storagePath = `${randomUUID()}-${input.originalName}`;
    this.files.set(storagePath, input.buffer);
    return { storagePath };
  }

  async read(storagePath: string): Promise<Buffer> {
    const buffer = this.files.get(storagePath);
    if (!buffer) {
      throw new Error(`No such file: ${storagePath}`);
    }
    return buffer;
  }

  async delete(storagePath: string): Promise<void> {
    this.files.delete(storagePath);
  }
}
