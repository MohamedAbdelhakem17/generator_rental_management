/**
 * FR-002: `before`/`after` are stored as diffed field-level objects (only changed fields), not
 * full document dumps. Callers that already have both full snapshots (e.g. `extract.update`,
 * which currently passes the whole `before`/`after.toObject()`) can run them through this to
 * keep only the fields that actually changed, rather than diffing manually per call site.
 */
export function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changedBefore[key] = beforeValue;
      changedAfter[key] = afterValue;
    }
  }

  return { before: changedBefore, after: changedAfter };
}
