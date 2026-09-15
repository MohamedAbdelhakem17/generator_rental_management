/**
 * Wires the Contract module into the step-registries every earlier task (TASK-008, 009, 010,
 * 011) left as an empty extension point precisely for this module to fill in once it exists.
 * Imported once, for its side effects, from `contract.routes.ts` (which app.ts always loads).
 */
import { ASSIGNED_GENERATOR_PROVIDERS, type AssignedGeneratorSummary } from '../projects/assigned-generators.js';
import { CLOSE_GUARDS as PROJECT_CLOSE_GUARDS } from '../projects/close-guards.js';
import { DEACTIVATION_GUARDS as CUSTOMER_DEACTIVATION_GUARDS } from '../customers/deactivation-guards.js';
import { DEACTIVATION_GUARDS as GENERATOR_DEACTIVATION_GUARDS } from '../generators/deactivation-guards.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { ACTIVE_CONTRACT_CHECKS } from '../status-engine/status-engine.types.js';
import { ContractItemModel } from './contract-item.model.js';
import { RentalContractModel } from './contract.model.js';
import { hasActiveContractForGenerator } from './contract.service.js';

// Status Engine (TASK-009 Business Rule 6.1): "Rented" requires an Active contract whose
// dates cover today and that has a ContractItem for this generator.
ACTIVE_CONTRACT_CHECKS.push((generatorId) => hasActiveContractForGenerator(generatorId));

// Generator deactivation (TASK-008 FR-004): blocked while an active contract references it.
GENERATOR_DEACTIVATION_GUARDS.push(async (generatorId) => {
  const blocked = await hasActiveContractForGenerator(generatorId);
  return blocked ? 'Generator has an active rental contract' : null;
});

// Customer deactivation (TASK-010 FR-002): blocked while it has an active contract (the
// outstanding-positive-balance half of FR-002 is TASK-023's Ledger Engine to add).
CUSTOMER_DEACTIVATION_GUARDS.push(async (customerId) => {
  const count = await RentalContractModel.countDocuments({ customerId, status: 'Active' });
  return count > 0 ? 'Customer has an active rental contract' : null;
});

// Project close (TASK-011): blocked while it has active contracts.
PROJECT_CLOSE_GUARDS.push(async (projectId) => {
  const count = await RentalContractModel.countDocuments({ projectId, status: 'Active' });
  return count > 0 ? `Project has ${count} active contract(s)` : null;
});

// Project "assigned generators" (TASK-011 Business Rule, Section 9): a live derivation from
// this project's active contracts' items — never a stored list.
ASSIGNED_GENERATOR_PROVIDERS.push(async (projectId): Promise<AssignedGeneratorSummary[]> => {
  const activeContractIds = await RentalContractModel.find({ projectId, status: 'Active' }).distinct('_id');
  if (activeContractIds.length === 0) return [];

  const items = await ContractItemModel.find({ contractId: { $in: activeContractIds } });
  if (items.length === 0) return [];

  const generators = await GeneratorModel.find({ _id: { $in: items.map((item) => item.generatorId) } });
  const generatorById = new Map(generators.map((generator) => [String(generator._id), generator]));

  return items
    .map((item) => generatorById.get(String(item.generatorId)))
    .filter((generator): generator is NonNullable<typeof generator> => Boolean(generator))
    .map((generator) => ({ generatorId: String(generator._id), code: generator.code, status: generator.status }));
});
