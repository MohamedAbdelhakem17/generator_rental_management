import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { StorageAdapter } from './storage-adapter.js';

const UPLOAD_ROOT = process.env.ATTACHMENTS_DIR ?? path.resolve(process.cwd(), 'uploads');

function sanitizeFileName(originalName: string): string {
  return originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** V1 single-node implementation (Section 11): writes under `UPLOAD_ROOT`, keyed by a random
 * id so two uploads of the same original filename never collide. */
export class LocalDiskStorageAdapter implements StorageAdapter {
  async save(input: { buffer: Buffer; originalName: string }): Promise<{ storagePath: string }> {
    await mkdir(UPLOAD_ROOT, { recursive: true });
    const storagePath = `${randomUUID()}-${sanitizeFileName(input.originalName)}`;
    await writeFile(path.join(UPLOAD_ROOT, storagePath), input.buffer);
    return { storagePath };
  }

  async read(storagePath: string): Promise<Buffer> {
    return readFile(path.join(UPLOAD_ROOT, storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    await rm(path.join(UPLOAD_ROOT, storagePath), { force: true });
  }
}
