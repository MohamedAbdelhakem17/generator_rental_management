import { Schema, model } from 'mongoose';

interface ExtractCounterAttrs {
  _id: string;
  seq: number;
}

const extractCounterSchema = new Schema<ExtractCounterAttrs>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const ExtractCounterModel = model<ExtractCounterAttrs>('ExtractCounter', extractCounterSchema);

/** FR-001: sequential, unique, never reused — see the identical note in contracts/contract-number.ts. */
export async function nextExtractNumber(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const key = `EXT-${year}`;

  const counter = await ExtractCounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );

  return `${key}-${String(counter.seq).padStart(4, '0')}`;
}
