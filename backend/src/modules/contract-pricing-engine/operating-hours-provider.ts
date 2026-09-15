/**
 * FR-004: the Hourly method sums operating hours "pulled from non-superseded Operation Logs
 * for that generator/project within the period" — Operation Logs are TASK-015, which hasn't
 * been built yet (this task's own Preconditions list it as a dependency ahead of TASK-014 in
 * the numbered plan). Same step-registry pattern as every other cross-module extension point
 * in this codebase (e.g. `generators/deactivation-guards.ts`) — TASK-015 pushes a provider
 * into this once Operation Logs exist. Until then, every Hourly calculation legitimately
 * returns zero hours with Section 19's "no operation logs in period" warning, which is
 * itself a spec'd, valid result — not a placeholder hack.
 */
export interface OperatingHoursResult {
  hours: number;
  operationLogIds: string[];
}

export type OperatingHoursProvider = (
  generatorId: string,
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
) => Promise<OperatingHoursResult>;

export const OPERATING_HOURS_PROVIDERS: OperatingHoursProvider[] = [];

export async function getOperatingHours(
  generatorId: string,
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<OperatingHoursResult> {
  let total = 0;
  const operationLogIds: string[] = [];

  for (const provider of OPERATING_HOURS_PROVIDERS) {
    const result = await provider(generatorId, projectId, periodStart, periodEnd);
    total += result.hours;
    operationLogIds.push(...result.operationLogIds);
  }

  return { hours: total, operationLogIds };
}
