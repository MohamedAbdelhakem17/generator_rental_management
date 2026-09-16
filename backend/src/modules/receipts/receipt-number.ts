import { Schema, model } from 'mongoose';

interface ReceiptCounterAttrs {
  _id: string;
  seq: number;
}

const receiptCounterSchema = new Schema<ReceiptCounterAttrs>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const ReceiptCounterModel = model<ReceiptCounterAttrs>('ReceiptCounter', receiptCounterSchema);

export async function nextReceiptNumber(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const key = `RC-${year}`;

  const counter = await ReceiptCounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );

  return `${key}-${String(counter.seq).padStart(4, '0')}`;
}
