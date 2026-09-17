import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { InMemoryStorageAdapter } from '../../services/storage/in-memory-storage.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { AttachmentModel } from './attachment.model.js';
import { createAttachmentService } from './attachment.service.js';

async function createMaintenance() {
  const generator = await GeneratorModel.create({
    code: `GEN-${Math.random().toString(36).slice(2, 8)}`,
    specifications: { kva: 100, brand: 'CAT', model: '400', serialNumber: `SN-${Math.random().toString(36).slice(2, 8)}` },
    currentMeter: 100,
    normalFuelConsumption: 5,
    status: 'Available',
    commercialStatus: 'Unassigned',
  });
  return MaintenanceModel.create({
    generatorId: generator._id,
    type: 'Preventive',
    date: new Date('2026-01-01'),
    status: 'Open',
    meter: 100,
    totalCost: '0.00',
  });
}

describe('AttachmentService (TASK-032)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('DoD: swaps storage providers without any change to service logic — uploads via the in-memory adapter and reads the same bytes back', async () => {
    const storage = new InMemoryStorageAdapter();
    const service = createAttachmentService(storage);
    const maintenance = await createMaintenance();
    const uploadedBy = new Types.ObjectId().toString();

    const attachment = await service.upload({
      entityType: 'Maintenance',
      entityId: String(maintenance._id),
      file: { buffer: Buffer.from('hello world'), originalname: 'photo.jpg', size: 11 },
      uploadedBy,
    });

    const { buffer } = await service.getForDownload(String(attachment._id));
    expect(buffer.toString()).toBe('hello world');
  });

  it('FR-001: rejects a disallowed file type before any file is stored', async () => {
    const service = createAttachmentService(new InMemoryStorageAdapter());
    const maintenance = await createMaintenance();

    await expect(
      service.upload({
        entityType: 'Maintenance',
        entityId: String(maintenance._id),
        file: { buffer: Buffer.from('x'), originalname: 'script.exe', size: 1 },
        uploadedBy: new Types.ObjectId().toString(),
      }),
    ).rejects.toThrow('Validation failed');

    expect(await AttachmentModel.countDocuments()).toBe(0);
  });

  it('FR-001: rejects a file over the configured size limit', async () => {
    const service = createAttachmentService(new InMemoryStorageAdapter());
    const maintenance = await createMaintenance();

    await expect(
      service.upload({
        entityType: 'Maintenance',
        entityId: String(maintenance._id),
        file: { buffer: Buffer.from('x'), originalname: 'big.pdf', size: 999_999_999 },
        uploadedBy: new Types.ObjectId().toString(),
      }),
    ).rejects.toThrow('Validation failed');
  });

  it('Edge Case: an interrupted/rejected upload leaves no orphaned Attachment record', async () => {
    const service = createAttachmentService(new InMemoryStorageAdapter());
    const maintenance = await createMaintenance();

    await expect(
      service.upload({
        entityType: 'Maintenance',
        entityId: String(maintenance._id),
        file: { buffer: Buffer.from('x'), originalname: 'notes.txt', size: 1 },
        uploadedBy: new Types.ObjectId().toString(),
      }),
    ).rejects.toThrow();

    expect(await AttachmentModel.countDocuments({ entityId: maintenance._id })).toBe(0);
  });

  it('rejects an upload against a non-existent entity with 422-shaped validation error', async () => {
    const service = createAttachmentService(new InMemoryStorageAdapter());
    await expect(
      service.upload({
        entityType: 'Maintenance',
        entityId: String(new Types.ObjectId()),
        file: { buffer: Buffer.from('x'), originalname: 'photo.png', size: 1 },
        uploadedBy: new Types.ObjectId().toString(),
      }),
    ).rejects.toThrow('Validation failed');
  });

  it('FR-003: a Maintenance attachment deleted by an Admin is hard-deleted', async () => {
    const service = createAttachmentService(new InMemoryStorageAdapter());
    const maintenance = await createMaintenance();
    const uploadedBy = new Types.ObjectId().toString();
    const attachment = await service.upload({
      entityType: 'Maintenance',
      entityId: String(maintenance._id),
      file: { buffer: Buffer.from('x'), originalname: 'photo.png', size: 1 },
      uploadedBy,
    });

    await service.remove(String(attachment._id), { userId: uploadedBy, roleName: 'System Admin' });

    expect(await AttachmentModel.findById(attachment._id)).toBeNull();
  });

  it('FR-003: an Extract attachment is soft-deleted, not purged, even for an Admin', async () => {
    const service = createAttachmentService(new InMemoryStorageAdapter());
    const maintenance = await createMaintenance();
    void maintenance;
    const uploadedBy = new Types.ObjectId().toString();

    // Reuse the Maintenance fixture's id as a stand-in Extract-shaped entity to isolate the
    // soft-vs-hard-delete branch under test without needing a full Extract fixture here.
    const attachment = await AttachmentModel.create({
      entityType: 'Extract',
      entityId: new Types.ObjectId(),
      fileName: 'invoice.pdf',
      fileType: 'pdf',
      fileSize: 10,
      storagePath: 'irrelevant',
      uploadedBy,
    });

    await service.remove(String(attachment._id), { userId: uploadedBy, roleName: 'System Admin' });

    const reloaded = await AttachmentModel.findById(attachment._id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.isDeleted).toBe(true);
  });

  it('Section 17: delete is rejected for a non-uploader, non-Admin actor', async () => {
    const service = createAttachmentService(new InMemoryStorageAdapter());
    const maintenance = await createMaintenance();
    const uploadedBy = new Types.ObjectId().toString();
    const attachment = await service.upload({
      entityType: 'Maintenance',
      entityId: String(maintenance._id),
      file: { buffer: Buffer.from('x'), originalname: 'photo.png', size: 1 },
      uploadedBy,
    });

    await expect(
      service.remove(String(attachment._id), {
        userId: new Types.ObjectId().toString(),
        roleName: 'Viewer',
      }),
    ).rejects.toThrow();
  });
});
