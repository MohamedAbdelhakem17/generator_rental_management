import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBaseSchema } from '../db/baseSchema.js';
import { ValidationError } from '../utils/AppError.js';
import { toDecimal } from './money.js';
import { paginateQuery } from './pagination.js';

interface TestItemDoc {
  name: string;
  amount: mongoose.Types.Decimal128;
  isDeleted: boolean;
}

let mongod: MongoMemoryServer;
let connection: mongoose.Connection;
let TestItem: mongoose.Model<TestItemDoc>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongod.getUri()).asPromise();

  const schema = createBaseSchema({
    name: { type: String, required: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
  });

  TestItem = connection.model<TestItemDoc>('PaginationTestItem', schema);

  await TestItem.insertMany([
    { name: 'a', amount: mongoose.Types.Decimal128.fromString('10.00') },
    { name: 'b', amount: mongoose.Types.Decimal128.fromString('5.00') },
    { name: 'c', amount: mongoose.Types.Decimal128.fromString('100.00') },
    { name: 'd', amount: mongoose.Types.Decimal128.fromString('20.00') },
    { name: 'deleted', amount: mongoose.Types.Decimal128.fromString('1.00'), isDeleted: true },
  ]);
}, 60_000);

afterAll(async () => {
  await connection.dropDatabase();
  await connection.close();
  await mongod.stop();
});

describe('paginateQuery', () => {
  it('excludes soft-deleted documents by default', async () => {
    const result = await paginateQuery(TestItem, {}, { limit: 100 });

    expect(result.items).toHaveLength(4);
    expect(result.meta.total).toBe(4);
  });

  it('includes soft-deleted documents when includeDeleted is true', async () => {
    const result = await paginateQuery(TestItem, {}, { limit: 100, includeDeleted: true });

    expect(result.items).toHaveLength(5);
  });

  it('clamps a limit above the max down to 100', async () => {
    const result = await paginateQuery(TestItem, {}, { limit: 500 });

    expect(result.meta.limit).toBe(100);
  });

  it('clamps a limit below 1 up to 1', async () => {
    const result = await paginateQuery(TestItem, {}, { limit: 0 });

    expect(result.meta.limit).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('defaults limit to 20 when not provided', async () => {
    const result = await paginateQuery(TestItem, {});

    expect(result.meta.limit).toBe(20);
  });

  it('returns an empty items array with correct meta beyond the last page', async () => {
    const result = await paginateQuery(TestItem, {}, { page: 50, limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(4);
    expect(result.meta.totalPages).toBe(1);
    expect(result.meta.page).toBe(50);
  });

  it('sorts correctly on a Decimal128 field using real BSON comparison', async () => {
    const result = await paginateQuery(TestItem, {}, {
      sort: 'amount',
      allowedSortFields: ['amount', 'name'],
      limit: 100,
    });

    const amounts = result.items.map((item) => toDecimal(item.amount).toNumber());
    expect(amounts).toEqual([5, 10, 20, 100]);
  });

  it('sorts descending when the field is prefixed with "-"', async () => {
    const result = await paginateQuery(TestItem, {}, {
      sort: '-amount',
      allowedSortFields: ['amount'],
      limit: 100,
    });

    const amounts = result.items.map((item) => toDecimal(item.amount).toNumber());
    expect(amounts).toEqual([100, 20, 10, 5]);
  });

  it('throws a ValidationError for a sort field not in the allow-list', async () => {
    await expect(
      paginateQuery(TestItem, {}, { sort: 'notAField', allowedSortFields: ['name'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
