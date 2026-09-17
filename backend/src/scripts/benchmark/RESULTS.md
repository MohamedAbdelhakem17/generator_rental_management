# Performance Benchmark Results — TASK-034 validation

**Date:** 2026-09-17
**Script:** `backend/scripts/benchmark/seed-and-benchmark.ts`
**Run:** `pnpm --filter backend exec tsx scripts/benchmark/seed-and-benchmark.ts`

## Environment

- **Docker was not available** in this sandbox (`docker` command not found), so the benchmark
  uses `mongodb-memory-server` — a real `mongod` binary running against an in-memory/temp-disk
  data directory, not a mock. This is the same MongoDB engine the app runs against in
  production, just without persistence and without a separate container. This is a documented,
  unavoidable environmental limitation (no Docker daemon and no external MongoDB reachable in
  this sandbox), not a skipped requirement — the benchmark still exercises real Mongoose
  queries, real indexes, and real aggregation pipelines end to end.
- Hardware is a shared/virtualized sandbox environment, not dedicated bare metal — absolute
  timings should be read as "order of magnitude," not a guaranteed production SLA. The
  **query-count and query-shape** results (the actual thing TASK-034 needed to prove) are
  environment-independent.
- Data is entirely torn down at the end of the script (`mongod.stop()`); nothing is persisted to
  any real database.

## Seeded dataset

| Entity | Count |
|---|---|
| Generators | 500 |
| Customers | 40 |
| Projects | 80 |
| Rental Contracts (Active) | 500 |
| Contract Items (1 per contract, pinning a generator) | 500 |
| Operation Logs | 60,000 |
| Fuel Logs | 25,000 |
| Extracts | 10,000 |
| Expenses | 5,000 |
| **Total log/transaction records** | **100,000** |

Seed time: ~12s total (batched `insertMany`, 1000–2000 docs/batch).

## Results

| Operation | Time | Notes |
|---|---|---|
| `ProfitabilityEngineService.calculateBatch` (20 generators) | **171.5ms** | Fixed number of aggregation queries (5 total: contract-items, extracts, fuel, maintenance, expenses), regardless of candidate count — this is the exact path TASK-034 rewrote to eliminate the former ~80–100-query fan-out (previously one `calculate()` call per generator, each issuing ~4-5 queries). |
| `DashboardService.getSummary` (full fleet, no filters) | **191.5ms** | Includes the batched profitability call above plus fleet/financial/operational KPI aggregation across the full 100k-record dataset. |
| Paginated Generator list (page 1, 20/page) | **9.2ms** | Uses the existing `code`/status indexes; no scan. |
| Paginated Extract list (page 1, 20/page, status filter) | **29.0ms** | Filtered on `status`, sorted on `createdAt`. |

No query exceeded the 1.5s slow-query threshold defined in the benchmark script. No missing
index was found — an `explain('executionStats')` on the `ContractItem` `$in` query (the query
most directly affected by the TASK-034 fan-out fix) shows `totalDocsExamined: 20` for 20
requested generator IDs (`stage: FETCH` via the existing `generatorId+contractId` compound
index) — an exact, non-scanning match, confirming the aggregation path is index-backed at this
scale.

## Conclusion

At 500 generators / 100,000 records, the previously-fan-out-prone Dashboard/Profitability path
completes in under 200ms with a bounded, fixed query count. **No additional indexes were added**
as a result of this benchmark — none were justified by the evidence (no query was slow, no
collection scan was observed). This validates the TASK-034 dashboard fan-out fix under a
realistic-scale dataset, within the stated environmental constraint (mongodb-memory-server
in place of a persistent MongoDB/Docker instance).
