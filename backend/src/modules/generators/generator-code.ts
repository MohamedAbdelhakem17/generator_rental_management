import { Schema, model } from 'mongoose';

interface GeneratorCounterAttrs {
  _id: string;
  seq: number;
}

const generatorCounterSchema = new Schema<GeneratorCounterAttrs>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const GeneratorCounterModel = model<GeneratorCounterAttrs>(
  'GeneratorCounter',
  generatorCounterSchema,
);

const COUNTER_KEY = 'GEN';
const CODE_PREFIX = 'GEN-';
const CODE_PAD_LENGTH = 4;

/**
 * Codes are system-generated (GEN-0001, GEN-0002, ...), never user-entered.
 * `findOneAndUpdate` with `$inc` is an atomic increment — safe under concurrent generator
 * creation, unlike "find the max existing code and add one" (which races and collides
 * under real concurrency, requiring unbounded retries on the unique index).
 */
export async function nextGeneratorCode(): Promise<string> {
  const counter = await GeneratorCounterModel.findOneAndUpdate(
    { _id: COUNTER_KEY },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );

  return `${CODE_PREFIX}${String(counter.seq).padStart(CODE_PAD_LENGTH, '0')}`;
}
