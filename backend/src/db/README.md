# Database Conventions

Shared plumbing every domain module builds on (PRD Section 12, TASK-003).

## Base schema

Use `createBaseSchema(definition, options)` (`baseSchema.ts`) for every model referenced by
financial or operational history. It adds `createdAt`/`updatedAt` (`timestamps: true`) and the
soft-delete pair `isDeleted` / `deletedAt`. Never hard-delete these entities — see PRD Section 12.1.

## Pagination

Every list endpoint calls `paginateQuery(model, filters, options)` (`services/pagination.ts`).
Pass `allowedSortFields` so an invalid `sort` query param becomes a `422 ValidationError` instead
of a raw Mongo cast error. `limit` clamps to `[1, 100]` (default 20); `page` clamps to `>= 1`.

## Money

Every monetary field is `Schema.Types.Decimal128`; convert through `services/money.ts`
(`toDecimal`, `toDecimal128`, `roundMoney`, `toDisplayString`) — never native JS floats or ad hoc
`toFixed()` calls. Rounding is always 2dp, `ROUND_HALF_UP`.

## Index naming convention

`<collection>_<field(s)>_idx`, fields joined with `_` in the order they appear in the compound
index, e.g. `generators_code_idx` (unique), `operationlogs_generatorId_date_idx` (compound).
Every unique business identifier (`code`, `number`) gets a unique index; every foreign-key-style
`ObjectId` used in a filter gets an index; frequently-combined filters get a compound index
matching the actual query shape (verified via `explain()` in TASK-034). Domain modules define
their own indexes on their own schemas — this convention just keeps naming consistent across them.
