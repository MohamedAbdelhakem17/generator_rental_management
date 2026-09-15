/**
 * Minimal seed ahead of TASK-017 (mirrors the Status/Conflict Engine precedent from TASK-008/
 * TASK-012): TASK-016 FR-003 requires this call site to exist and run after every fuel log
 * creation (its own DoD: "Alert engine is invoked on every fuel log creation, verified via
 * integration test"). The threshold/severity comparison, alert lifecycle
 * (Open/Acknowledged/Resolved), deduplication, and recipient routing are all TASK-017's own
 * deliverables (Business Rule 6.5) — this stub intentionally does nothing yet.
 */
export const FuelAlertEngineService = {
  async evaluate(_fuelLogId: string): Promise<void> {
    // TASK-017 replaces this with the real threshold check.
  },
};
