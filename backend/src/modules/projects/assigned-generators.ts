/**
 * Business Rule (Section 9): a project's "assigned generators" is always a live derivation
 * from active Contract Items (TASK-012, doesn't exist yet) — never a manually-maintained
 * list, to avoid drift from the Contract module. Same step-registry pattern as
 * `close-guards.ts`; TASK-012 pushes a provider into this once Contract Items exist.
 */
export interface AssignedGeneratorSummary {
  generatorId: string;
  code: string;
  status: string;
}

export type AssignedGeneratorsProvider = (projectId: string) => Promise<AssignedGeneratorSummary[]>;

export const ASSIGNED_GENERATOR_PROVIDERS: AssignedGeneratorsProvider[] = [];

export async function getAssignedGenerators(projectId: string): Promise<AssignedGeneratorSummary[]> {
  const results = await Promise.all(ASSIGNED_GENERATOR_PROVIDERS.map((provider) => provider(projectId)));
  return results.flat();
}
