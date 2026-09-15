import { Schema, model } from 'mongoose';

interface ContractCounterAttrs {
  _id: string;
  seq: number;
}

const contractCounterSchema = new Schema<ContractCounterAttrs>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const ContractCounterModel = model<ContractCounterAttrs>('ContractCounter', contractCounterSchema);

/**
 * FR-001: sequential, human-readable, never reused. `findOneAndUpdate` with `$inc` is an
 * atomic increment — safe under concurrent contract creation, unlike "find the max number
 * and add one" (which races).
 */
export async function nextContractNumber(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const key = `CN-${year}`;

  const counter = await ContractCounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );

  return `${key}-${String(counter.seq).padStart(4, '0')}`;
}
