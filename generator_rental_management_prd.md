# Generator Rental Management System
# Product Requirements Document (Enhanced — v2.0)

Version 2.0 | English | RTL-ready Arabic UI
Implementation structure: `/backend` + `/frontend`
UI system: shadcn/ui + Tailwind CSS
Status: Single Source of Truth for Development

---

## Document Conventions

- Every task below follows the **28-section standard template** (Objective → Definition of Done). For pure infrastructure tasks (e.g. repository bootstrap) some sections are marked **N/A** with a one-line justification rather than omitted, so the template stays scannable and consistent across the whole backlog.
- `EGP` is used as the example currency; the actual currency is a system setting (see TASK-030).
- All monetary fields use **Decimal128** in MongoDB and a decimal-safe library (`decimal.js`) in application code. Raw `number`/floating point is never used for money.
- All list endpoints are paginated, server-filtered, and server-sorted by default. The frontend never fetches unbounded collections.
- Every entity referenced by financial documents is soft-deleted/deactivated, never hard-deleted.

---

## 1. Product Overview

The system is an internal business management platform for a generator rental company. It manages the complete operational and financial lifecycle of each generator: registration, rental, project assignment, daily meter readings, fuel consumption, maintenance, billing/extracts, collections, expenses, and profitability, surfaced through a real-time dashboard and a reporting suite.

### 1.1 Core Objectives

- Single source of truth for every generator and its current, deterministic status.
- Manage customers and multiple projects per customer.
- Manage rental contracts and prevent conflicting generator assignments.
- Track daily generator operation and meter readings.
- Track fuel usage and automatically detect abnormal consumption.
- Manage preventive and corrective maintenance with predictive scheduling.
- Generate rental extracts/invoices, calculate VAT, and enforce a lifecycle that protects approved financial documents from silent edits.
- Track customer receipts, outstanding balances, and full account statements.
- Track operating and administrative expenses, with optional generator/project attribution.
- Calculate revenue, cost, and net profit per generator, project, customer, and period.
- Provide a management dashboard with actionable KPIs and alerts.
- Provide operational, financial, and profitability reports with export.
- Maintain a complete, tamper-evident audit trail of sensitive actions.

### 1.2 Product Principles

- The **Generator** is the primary operational asset; almost every other entity exists to describe what happened to a generator, for whom, and at what cost.
- The **Customer** owns one or more **Projects**.
- A **Project** can have one or more **Generators** (via active Contracts) and one or more **Contracts**.
- A **Contract** defines commercial terms and rental pricing, and contains **Contract Items** (one per generator assigned).
- **Operations**, **Fuel**, and **Maintenance** create the actual operating-cost history for each generator.
- **Extracts/Invoices** and **Receipts** represent the customer financial cycle; the **Customer Ledger** is derived from them, never edited directly.
- Reporting and the Dashboard aggregate the same source data used by the operational modules — no parallel/duplicated calculation paths.
- Business rules live in backend domain services (`services/*Service.ts`), never only inside controllers or UI components.
- Approved financial documents are never silently mutated — every correction is a new, audited transaction (credit note, cancellation + reissue, or explicit correction workflow).

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌───────────────────┐        REST/JSON        ┌────────────────────┐        ┌───────────────┐
│   Next.js Frontend │ ──────────────────────▶ │  Express.js Backend │ ─────▶ │   MongoDB      │
│  (shadcn/ui, RTL)  │ ◀────────────────────── │  (TS, Mongoose)     │ ◀───── │  (Mongoose ODM)│
└───────────────────┘                          └────────────────────┘        └───────────────┘
                                                        │
                                                        ▼
                                              In-memory process cache
                                              (derived-status cache,
                                               rate-limit counters,
                                               short-TTL lookups)
                                              — NOT Redis, NOT a
                                              system of record.
```

- The frontend **never** connects to MongoDB directly. All access is through the versioned REST API.
- Redis and any external caching infrastructure are explicitly excluded. Any in-process cache must be safe to lose on restart (derived/recoverable data only).
- All money-bearing business logic (pricing, VAT, balances, profitability) lives in backend **domain services**, independent of Express controllers, so the same service can be called from controllers, scheduled jobs, and report generators without duplicating formulas.
- Cross-cutting concerns (status engine, ledger engine, notification engine, audit engine) are implemented as first-class backend modules (`modules/*-engine`) rather than being embedded inside feature modules, because they are consumed by multiple feature modules.

### 2.2 Layering Rule (enforced in every module)

```
Route → Middleware (auth, validation) → Controller (HTTP only) → Service (business rules) → Model (Mongoose/persistence)
```

- Controllers: parse/validate request shape delegation, call one service method, map result to the standard API envelope. No `if` business conditions beyond HTTP-shape concerns.
- Services: all calculations, all state-transition rules, all cross-entity consistency checks (e.g. contract conflict, ledger, status derivation).
- Models: schema, validation constraints that are structural (types/enums/required), indexes.

### 2.3 Cross-Cutting Engines (new, first-class modules)

| Engine | Purpose | Consumed by |
|---|---|---|
| Status Engine | Derives Generator status from contracts + maintenance + manual override | Generators, Dashboard, Contracts, Reports |
| Contract Conflict Engine | Detects/blocks overlapping generator assignments | Contracts |
| Financial Calculation Engine | Extract totals, VAT, rounding, snapshotting | Extracts, Reports, Dashboard |
| Customer Ledger Engine | Derives balance/statement from Extracts + Receipts + Credit Notes | Customers, Receipts, Dashboard, Reports |
| Fuel Alert Engine | Detects abnormal consumption | Fuel, Notifications, Dashboard |
| Maintenance Schedule Engine | Computes next-due meter/date and overdue state | Maintenance, Notifications, Dashboard |
| Profitability Engine | Aggregates revenue vs. cost per generator/project/customer/period | Generators, Reports, Dashboard |
| Notification Engine | Central alert creation, dedupe, lifecycle | All of the above |
| Audit Engine | Before/after diffing and persistence of sensitive actions | All mutating modules |

---

## 3. Technology Stack

| Layer | Technology | Requirement |
|---|---|---|
| Frontend | Next.js + TypeScript | App Router, Server Components where practical |
| UI | shadcn/ui + Tailwind CSS | Primary and only component system — no MUI/AntD/Chakra/Bootstrap |
| Icons | Lucide React | Consistent icon system |
| Forms | React Hook Form + Zod | Client-side form handling and validation |
| Tables | TanStack Table | Filtering, sorting, pagination, column visibility |
| Charts | Recharts | Dashboard and reporting visualizations |
| Backend | Node.js + Express + TypeScript | REST API |
| Database | MongoDB | Primary persistent data store |
| ODM | Mongoose | Schemas, models, validation, indexes, population |
| Authentication | JWT (access + refresh) via secure httpOnly cookies | Authentication and authorization |
| Caching / temp state | In-memory (process) only | **No Redis. No external cache in V1.** |
| Monetary type | `mongoose.Schema.Types.Decimal128` + `decimal.js` in app code | No native JS float arithmetic for money |
| Validation | Zod (API boundary) + Mongoose (persistence boundary) | Defense in depth |
| Testing | Vitest/Jest + Supertest + Playwright | Unit, API, and E2E testing |
| Package Manager | pnpm (recommended) | Single manager, workspaces for `/backend` and `/frontend` |

**Hard constraints (non-negotiable):**
- Redis MUST NOT be introduced, in any form, for any reason.
- The frontend MUST NEVER open a direct MongoDB connection or import a Mongoose model.
- No deployment/infrastructure sections are defined in this document (out of scope by explicit instruction).

---

## 4. Repository Structure

```
/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── generators/
│   │   │   ├── status-engine/
│   │   │   ├── customers/
│   │   │   ├── projects/
│   │   │   ├── contracts/
│   │   │   ├── contract-conflict-engine/
│   │   │   ├── operations/
│   │   │   ├── fuel/
│   │   │   ├── fuel-alert-engine/
│   │   │   ├── maintenance/
│   │   │   ├── maintenance-schedule-engine/
│   │   │   ├── extracts/
│   │   │   ├── financial-engine/
│   │   │   ├── receipts/
│   │   │   ├── customer-ledger-engine/
│   │   │   ├── expenses/
│   │   │   ├── profitability-engine/
│   │   │   ├── notifications/
│   │   │   ├── audit/
│   │   │   ├── settings/
│   │   │   └── reports/
│   │   ├── middleware/       # auth, error handler, validation, rate limit
│   │   ├── services/         # cross-module shared services (money, pagination, query builder)
│   │   ├── utils/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   │   ├── ui/            # shadcn/ui primitives
│   │   │   ├── layout/        # AppShell, Sidebar, Header, Breadcrumb
│   │   │   ├── data-table/    # shared DataTable system (TASK-005)
│   │   │   ├── forms/         # shared form field wrappers
│   │   │   └── shared/        # StatusBadge, EmptyState, ErrorState, ConfirmDialog
│   │   ├── features/
│   │   │   ├── generators/ customers/ projects/ contracts/ operations/
│   │   │   ├── fuel/ maintenance/ extracts/ receipts/ expenses/ reports/
│   │   │   └── dashboard/ settings/ notifications/ audit/
│   │   ├── lib/                # api-client, formatters (currency/date), query-keys
│   │   ├── hooks/
│   │   └── types/
│   ├── public/
│   ├── package.json
│   └── .env.example
│
├── README.md
└── .gitignore
```

### 4.1 Backend Module Convention

```
module-name/
├── model.ts        # Mongoose schema + model
├── controller.ts   # HTTP only — no calculations, no cross-entity checks
├── service.ts       # business rules, calculations, transactions
├── routes.ts        # endpoint + middleware wiring
├── validation.ts    # Zod schemas for request bodies/params/query
├── types.ts
└── tests/
```

Controllers never import another module's model directly — only that module's service — so business rules stay centralized.

---

## 5. Domain Model

### 5.1 Entity Relationship Overview

```
Customer
  └── Projects
        ├── Generators (via active Contract Items)
        └── Contracts
              └── Contract Items ── Generator

Generator
  ├── Operation Logs
  ├── Fuel Logs
  ├── Maintenance Records
  ├── Contract Items (history)
  └── Profitability (derived)

Customer
  ├── Contracts
  ├── Projects
  ├── Extracts
  ├── Receipts
  └── Ledger / Account Statement (derived)
```

### 5.2 Embedding vs. Referencing Strategy

MongoDB is document-oriented; the model below deliberately does **not** mirror 3NF SQL normalization.

| Decision | Rule |
|---|---|
| Reference (ObjectId) | Used whenever the child is independently queried, paginated, filtered, or grows unbounded over time — Operations, Fuel Logs, Maintenance, Extracts, Receipts, Expenses, Contract Items, Audit Logs. |
| Embed | Used for small, bounded, always-loaded-with-parent sub-documents that never need independent pagination — e.g. `Extract.lineItems[]` (rent/services/transport/discount lines), `Receipt.allocations[]` (which extracts a receipt pays down), `Contract.insurance` (small fixed sub-object), `Generator.specifications` (KVA, brand, model as an embedded object). |
| Snapshot (denormalized copy) | Used whenever a historical/financial document must remain immutable even if the source master record later changes — e.g. `Extract.vatRateSnapshot`, `ContractItem.priceSnapshot`, `Receipt.customerNameSnapshot` for print. Snapshots are written once at creation/approval and never recalculated from the live master record. |

### 5.3 Core Entities

| Entity | Key Fields | Relationships |
|---|---|---|
| Generator | code, kva, brand, model, serialNumber, currentMeter, status, manualStatus, location, normalFuelConsumption, maintenanceCycleHours | → Operations, Fuel, Maintenance, ContractItems |
| Customer | code, companyName, contactPerson, phone, taxNumber, address, active | → Projects, Contracts, Extracts, Receipts |
| Project | code, name, customerId, location, siteManager, startDate, endDate, status | Customer ← ; → Generators (via contracts), Contracts, Operations |
| RentalContract | number, customerId, projectId, startDate, endDate, rentalMethod (monthly/daily/weekly/hourly), status, insurance | → ContractItems |
| ContractItem | contractId, generatorId, billingMethod, unitPrice, priceSnapshot | Contract ←, Generator ← |
| OperationLog | date, projectId, generatorId, startMeter, endMeter, operatingHours, downtimeHours, notes, correctionOf | Project ←, Generator ← |
| FuelLog | date, generatorId, projectId, liters, pricePerLiter, totalCost, operatingHoursRef, consumptionRate | Generator ←, Project ← |
| Maintenance | type (preventive/corrective), status, date, meter, partsCost, oilCost, laborCost, transportCost, totalCost, nextMaintenanceMeter | Generator ← |
| Extract | number, customerId, projectId, contractIds[], period, lineItems[], discounts, vatRateSnapshot, vat, total, status | Customer ←, Project ←, Contract ← |
| Receipt | number, customerId, date, amount, paymentMethod, account, transferNumber, allocations[] | Customer ←, Extract ← (via allocations) |
| Expense | category, date, amount, generatorId?, projectId?, description | Generator ← (optional), Project ← (optional) |
| Notification | type, severity, title, message, entityType, entityId, recipientRoles[], status, dueDate, resolvedAt | polymorphic → any entity |
| User | name, email, passwordHash, role, active, lastLoginAt | → AuditLogs |
| Role | name, permissions[] | referenced by User |
| AuditLog | userId, action, entityType, entityId, before, after, timestamp, ip | User ← |
| SystemSetting | key, value, category | singleton-per-key |

---

## 6. Business Rules

This section is the canonical formula reference. Every task in Section 8 links back here instead of re-deriving formulas.

### 6.1 Generator Status (Status Engine)

**Priority order (highest wins), evaluated on every read via a derived field, recalculated on every write that could affect it:**

1. **Stopped (manual override)** — if `Generator.manualStatus = "Stopped"` is set by an authorized user, status is always `Stopped`, regardless of contracts or maintenance, until explicitly cleared by an authorized user.
2. **Rented** — else if an active RentalContract (`status = Active`, today within `[startDate, endDate]`) has a ContractItem referencing this generator.
3. **Under Maintenance** — else if an open Maintenance record (`status ∈ {Open, In Progress}`) exists for this generator.
4. **Available** — else.

**Ambiguity resolved — "Can a generator be under maintenance while it has an active contract?"**
Recommended rule: the **commercial status** (is it assigned/billable under a contract) and the **operational status** (can it currently run) are tracked separately. `Generator.status` (shown everywhere by default) uses the priority order above, so `Stopped` beats `Rented` beats `Under Maintenance` beats `Available`. In addition, the Generator profile shows a secondary `commercialStatus` flag (`Assigned` / `Unassigned`) derived purely from active contracts, so operations staff can see "under maintenance but still commercially assigned to Contract #123" without ambiguity. Billing is unaffected by operational status — a generator under maintenance while contractually active still accrues rent unless the contract is explicitly paused (out of scope for V1; documented as an Open Decision, see Section 16).

**Manual override interaction:**
- Setting `manualStatus = "Stopped"` does not cancel or pause the underlying contract/maintenance records; it only forces the displayed/derived status.
- Clearing the override (`manualStatus = null`) causes status to immediately re-derive from rule 2–4.
- Setting a generator to `Stopped` while it has an active contract raises a `Notification` (severity: warning) to Operations Manager and Finance Manager, since a stopped-but-billed generator is a business risk that must be visible, not silently allowed.
- A generator cannot be assigned as a new ContractItem while `manualStatus = "Stopped"` unless the user has the `override-stopped-assignment` permission (Admin, Operations Manager) and explicitly confirms via a dialog.

**Conflict resolution table:**

| Active Contract | Open Maintenance | Manual Stopped | Resulting Status |
|---|---|---|---|
| No | No | No | Available |
| No | Yes | No | Under Maintenance |
| Yes | No | No | Rented |
| Yes | Yes | No | Rented (commercialStatus shows "Assigned"; maintenance flag shown as a secondary badge) |
| Any | Any | Yes | Stopped |

### 6.2 Customer Balance / Ledger

```
Customer Balance = Σ Approved Extract Totals − Σ Confirmed Receipts − Σ Credit Notes / Discounts
```
- Only `Extract.status ∈ {Approved, Partially Collected, Collected}` counts toward the ledger; `Draft`/`Under Review` extracts never affect balance.
- Cancelled extracts contribute `0` (reversed), and the cancellation itself is a ledger entry with a reference back to the original for traceability.
- A positive balance = customer owes money. A negative balance = customer has a credit.

### 6.3 Operating Hours

```
Operating Hours = End Meter − Start Meter
```
- `End Meter < Start Meter` is rejected by validation at both Zod (frontend-submitted) and Mongoose (persistence) layers.
- **Ambiguity resolved — authorized correction workflow:** a dedicated `PATCH /api/operations/:id/correct` endpoint (Operations Manager / Admin only) allows correcting a previously-entered meter reading. Corrections never overwrite history in place — they create a new `OperationLog` with `correctionOf` pointing at the original, and the original is flagged `status = Superseded`. Both remain queryable; reports use only the latest non-superseded record per period. Every correction is audited with before/after meter values and a mandatory reason field.

### 6.4 Fuel

```
Fuel Cost = Liters × Price Per Liter
Fuel Consumption Rate = Liters ÷ Operating Hours
```
- If `Operating Hours = 0`: the consumption rate is stored as `null` and displayed as `N/A` — it is never computed as `Infinity` or `0`, and the record is excluded from consumption-rate aggregates (but still included in cost totals).

### 6.5 Fuel Alert (Fuel Alert Engine)

- Trigger condition: `Actual Consumption Rate > Generator.normalFuelConsumption × (1 + tolerancePercent)`.
- **Ambiguity resolved:**
  - **Threshold/tolerance:** configurable in System Settings, default `15%`.
  - **Severity:** `Warning` at 15–30% above normal, `Critical` at >30% above normal.
  - **Lifecycle:** `Open → Acknowledged → Resolved`. An alert auto-resolves if the *next* fuel log for the same generator falls back within tolerance; otherwise it must be manually resolved with a note.
  - **Duplicate prevention:** at most one `Open`/`Acknowledged` alert per generator at a time — a new abnormal reading updates the existing open alert's `lastOccurrenceAt` and `occurrenceCount` rather than creating a duplicate.
  - **Recipients:** Operations Manager, Technician assigned to the generator, System Admin.
  - **Resolution:** manual resolution requires a `resolutionNote`; auto-resolution logs `"auto-resolved: consumption returned to normal range"`.

### 6.6 Maintenance

```
Maintenance Cost = Parts + Oils + Labor + Transport
Next Maintenance Meter = Current Meter (at time of this maintenance) + Maintenance Cycle
```
- `Maintenance Cycle` defaults from `Generator.maintenanceCycleHours` but can be overridden per maintenance type.
- A generator can have at most one `Open`/`In Progress` maintenance record at a time (enforced uniquely).

### 6.7 Extract (Financial Calculation Engine)

```
Total Work = Rent + Transport + Services
Net Before VAT = Total Work − Discounts
VAT = Net Before VAT × VAT Rate (snapshot)
Final Total = Net Before VAT + VAT
```
- `Net Before VAT` cannot go negative; if `Discounts > Total Work`, validation rejects the extract with `422` and a specific field error — this is not silently clamped to zero.
- The VAT rate is read from `SystemSetting("vatRate")` **only at Draft→Approved transition** and copied into `Extract.vatRateSnapshot`. All later display/recalculation for that extract uses the snapshot, never the live setting.
- Rounding: all intermediate and final monetary values are rounded to **2 decimal places, ROUND_HALF_UP**, using `decimal.js`, applied once at the final step of each formula — never rounded mid-calculation.

### 6.8 Generator Profitability (Profitability Engine)

```
Generator Revenue = Σ Rental Revenue attributable to the generator for the period
Generator Cost = Fuel + Maintenance + Transport + Labor + Parts (attributable to the generator for the period)
Net Profit = Generator Revenue − Generator Cost
```
- **Ambiguity resolved — shared/indirect expense allocation:** `Expense` records with no `generatorId` (e.g. yard rent, shared truck fuel) are **never** silently divided across generators. They are surfaced separately as "Unallocated Expenses" in the Profitability and Profit & Expense Summary reports, and only affect **project-level** or **company-level** profitability, not individual Generator Net Profit, unless a user explicitly runs an "Allocate Shared Expense" action that splits a shared expense across a chosen set of generators/projects (even split or manual percentages), which then creates real per-generator `Expense` records referencing the original as `allocatedFrom`. This keeps generator-level profit auditable and prevents arbitrary allocation assumptions.

### 6.9 Contract Conflict (Contract Conflict Engine)

- A generator cannot be an active `ContractItem` on two contracts whose date ranges overlap, **unless** the overlap is explicitly approved as a "Shared Assignment" (rare, e.g. split-day sub-rental) by an Admin, which is logged as an explicit business exception, not a silent allowance.
- Overlap check: `existing.startDate <= new.endDate AND existing.endDate >= new.startDate`, evaluated only against contracts in `{Draft(if pending activation), Active}` — `Cancelled`/`Expired` contracts never block.
- Draft contracts do **not** block assignment for other draft contracts (so multiple drafts can be prepared in parallel); the conflict check is enforced hard only at the `Draft → Active` transition, with a soft warning shown at Draft creation time.

### 6.10 Contract Pricing (Contract Pricing Engine)

Supports **Monthly / Daily / Weekly / Hourly** billing methods per Contract Item:
- Monthly: `unitPrice × number of billed months in period (pro-rated for partial months by day-count)`.
- Daily: `unitPrice × days in period`.
- Weekly: `unitPrice × (days in period ÷ 7)`, rounded per system rounding rule.
- Hourly: `unitPrice × Σ Operating Hours in period` (pulled from Operation Logs, not manually re-entered).
- The computed price feeds the Extract's `Rent` line item; the formula used and its inputs are stored on the Extract line item for traceability (`calculationBreakdown` field).


---

## 7. Roles & Permissions

### 7.1 Roles

| Role | Summary |
|---|---|
| System Admin | Full access — users, roles, settings, audit, all CRUD, overrides |
| Operations Manager | Generators, projects, contracts, operations, fuel, maintenance, stopped/override actions |
| Finance Manager | Customers, extracts, receipts, expenses, statements, financial reports, VAT settings |
| Accountant | Extracts, receipts, customer statements, expenses (no settings, no user management) |
| Technician | Operation/fuel/fault/maintenance entries for assigned generators only |
| Viewer | Read-only access to permitted modules and reports |

Authorization is enforced **at the API level** via a `requirePermission(permissionKey)` middleware on every route. Hiding a button in the UI is never treated as security.

### 7.2 Global Permission Matrix (summary — module matrices in each task repeat the relevant rows)

| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| Manage Users/Roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage Generators | ✅ | ✅ | ❌ | ❌ | ❌ | 👁 |
| Manage Customers/Projects | ✅ | ✅ | ✅ | ❌ | ❌ | 👁 |
| Manage Contracts | ✅ | ✅ | ❌ | ❌ | ❌ | 👁 |
| Record Operations/Fuel/Maintenance | ✅ | ✅ | ❌ | ❌ | ✅ (assigned only) | 👁 |
| Override Generator Stopped/Assignment | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create/Approve Extracts | ✅ | ❌ | ✅ | ✅ (create only) | ❌ | 👁 |
| Record Receipts | ✅ | ❌ | ✅ | ✅ | ❌ | 👁 |
| Manage Expenses | ✅ | ❌ | ✅ | ✅ | ❌ | 👁 |
| View Profitability/Dashboard/Reports | ✅ | ✅ | ✅ | ✅ | ❌ | 👁 |
| System Settings | ✅ | ❌ | ✅ (VAT/finance settings only) | ❌ | ❌ | ❌ |
| View Audit Log | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

✅ = full access · 👁 = read-only · ❌ = no access


---

## 8. Implementation Tasks

Tasks are ordered for sequential execution. Each depends only on earlier tasks (or is explicitly cross-referenced).

# TASK-001 — Repository & Monorepo Foundation

## 1. Objective
Stand up the two-application repository (`/backend`, `/frontend`) with TypeScript, linting, formatting, environment templates, and scripts, so every later task starts from a working, buildable baseline.

## 2. Business Purpose
Without a consistent foundation, every later feature re-solves tooling problems, causing inconsistent code style and slower onboarding.

## 3. User Story
As a **Developer**, I want a ready-to-run monorepo skeleton, so that I can start implementing features immediately without setup ambiguity.

## 4. Actors
- Developer / DevOps (setup only — no end-user role interacts with this task)

## 5. Preconditions
None — this is the first task.

## 6. Scope
- `/backend` and `/frontend` folders with independent `package.json`.
- Shared root `.gitignore`, `README.md`, root scripts (`dev`, `build`, `lint`, `test`) via pnpm workspaces.
- TypeScript configs (`tsconfig.json`) for both apps, strict mode enabled.
- ESLint + Prettier configuration shared via a root config, extended per app.
- `.env.example` for both apps enumerating every required variable (no real secrets committed).

## 7. Out of Scope
- Any CI/CD or deployment pipeline configuration.
- Any actual feature code.
- Docker or containerization (deployment is explicitly out of scope for this PRD).

## 8. Functional Requirements
- FR-001: Running `pnpm install` at the repo root installs both apps' dependencies.
- FR-002: Running `pnpm --filter backend dev` starts the Express dev server with hot reload.
- FR-003: Running `pnpm --filter frontend dev` starts the Next.js dev server.
- FR-004: `pnpm lint` and `pnpm typecheck` succeed with zero errors on the empty skeleton.

## 9. Business Rules
N/A — this task carries no business logic.

## 10. Data Model
N/A — no persistence in this task.

## 11. Backend Architecture
- `backend/src/app.ts` (Express app factory, no listen), `backend/src/server.ts` (listen + graceful shutdown), `backend/src/config/` (env loader with validation).

## 12. API Specification
N/A — no endpoints yet beyond the health check defined in TASK-002.

## 13. Frontend Requirements
- Next.js App Router skeleton with a placeholder `/` route.

## 14. Page Structure
N/A.

## 15. UX Behavior
N/A.

## 16. Validation Rules
- Environment variable loader must fail fast (process exit with a clear message) if a required variable is missing.

## 17. Permissions
N/A.

## 18. State Management
N/A.

## 19. Error Handling
- Missing/invalid `.env` values produce a single clear startup error, not a silent default.

## 20. Edge Cases
- Node version mismatch → document required Node version in README and fail with a clear engine-check error (`package.json engines` field).
- Developer running backend without `.env` present → clear instruction to copy `.env.example`.

## 21. Audit Requirements
N/A.

## 22. Notifications
N/A.

## 23. Reporting Impact
N/A.

## 24. Testing Requirements
- **Unit**: env loader validation.
- **API**: N/A.
- **E2E**: N/A.
- **Permission**: N/A.
- **Edge Case**: missing env var causes startup failure test.

## 25. Acceptance Criteria
- Given a fresh clone, when `pnpm install && pnpm --filter backend dev` runs, then the process starts without error.
- Given a required env var is removed, when the backend starts, then it exits with a descriptive error referencing the missing key.

## 26. Dependencies
None.

## 27. Deliverables
- Repo skeleton, tsconfig, eslint/prettier config, `.env.example` (both apps), README with setup instructions.

## 28. Definition of Done
- Both apps build and lint clean; README lets a new developer run the project in under 10 minutes.

---

# TASK-002 — Backend Express Foundation & API Response Standard

## 1. Objective
Provide the Express application skeleton: routing conventions, centralized error middleware, request logging, config loading, the standardized API response envelope, and a health-check endpoint.

## 2. Business Purpose
A consistent response/error contract lets the frontend and every future integration parse responses uniformly, and lets errors be triaged from logs without guessing shapes.

## 3. User Story
As a **Developer**, I want a standard API envelope and centralized error handling, so that every module returns predictable, parseable responses.

## 4. Actors
Developer (infrastructure only).

## 5. Preconditions
TASK-001 complete.

## 6. Scope
- Standard success/error envelope (see Section 11 "API Standards" for the canonical shape).
- Global error-handling middleware translating thrown `AppError` subclasses (`ValidationError`, `NotFoundError`, `ConflictError`, `AuthError`, `ForbiddenError`) into correct HTTP codes + envelope.
- Request logging middleware (method, path, status, duration, userId when available).
- `GET /api/health` returning service + DB connectivity status.
- CORS configuration restricted to the frontend origin(s) from env config.
- Security headers (helmet-equivalent).

## 7. Out of Scope
- Business modules (generators, customers, etc.) — those are separate tasks.
- Rate limiting (delivered in TASK-034).

## 8. Functional Requirements
- FR-001: Every route response conforms to `{ success, data, message, meta }` or `{ success:false, data:null, message, errors[] }`.
- FR-002: Unhandled exceptions are caught and never leak stack traces to the client in production mode.
- FR-003: `GET /api/health` returns `200` with `{ db: "connected" }` when MongoDB is reachable, `503` otherwise.

## 9. Business Rules
N/A.

## 10. Data Model
N/A (no domain persistence yet).

## 11. Backend Architecture
- `middleware/errorHandler.ts`, `middleware/requestLogger.ts`, `utils/AppError.ts` (typed error hierarchy), `utils/responseEnvelope.ts`.

## 12. API Specification
### Method: GET
### Endpoint: `/api/health`
### Purpose: Liveness/readiness probe for local/dev monitoring only (no infra automation implied).
### Authentication: Not required
### Permissions: Public
### Query Parameters: None
### Request Body: None
### Response:
```json
{ "success": true, "data": { "status": "ok", "db": "connected" }, "message": null, "meta": {} }
```
### Errors: `503` with `db: "disconnected"` when MongoDB is unreachable.

## 13. Frontend Requirements
N/A (consumed later by every feature).

## 14. Page Structure
N/A.

## 15. UX Behavior
N/A.

## 16. Validation Rules
- Every 4xx must include machine-readable `errors: [{ field, message }]` when field-level.

## 17. Permissions
N/A at this stage (auth introduced in TASK-006).

## 18. State Management
N/A.

## 19. Error Handling
- `ValidationError` → 422, `NotFoundError` → 404, `ConflictError` → 409, `AuthError` → 401, `ForbiddenError` → 403, unknown → 500 (logged with stack server-side only).

## 20. Edge Cases
- Malformed JSON body → 400 with a generic "invalid JSON body" message (not a 500).
- DB disconnects mid-request → 503 surfaced consistently, not a raw driver error.

## 21. Audit Requirements
N/A.

## 22. Notifications
N/A.

## 23. Reporting Impact
N/A.

## 24. Testing Requirements
- **API**: health check under DB up/down; malformed JSON body; thrown `AppError` subclasses map to correct codes.
- **Unit**: envelope builder, `AppError` hierarchy.

## 25. Acceptance Criteria
- Given MongoDB is down, when `GET /api/health` is called, then response is `503` with `db: "disconnected"`.
- Given any thrown `ValidationError`, when a route handler passes it to `next()`, then the response is `422` with an `errors[]` array.

## 26. Dependencies
TASK-001.

## 27. Deliverables
- Express app skeleton, error middleware, envelope utility, health endpoint, request logger.

## 28. Definition of Done
- All error paths tested; envelope shape identical across every error type; no stack traces leak in production responses.

---

# TASK-003 — MongoDB & Mongoose Foundation

## 1. Objective
Establish the MongoDB connection lifecycle, base schema conventions (timestamps, soft-delete flag, decimal handling), the index strategy, and a reusable pagination/query-builder service used by every module.

## 2. Business Purpose
Consistent schema conventions prevent every module from re-inventing pagination, soft delete, or timestamp handling differently, which would otherwise cause inconsistent list/report behavior.

## 3. User Story
As a **Developer**, I want shared Mongoose conventions and a query-builder service, so that every list endpoint behaves identically (pagination, filtering, sorting).

## 4. Actors
Developer (infrastructure only).

## 5. Preconditions
TASK-002.

## 6. Scope
- Mongoose connection module with retry/backoff and connection-state exposure (used by `/api/health`).
- `BaseSchemaFields` mixin: `createdAt`, `updatedAt` (via `timestamps: true`), `isDeleted: Boolean (default false)`, `deletedAt`.
- Shared `paginateQuery(model, filters, { page, limit, sort })` service returning `{ items, meta: { page, limit, total, totalPages } }`.
- Shared `MoneyType` helper (Decimal128 read/write + `decimal.js` conversion utilities: `toDecimal`, `toDisplayString`, `roundMoney`).
- Index-naming convention documented (see Section 12 "Database Standards").

## 7. Out of Scope
- Domain-specific schemas (delivered per-module in later tasks).

## 8. Functional Requirements
- FR-001: `paginateQuery` enforces a max `limit` (default 20, max 100) to prevent unbounded loads.
- FR-002: All queries default to excluding `isDeleted: true` documents unless `includeDeleted` is explicitly passed (Admin-only contexts).
- FR-003: `MoneyType` never produces a native JS float in application logic; all arithmetic goes through `decimal.js`.

## 9. Business Rules
- Soft delete is the default deletion strategy for any entity referenced by financial or operational history (generators, customers, projects, contracts) — see Section 12 for the full soft-delete rule.

## 10. Data Model
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| createdAt | Date | auto | now | — | Mongoose `timestamps` |
| updatedAt | Date | auto | now | — | Mongoose `timestamps` |
| isDeleted | Boolean | No | false | — | Soft-delete flag |
| deletedAt | Date | No | null | — | Set on soft delete |

## 11. Backend Architecture
- `config/database.ts` (connection), `services/pagination.ts`, `services/money.ts`, `middleware/softDeleteFilter.ts` (query helper, not a hard filter, applied explicitly per service call for clarity).

## 12. API Specification
N/A — this task ships internal services, not endpoints.

## 13. Frontend Requirements
N/A.

## 14. Page Structure
N/A.

## 15. UX Behavior
N/A.

## 16. Validation Rules
- `limit` query param clamps silently to `[1, 100]`; `page` clamps to `>= 1`.

## 17. Permissions
N/A.

## 18. State Management
N/A.

## 19. Error Handling
- Invalid `sort` field name (not in an allow-list per module) → `422 ValidationError`, never a raw Mongo cast error.

## 20. Edge Cases
- Sorting by a field with a `Decimal128` type must use correct BSON comparison, verified with a dedicated test.
- Pagination beyond `totalPages` returns an empty `items` array with correct `meta`, not an error.

## 21. Audit Requirements
N/A (audit engine is TASK-031; this task only exposes the plumbing every module's audit hook will use).

## 22. Notifications
N/A.

## 23. Reporting Impact
Every report/list endpoint in this PRD is built on `paginateQuery`, guaranteeing consistent server-side filtering/sorting behavior.

## 24. Testing Requirements
- **Unit**: pagination clamp behavior, money rounding (half-up), Decimal128 ↔ decimal.js round-trip.
- **API**: N/A (no endpoints yet).

## 25. Acceptance Criteria
- Given `limit=500` is requested, when any list endpoint built on `paginateQuery` runs, then at most 100 items are returned.
- Given two Decimal128 values `10.005` and `10.01`, when compared via the money utility, then rounding follows ROUND_HALF_UP consistently.

## 26. Dependencies
TASK-002.

## 27. Deliverables
- Database connection module, pagination service, money utility, base schema mixin.

## 28. Definition of Done
- Every later module's list endpoint uses `paginateQuery` (verified in code review checklist); money utility has 100% branch coverage on rounding logic.

---

# TASK-004 — Frontend UI Foundation (shadcn/ui, Tailwind, RTL, AppShell)

## 1. Objective
Install and configure shadcn/ui + Tailwind CSS, establish Arabic RTL support, and build the application shell (Sidebar, Header, Breadcrumb, PageHeader) and shared visual primitives used by every feature.

## 2. Business Purpose
The business's primary operators work in Arabic; a correct RTL foundation from day one avoids costly retrofits, and a shared shell keeps every module visually consistent.

## 3. User Story
As any **authenticated user**, I want a consistent, RTL-correct application shell, so that every screen feels like one coherent product.

## 4. Actors
All roles (shell is universal).

## 5. Preconditions
TASK-001.

## 6. Scope
- Tailwind + shadcn/ui installed and themed (enterprise, data-dense visual direction per Section 13).
- `dir="rtl"` support driven by a locale/direction context, with logical CSS properties (`ms-*`/`me-*` instead of `ml-*`/`mr-*`) enforced via lint rule.
- AppShell: collapsible Sidebar (module navigation), Header (user menu, notifications bell), Breadcrumb, PageHeader (title + primary action slot).
- Shared primitives: `StatusBadge`, `EmptyState`, `ErrorState` (with retry), `ConfirmDialog`, `LoadingSkeleton` variants.

## 7. Out of Scope
- Feature pages themselves.
- Data fetching (TASK-005).

## 8. Functional Requirements
- FR-001: Switching direction to RTL mirrors the entire shell layout (sidebar side, icons, chevrons) without visual breakage.
- FR-002: Every data screen has an available `EmptyState` and `ErrorState` variant ready to use.
- FR-003: Destructive actions across the app use the shared `ConfirmDialog`, never a native `confirm()`.

## 9. Business Rules
N/A.

## 10. Data Model
N/A.

## 11. Backend Architecture
N/A.

## 12. API Specification
N/A.

## 13. Frontend Requirements
- Components: `AppShell`, `Sidebar`, `Header`, `Breadcrumb`, `PageHeader`, `StatusBadge`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `Skeleton` variants — all shadcn/ui-based.

## 14. Page Structure
```
AppShell
 ├── Sidebar (module nav, active-state highlighting)
 ├── Header
 │    ├── Breadcrumb
 │    ├── Search (global, wired in TASK-005)
 │    ├── Notifications bell
 │    └── User menu
 └── Main
      └── PageHeader (title, breadcrumb, primary action)
           └── {page content}
```

## 15. UX Behavior
- Sidebar collapses on tablet; bottom-tab-equivalent pattern reserved for mobile operational screens (Operations/Fuel entry).
- Skeleton shown for a minimum of 300ms to avoid flicker on fast responses; real loading state otherwise.

## 16. Validation Rules
N/A.

## 17. Permissions
- Sidebar renders only the modules the logged-in role has at least read access to (uses the permission matrix from Section 7; enforced additionally at the API level per module).

## 18. State Management
- Direction/locale in a lightweight context; no business data cached here (see TASK-005 for server state).

## 19. Error Handling
- Shell-level error boundary renders `ErrorState` with a "Reload" action rather than a blank screen.

## 20. Edge Cases
- User with zero accessible modules (misconfigured role) sees a clear "no access" screen, not an empty sidebar with no explanation.
- Very long breadcrumb/page titles truncate with an accessible tooltip.

## 21. Audit Requirements
N/A.

## 22. Notifications
- Bell icon and dropdown shell are built here; wiring to real data is TASK-026.

## 23. Reporting Impact
N/A.

## 24. Testing Requirements
- **E2E**: RTL toggle renders mirrored layout; sidebar filters by role.
- **Unit**: EmptyState/ErrorState render with provided props.

## 25. Acceptance Criteria
- Given a Viewer role, when the shell loads, then only Viewer-permitted modules appear in the sidebar.
- Given `dir="rtl"`, when any shell screen renders, then icons/paddings mirror correctly (no literal `ml-`/`mr-` regressions).

## 26. Dependencies
TASK-001.

## 27. Deliverables
- Configured Tailwind/shadcn, AppShell and shared primitive components, RTL support.

## 28. Definition of Done
- Shell renders correctly in both LTR and RTL; shared primitives documented and used consistently (verified against later tasks' UI sections).

---

# TASK-005 — Shared Frontend Data Table & API Client System

## 1. Objective
Build the reusable `DataTable` system (TanStack Table wrapper with server-side pagination/sort/filter/search) and the typed API client used by every feature module, so no feature reimplements list-fetching or table plumbing.

## 2. Business Purpose
Nearly every screen in this product is a filterable, sortable, paginated list. A single well-built abstraction guarantees consistent UX and prevents 15+ modules from diverging in behavior and bugs.

## 3. User Story
As a **Developer**, I want a shared DataTable and API client, so that every list screen (generators, customers, contracts, extracts, …) behaves identically and is quick to build.

## 4. Actors
Developer (infrastructure); indirectly all end users via consistent UX.

## 5. Preconditions
TASK-002, TASK-003, TASK-004.

## 6. Scope
- `lib/apiClient.ts`: typed `fetch` wrapper unwrapping the standard envelope, attaching auth cookie, mapping envelope errors to typed exceptions, handling 401 → redirect-to-login.
- `components/data-table/DataTable.tsx`: columns, server pagination, server sort, column visibility, row actions, bulk-select scaffold.
- Shared filter primitives: `SearchInput` (debounced), `DateRangeFilter`, `StatusFilter`, `SelectFilter` — all writing to URL query params so filters are shareable/bookmarkable.
- `hooks/useDataTableQuery.ts` combining URL state + API client + TanStack Query (or SWR) caching.

## 7. Out of Scope
- Any feature-specific columns or filters (defined per feature task).

## 8. Functional Requirements
- FR-001: DataTable always requests server-side pagination; client-side "load all" is prohibited.
- FR-002: Filter/sort state is reflected in the URL so a refresh or shared link reproduces the same view.
- FR-003: API client automatically retries a request once on network failure (not on 4xx/5xx business errors).
- FR-004: A 401 response from any call triggers a single centralized redirect to `/login`, not a per-page handler.

## 9. Business Rules
N/A.

## 10. Data Model
N/A (frontend-only).

## 11. Backend Architecture
N/A.

## 12. API Specification
N/A (consumes existing/future envelope contract).

## 13. Frontend Requirements
- Components: `DataTable`, `SearchInput`, `DateRangeFilter`, `StatusFilter`, `SelectFilter`, `Pagination` (shadcn), `ColumnVisibilityMenu`.

## 14. Page Structure
```
Filters bar (Search, Status, DateRange, custom filters)
DataTable (Skeleton | Empty | Error | Rows)
Pagination footer (page size, page nav, total count)
```

## 15. UX Behavior
- Skeleton rows shown while loading; `EmptyState` with contextual "Create" CTA when zero results and no filters applied; a distinct "No results match your filters" state (with "Clear filters") when filters are active and zero results.
- Sorting toggles: unsorted → ascending → descending → unsorted.

## 16. Validation Rules
- Date range filter enforces `from <= to`; invalid ranges disable the Apply action rather than submitting.

## 17. Permissions
N/A (table shell is permission-agnostic; each feature applies row-action visibility per its own matrix).

## 18. State Management
- Filter/sort/page state lives in the URL (source of truth); fetched data lives in query-cache (TanStack Query), never duplicated into ad hoc component state.

## 19. Error Handling
- Non-200 list response renders `ErrorState` with a "Retry" button that re-issues the same query.

## 20. Edge Cases
- Extremely long text in a cell truncates with a tooltip.
- Rapid filter changes are debounced so intermediate requests are cancelled, not queued.

## 21. Audit Requirements
N/A.

## 22. Notifications
N/A.

## 23. Reporting Impact
The same DataTable/query hook is reused by the Reports Center (TASK-028) for tabular report output before export.

## 24. Testing Requirements
- **Unit**: URL-state sync, filter validation, sort-cycle logic.
- **E2E**: paginating, sorting, and filtering a representative table updates the URL and results correctly.

## 25. Acceptance Criteria
- Given a filtered, sorted, paginated table view, when the page is refreshed, then the exact same view is reproduced from the URL.
- Given a 500 response from the list endpoint, when DataTable renders, then `ErrorState` with Retry is shown, not a blank table.

## 26. Dependencies
TASK-002, TASK-003, TASK-004.

## 27. Deliverables
- API client, DataTable system, filter primitives, `useDataTableQuery` hook.

## 28. Definition of Done
- At least one real module (Generators, TASK-008) is wired end-to-end through this system as a reference implementation.

---

# TASK-006 — Authentication & RBAC

## 1. Objective
Implement login/logout, password hashing, JWT (access + refresh) via secure httpOnly cookies, the `User`/`Role` models, and the `requirePermission` authorization middleware enforced on every protected route.

## 2. Business Purpose
The system holds financial and operational data across roles with different trust levels; authentication and enforced authorization are prerequisites for every other module.

## 3. User Story
As a **System Admin**, I want to create users with specific roles, so that each employee can only perform actions appropriate to their job.

## 4. Actors
System Admin (user management); all roles (login).

## 5. Preconditions
TASK-002, TASK-003.

## 6. Scope
- `User` model (name, email, passwordHash, role, active, lastLoginAt).
- `Role` → permission-key list (matches Section 7 matrix), seedable, editable by Admin only.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/refresh`.
- `requireAuth` middleware (verifies access token) and `requirePermission(key)` middleware.
- Password hashing via bcrypt/argon2 (cost factor configurable via env).

## 7. Out of Scope
- User self-service password reset via email (documented as an Open Decision, Section 16 — requires an email provider decision out of scope here).
- Multi-factor authentication (future enhancement, not required for V1).

## 8. Functional Requirements
- FR-001: Login with correct credentials sets an httpOnly, `Secure`, `SameSite=Strict` access-token cookie and a longer-lived refresh-token cookie.
- FR-002: Login with incorrect credentials returns `401` with a generic "invalid credentials" message (never reveals whether the email exists).
- FR-003: An inactive user (`active:false`) cannot log in even with correct credentials (`403 account disabled`).
- FR-004: `requirePermission("generators:write")` rejects with `403` any user whose role lacks that permission key.
- FR-005: Access tokens expire in 15 minutes; `POST /api/auth/refresh` issues a new pair using a valid refresh token; refresh tokens are rotated on use.

## 9. Business Rules
- A role's permission set is the single source of truth server-side; the frontend's rendering of role-based UI (Section 7 matrix) is a convenience only.
- Deactivating a user immediately invalidates their active sessions (refresh token lookups check `active` on every refresh).

## 10. Data Model — User
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| name | String | Yes | — | 2–100 chars | Display name |
| email | String | Yes | — | valid email, unique index | Login identifier |
| passwordHash | String | Yes | — | never returned in API responses | bcrypt/argon2 hash |
| role | ObjectId → Role | Yes | — | must reference existing Role | RBAC role |
| active | Boolean | No | true | — | Deactivation flag |
| lastLoginAt | Date | No | null | — | Audit convenience |

### Data Model — Role
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| name | String | Yes | — | unique | e.g. "Operations Manager" |
| permissions | [String] | Yes | [] | must be from the known permission-key enum | Enforced server-side |

Indexes: `User.email` unique; `Role.name` unique.

## 11. Backend Architecture
- `modules/auth/{model,controller,service,routes,validation}.ts`, `modules/users/*`, `middleware/requireAuth.ts`, `middleware/requirePermission.ts`, `utils/jwt.ts`, `utils/password.ts`.

## 12. API Specification
### Method: POST · Endpoint: `/api/auth/login`
Purpose: authenticate and issue session cookies. Auth: not required. Permissions: public.
Request Body: `{ "email": "string", "password": "string" }`
Response:
```json
{ "success": true, "data": { "user": { "id": "..", "name": "..", "role": "Operations Manager" } }, "message": null, "meta": {} }
```
Errors: `401` invalid credentials, `403` account disabled, `422` malformed body.

### Method: GET · Endpoint: `/api/auth/me`
Purpose: return current session user. Auth: required. Permissions: any authenticated user.
Response: `{ "success": true, "data": { "id","name","email","role","permissions":[...] } }`
Errors: `401` no/expired session.

### Method: POST · Endpoint: `/api/auth/logout`
Purpose: clear session cookies. Auth: required.
Response: `{ "success": true, "data": null }`

### Method: POST · Endpoint: `/api/auth/refresh`
Purpose: rotate access token using refresh cookie. Auth: refresh cookie required.
Errors: `401` invalid/expired/reused refresh token (reuse triggers full session revocation as a security measure).

## 13. Frontend Requirements
- `/login` page (shadcn `Card`, `Input`, `Button`, `Form` + Zod), auth context/hook (`useAuth`), route guard wrapper redirecting unauthenticated users to `/login`.
- Admin-only `Users` and `Roles` management screens (DataTable + Dialog forms) under Settings.

## 14. Page Structure
```
/login
 └── Card: email, password, submit, inline error

/settings/users
 └── DataTable (name, email, role, active, actions)
 └── Dialog: create/edit user (role select)

/settings/roles
 └── DataTable (role name, permission count)
 └── Dialog: edit permissions (checkbox matrix matching Section 7)
```

## 15. UX Behavior
- Invalid login shows an inline, generic error banner; no field-level "email not found" leakage.
- Session expiry (401 anywhere) triggers a toast ("Session expired, please sign in again") then redirect.
- Deactivating a user requires `ConfirmDialog`.

## 16. Validation Rules
- Email: valid format, required. Password: required, min 8 chars at creation.
- Role permission edits: at least one permission required per role (a role with zero permissions is rejected).

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| Login | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage Roles/Permissions | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Session/user identity in an auth context populated from `/api/auth/me` on app load; no permissions cached longer than the session.

## 19. Error Handling
- Expired/invalid JWT → `401`, handled globally by the API client (TASK-005) via redirect.
- Refresh-token reuse detected → all sessions for that user revoked, logged as a security event.

## 20. Edge Cases
- Deactivating the currently-logged-in Admin (self-deactivation) is blocked with a clear error, to avoid full lockout.
- Deleting the last Admin account is blocked.
- Role permission change while a user is mid-session takes effect on next token refresh (max 15 min), documented as expected behavior, not a bug.

## 21. Audit Requirements
- Login success/failure, logout, user create/update/deactivate, role permission changes — all audited (Section 8, TASK-031 stores them).

## 22. Notifications
N/A for this task (security alerting is out of scope for V1).

## 23. Reporting Impact
N/A directly; every report's access is gated by this module's permissions.

## 24. Testing Requirements
- **Unit**: password hashing, JWT sign/verify, permission-key matching.
- **API**: login success/failure/disabled-account, refresh rotation, reuse detection, `requirePermission` blocking unauthorized roles on a sample protected route.
- **E2E**: login → land on dashboard; logout → redirected to login; Viewer cannot see write actions.
- **Permission**: every role's matrix row tested against at least one real protected endpoint once available.

## 25. Acceptance Criteria
- Given valid credentials, when logging in, then the user lands on the dashboard with session cookies set.
- Given an invalid password, when logging in, then a generic `401` error is shown, not "wrong password" specifically.
- Given a Viewer role, when calling a write endpoint directly, then the API returns `403` regardless of frontend state.

## 26. Dependencies
TASK-002, TASK-003.

## 27. Deliverables
- Auth module, Users/Roles module, auth middleware, login page, Users/Roles admin screens.

## 28. Definition of Done
- All roles from Section 7 exist as seed data; every later module's routes are wrapped in `requirePermission`.

---

# TASK-007 — Seed & Demo Data Framework

## 1. Objective
Provide a repeatable seeding script that creates baseline reference data (roles, an initial Admin user, system settings defaults) and optional realistic demo data (generators, customers, contracts) for development/QA environments.

## 2. Business Purpose
Every later task and QA cycle needs a known, reproducible starting dataset; without it, testing contract conflicts, ledgers, and dashboards is unreliable.

## 3. User Story
As a **Developer/QA**, I want a single seed command, so that I can reset to a known-good dataset for testing.

## 4. Actors
Developer/QA (tooling only).

## 5. Preconditions
TASK-003, TASK-006.

## 6. Scope
- `pnpm --filter backend seed` runs a script that: creates the 6 roles from Section 7, one Admin user, default `SystemSetting` values (VAT rate 14%, currency EGP, fuel tolerance 15%), and is idempotent (safe to re-run).
- Separate `pnpm --filter backend seed:demo` adds representative demo data across generators/customers/projects/contracts for manual QA and screenshots — clearly separated from the required baseline seed so production never accidentally loads demo data.

## 7. Out of Scope
- Any production data migration tooling.

## 8. Functional Requirements
- FR-001: Baseline seed is idempotent — re-running does not create duplicate roles/settings.
- FR-002: Demo seed is guarded behind an explicit `--demo` flag and refuses to run when `NODE_ENV=production`.

## 9. Business Rules
N/A.

## 10. Data Model
N/A (uses existing models from other tasks; this task only populates them).

## 11. Backend Architecture
- `scripts/seed/baseline.ts`, `scripts/seed/demo.ts`.

## 12. API Specification
N/A — CLI script, not an HTTP endpoint.

## 13. Frontend Requirements
N/A.

## 14. Page Structure
N/A.

## 15. UX Behavior
N/A.

## 16. Validation Rules
- Demo seed refuses to run outside `development`/`test` environments.

## 17. Permissions
N/A (CLI-only, run by developers, not end users).

## 18. State Management
N/A.

## 19. Error Handling
- Script exits non-zero with a clear message on partial failure so CI doesn't report false success.

## 20. Edge Cases
- Re-running baseline seed after a role's permissions were manually edited in the DB must not silently overwrite the manual edit — baseline seed only creates missing roles, never overwrites existing ones with the same name.

## 21. Audit Requirements
- Seed-created records are marked with a system actor in the audit log (not attributed to a real user).

## 22. Notifications
N/A.

## 23. Reporting Impact
N/A.

## 24. Testing Requirements
- **Unit**: idempotency check (run twice, assert no duplicates).

## 25. Acceptance Criteria
- Given an empty database, when `seed` runs, then all 6 roles, one Admin user, and default settings exist.
- Given `NODE_ENV=production`, when `seed:demo` is invoked, then it exits with an error and creates nothing.

## 26. Dependencies
TASK-003, TASK-006.

## 27. Deliverables
- Baseline and demo seed scripts, documented in README.

## 28. Definition of Done
- QA can reset to a known state in one command; CI uses baseline seed before running API/E2E suites.


---

# TASK-008 — Generator Management

## 1. Objective
Implement full CRUD and profile management for Generators: specifications, current meter, location, normal fuel consumption, and maintenance cycle — the master record every operational module attaches to.

## 2. Business Purpose
The Generator is the company's core rental asset; accurate master data (specs, meter, thresholds) underlies status, fuel alerts, maintenance scheduling, and profitability.

## 3. User Story
As an **Operations Manager**, I want to register and manage generator records, so that the fleet is accurately tracked and every downstream module has correct reference data.

## 4. Actors
System Admin, Operations Manager (write); Technician, Finance Manager, Accountant, Viewer (read).

## 5. Preconditions
TASK-002–006 complete.

## 6. Scope
- Generator CRUD (create, list, view, update).
- Specifications sub-object (kva, brand, model, serialNumber).
- `currentMeter`, `location`, `normalFuelConsumption`, `maintenanceCycleHours`.
- `manualStatus` field (null | "Stopped") writable only via a dedicated stop/resume action (not a generic PATCH), consumed by the Status Engine (TASK-011).
- Generator profile page with tabs: Overview, Operations, Fuel, Maintenance, Contracts, Profitability (the latter four render data owned by their respective tasks).

## 7. Out of Scope
- Derived `status` calculation logic (TASK-011).
- Operation/Fuel/Maintenance/Contract data entry (their own tasks) — this task only renders their read-only history inside the profile tabs it does not own the write path for.

## 8. Functional Requirements
- FR-001: Creating a generator requires a unique `code`.
- FR-002: `currentMeter` can only increase via Operation Log entries (TASK-013), never edited directly on the Generator form after creation, except an Admin-only initial-meter correction with mandatory reason (audited).
- FR-003: List view supports search (code, brand, model, serial), status filter, location filter.
- FR-004: Soft-deleting (deactivating) a generator with an active contract or open maintenance is blocked with a clear error.

## 9. Business Rules
- Status is never stored as a free-editable field — see TASK-011 for the full derivation; this task only owns `manualStatus` (the Stopped override input) and specification fields.
- `normalFuelConsumption` and `maintenanceCycleHours` are the baseline inputs to the Fuel Alert Engine (6.5) and Maintenance Schedule Engine (6.6), respectively.

## 10. Data Model — Generator
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| code | String | Yes | — | unique, 2–20 chars | Business identifier |
| specifications.kva | Number | Yes | — | > 0 | Rated capacity |
| specifications.brand | String | Yes | — | 1–50 chars | — |
| specifications.model | String | Yes | — | 1–50 chars | — |
| specifications.serialNumber | String | Yes | — | unique | — |
| currentMeter | Number | Yes | 0 | >= 0 | Cumulative hour meter |
| location | String | No | "" | max 200 chars | Current site/yard |
| normalFuelConsumption | Number | Yes | — | > 0 | Liters/hour baseline |
| maintenanceCycleHours | Number | Yes | 250 | > 0 | Default maintenance interval |
| manualStatus | String enum | No | null | `null \| "Stopped"` | Manual override input |
| status | String enum (virtual/derived, not stored as source of truth — cached for query performance) | — | — | `Available\|Rented\|Under Maintenance\|Stopped` | Recalculated by Status Engine |
| commercialStatus | String enum (derived) | — | — | `Assigned\|Unassigned` | See Business Rule 6.1 |
| isDeleted | Boolean | No | false | — | Soft delete |

Indexes: `code` unique; `specifications.serialNumber` unique; compound index `(status, location)` for filtered lists.

## 11. Backend Architecture
- `modules/generators/{model,controller,service,routes,validation}.ts`. `service.ts` delegates status derivation to `status-engine` service — never recomputes status locally.

## 12. API Specification
### GET `/api/generators` — list, paginated, filterable by `status`, `location`, `search`. Auth required. Permissions: any authenticated role (read).
### POST `/api/generators` — create. Permissions: Admin, Operations Manager.
### GET `/api/generators/:id` — profile detail (includes derived `status`, `commercialStatus`). Permissions: any authenticated role.
### PATCH `/api/generators/:id` — update specs/location/thresholds (never `currentMeter` or `status` directly). Permissions: Admin, Operations Manager.
### POST `/api/generators/:id/stop` — set `manualStatus="Stopped"` with required `reason`. Permissions: Admin, Operations Manager.
### POST `/api/generators/:id/resume` — clear `manualStatus`. Permissions: Admin, Operations Manager.
### DELETE `/api/generators/:id` — soft delete/deactivate. Permissions: Admin only.

Example response (`GET /api/generators/:id`):
```json
{
  "success": true,
  "data": {
    "id": "…", "code": "GEN-014", "status": "Rented", "commercialStatus": "Assigned",
    "currentMeter": 5230, "specifications": { "kva": 500, "brand": "Cummins", "model": "C500D5", "serialNumber": "SN-9911" }
  },
  "message": null, "meta": {}
}
```
Errors: `409` duplicate code/serial; `409` deactivation blocked (active contract/open maintenance); `422` validation.

## 13. Frontend Requirements
- `features/generators`: `GeneratorsListPage` (DataTable + filters), `GeneratorFormDialog` (React Hook Form + Zod), `GeneratorProfilePage` (Tabs: Overview, Operations, Fuel, Maintenance, Contracts, Profitability), `StopResumeDialog` (reason required), `StatusBadge`.

## 14. Page Structure
```
Header: "Generators" | Breadcrumb | [+ New Generator]
Filters: Search | Status | Location
DataTable: code, brand/model, KVA, status badge, location, current meter, actions
--
Generator Profile
Header: code + StatusBadge + [Stop/Resume]
Tabs: Overview | Operations | Fuel | Maintenance | Contracts | Profitability
```

## 15. UX Behavior
- Stop/Resume opens `ConfirmDialog` requiring a reason textarea; success toast "Generator marked Stopped".
- Deactivation attempt on an active generator shows an inline error explaining why (active contract / open maintenance), not a generic failure toast.

## 16. Validation Rules
- `code`: required, unique, 2–20 chars, alphanumeric + dashes.
- `kva`, `normalFuelConsumption`, `maintenanceCycleHours`: required, positive numbers.
- `serialNumber`: required, unique.

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/Edit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Stop/Resume | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Deactivate | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Server state via TASK-005's query hooks; form state via React Hook Form; no generator data duplicated into global client state.

## 19. Error Handling
- Duplicate `code`/`serialNumber` → `409` with field-level error shown inline on the form.
- Deactivation blocked → `409` with a specific reason message rendered in the confirm dialog.

## 20. Edge Cases
- Generator with historical (non-active) contracts can be deactivated — only *active* contracts/open maintenance block it.
- Changing `maintenanceCycleHours` does not retroactively recompute past `nextMaintenanceMeter` values on completed maintenance records — only future maintenance uses the new cycle.
- Deleted/deactivated generator still appears (read-only, clearly marked "Inactive") in historical reports and profitability — never disappears from past data.

## 21. Audit Requirements
- Create, Update, Stop, Resume, Deactivate are all audited with before/after diffs.

## 22. Notifications
- Stop action while commercially assigned triggers the Business Rule 6.1 warning notification (delivered by Notification Engine, TASK-026).

## 23. Reporting Impact
- Generator master fields feed every operational and financial report; `status`/`commercialStatus` feed the Dashboard fleet KPIs.

## 24. Testing Requirements
- **Unit**: validation schema, code/serial uniqueness.
- **API**: CRUD, stop/resume, deactivation-blocked scenarios, permission matrix.
- **E2E**: create generator → appears in list → profile tabs load.
- **Permission**: Viewer cannot POST/PATCH/DELETE.
- **Edge Case**: deactivate generator with active contract → blocked.

## 25. Acceptance Criteria
- Given a unique code and valid specs, when creating a generator, then it appears in the list with status `Available`.
- Given a generator with an active contract, when an Operations Manager attempts to deactivate it, then the request is rejected with a clear reason.
- Given `manualStatus="Stopped"` is set, when the profile is viewed, then the status badge shows `Stopped` regardless of any active contract.

## 26. Dependencies
TASK-002–006.

## 27. Deliverables
- Generator model/service/routes, list + profile UI, stop/resume workflow.

## 28. Definition of Done
- All acceptance criteria pass; status field is read-only from this module's own write path (only Status Engine and the stop/resume actions touch it).

---

# TASK-009 — Generator Status Engine

## 1. Objective
Implement the centralized service that derives `Generator.status` and `commercialStatus` from active contracts, open maintenance, and manual override, per the priority rules in Business Rule 6.1, and keeps the cached `status` field in sync on every relevant write.

## 2. Business Purpose
Status correctness is safety- and revenue-critical: an incorrectly "Available" generator could be double-booked; an incorrectly "Rented" generator could block a legitimate rental. Centralizing this logic in one engine (rather than scattering conditionals) is the single biggest correctness risk in the whole system.

## 3. User Story
As an **Operations Manager**, I want the generator status to always reflect the true business state, so that I never accidentally double-book or misreport fleet availability.

## 4. Actors
Consumed by all roles indirectly (status is read-only, system-derived).

## 5. Preconditions
TASK-008; consumed by TASK-012 (Contracts) and TASK-018 (Maintenance), so those tasks call into this engine rather than duplicating conditionals.

## 6. Scope
- `StatusEngineService.recalculate(generatorId)`: reads active contracts + open maintenance + manualStatus, applies the priority table (6.1), writes the cached `status`/`commercialStatus` fields on the Generator document, returns the result.
- Recalculation triggers: contract activation/cancellation/expiry, maintenance open/close, manual stop/resume (TASK-008).
- A nightly (or on-demand) reconciliation job that recalculates every generator's status, to self-heal any drift (e.g. a contract that expired by date without an explicit transition event).

## 7. Out of Scope
- The UI for stop/resume (TASK-008 owns the input; this task owns only the derivation).

## 8. Functional Requirements
- FR-001: Recalculation is idempotent — calling it twice in a row with no underlying change produces the same result.
- FR-002: A contract's `Draft → Active` transition, `Active → Cancelled`, and date-based expiry all trigger recalculation for every generator on that contract.
- FR-003: A maintenance record's `Open`/`In Progress → Completed/Cancelled` transition triggers recalculation for that generator.
- FR-004: The reconciliation job logs any generator whose stored status did not match the freshly-derived status (drift), for observability.

## 9. Business Rules
Full logic per Section 6.1, including the conflict-resolution table and the "Stopped while commercially assigned" notification rule.

## 10. Data Model
No new collection; extends `Generator.status`/`commercialStatus` (TASK-008) as engine-owned fields, plus a lightweight `StatusChangeLog` (optional, embedded-array capped at last 20 entries on the Generator, or a separate small collection) recording `{ from, to, reason, triggeredBy, at }` for the Generator profile's "status history" view.

| Field (StatusChangeLog) | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| generatorId | ObjectId | Yes | — | ref Generator | — |
| from | String enum | Yes | — | — | Previous status |
| to | String enum | Yes | — | — | New status |
| reason | String | No | "" | — | e.g. "contract activated #123" |
| triggeredBy | String enum | Yes | — | `system\|user` | — |
| at | Date | Yes | now | — | — |

Index: `(generatorId, at desc)`.

## 11. Backend Architecture
- `modules/status-engine/{service,job,types}.ts`. Called synchronously (within the same transaction where feasible) from Contract and Maintenance services; no HTTP surface of its own beyond an internal admin recalculation endpoint.

## 12. API Specification
### POST `/api/admin/status-engine/recalculate` — force full-fleet recalculation (diagnostic tool). Auth required. Permissions: Admin only.
Response: `{ success: true, data: { recalculated: 42, driftDetected: 1 } }`.

## 13. Frontend Requirements
- Generator Profile "Overview" tab shows a small "Status History" list (from/to/reason/date) sourced from `StatusChangeLog`.
- Admin "System Health" panel (Settings) exposes a "Recalculate all statuses" action for support use.

## 14. Page Structure
N/A beyond the additions above.

## 15. UX Behavior
- Status badge color mapping is fixed and consistent app-wide: Available = green, Rented = blue, Under Maintenance = amber, Stopped = red.

## 16. Validation Rules
N/A (system-derived, not user-input beyond what TASK-008 already validates).

## 17. Permissions
| Action | Admin | Ops Mgr | Others |
|---|---|---|---|
| Force recalculation | ✅ | ❌ | ❌ |
| View status/history | ✅ | ✅ | ✅ (read) |

## 18. State Management
N/A beyond standard server-state caching invalidation: any contract/maintenance mutation invalidates the affected generator's cached query.

## 19. Error Handling
- If recalculation runs mid another write (race), the engine re-reads within the same DB transaction/session to avoid a stale read producing an incorrect status.

## 20. Edge Cases
- Contract expires purely by date (no explicit action) — the nightly reconciliation job catches this, in addition to date-aware queries treating "Active but past endDate" as not-active for status purposes even before reconciliation runs.
- Two maintenance records somehow both "Open" (should be prevented by TASK-018's uniqueness rule) — engine takes the most recent as authoritative and logs a data-integrity warning.
- Manual Stop set, then contract cancelled — status remains Stopped (override still wins) until explicitly resumed.

## 21. Audit Requirements
- Every status change is logged in `StatusChangeLog`; drift detected by reconciliation is logged as a system audit entry with severity `warning`.

## 22. Notifications
- "Generator stopped while commercially assigned" (6.1) is created here and dispatched via the Notification Engine (TASK-026).

## 23. Reporting Impact
- Dashboard fleet KPIs (Total/Available/Rented/Under Maintenance/Stopped) and every report filtering by generator status read the cached, engine-maintained field — never recompute independently.

## 24. Testing Requirements
- **Unit**: full truth table from Section 6.1's conflict-resolution table (all 5 rows), idempotency, drift detection logic.
- **API**: force recalculation as Admin succeeds; as non-Admin is `403`.
- **Integration**: contract activate → generator flips to Rented; maintenance close → generator flips to Available (absent other conditions).

## 25. Acceptance Criteria
- Given the conflict table's five input combinations, when recalculation runs, then the output status matches the table exactly in every case.
- Given a contract expires by date with no explicit cancellation, when the nightly reconciliation job runs, then the generator's status is corrected without manual intervention.

## 26. Dependencies
TASK-008 (Generator model); integrates with TASK-012 (Contracts), TASK-018 (Maintenance) once built — those tasks call `StatusEngineService.recalculate` rather than writing `status` themselves.

## 27. Deliverables
- Status engine service, StatusChangeLog model, reconciliation job, admin recalculation endpoint, status history UI.

## 28. Definition of Done
- No other module writes `Generator.status` directly (verified in code review); full truth-table unit coverage passes.

---

# TASK-010 — Customer Management

## 1. Objective
Implement Customer CRUD and the Customer Profile page (overview, projects, contracts, extracts, receipts, statement) — the master record for the commercial relationship.

## 2. Business Purpose
Customers are the paying counterparties for every contract and financial document; accurate customer master data underlies billing, VAT/tax reporting, and the ledger.

## 3. User Story
As a **Finance Manager**, I want to manage customer records and see their full account in one place, so that billing and collections are accurate and easy to review.

## 4. Actors
Admin, Operations Manager, Finance Manager (write, per matrix); Accountant, Viewer (read/limited).

## 5. Preconditions
TASK-002–006.

## 6. Scope
- Customer CRUD: `code`, `companyName`, `contactPerson`, `phone`, `taxNumber`, `address`, `active`.
- Customer Profile page with tabs: Overview, Projects, Contracts, Extracts, Receipts, Statement (Statement tab renders the Customer Ledger Engine output, TASK-023).

## 7. Out of Scope
- Ledger/balance calculation logic (TASK-023).
- Project/Contract/Extract/Receipt data entry (their own tasks); this task renders their history read-only within the profile.

## 8. Functional Requirements
- FR-001: Creating a customer requires a unique `code`; `taxNumber` is required for entities that will be invoiced with VAT (validated as required when the customer has any active contract — enforced at contract-activation time, not blocking basic customer creation, since some customers may be created ahead of a taxNumber being available).
- FR-002: Deactivating a customer with an outstanding positive balance or active contract is blocked with a clear error.
- FR-003: List view supports search (name, code, contact, tax number).

## 9. Business Rules
- Customer balance shown on the profile is always computed live by the Ledger Engine (TASK-023) — never stored as a mutable field on the Customer document, to avoid drift.

## 10. Data Model — Customer
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| code | String | Yes | — | unique | Business identifier |
| companyName | String | Yes | — | 1–150 chars | — |
| contactPerson | String | No | "" | max 100 chars | — |
| phone | String | No | "" | phone format | — |
| taxNumber | String | No | "" | required at contract activation | — |
| address | String | No | "" | max 300 chars | — |
| active | Boolean | No | true | — | Soft-deactivation flag |

Indexes: `code` unique; text index on `companyName`/`contactPerson` for search.

## 11. Backend Architecture
- `modules/customers/{model,controller,service,routes,validation}.ts`.

## 12. API Specification
### GET `/api/customers` — list, search/filter. Permissions: any authenticated (read).
### POST `/api/customers` — create. Permissions: Admin, Operations Manager, Finance Manager.
### GET `/api/customers/:id` — profile detail. Permissions: any authenticated.
### PATCH `/api/customers/:id` — update. Permissions: Admin, Operations Manager, Finance Manager.
### DELETE `/api/customers/:id` — deactivate. Permissions: Admin, Finance Manager.
Errors: `409` duplicate code; `409` deactivation blocked (positive balance/active contract); `422` validation.

## 13. Frontend Requirements
- `CustomersListPage` (DataTable), `CustomerFormDialog`, `CustomerProfilePage` (Tabs: Overview, Projects, Contracts, Extracts, Receipts, Statement).

## 14. Page Structure
```
Header: "Customers" | [+ New Customer]
Filters: Search
DataTable: code, companyName, contactPerson, phone, balance (from Ledger Engine), active
--
Customer Profile
Tabs: Overview | Projects | Contracts | Extracts | Receipts | Statement
```

## 15. UX Behavior
- Balance column/badge colored: green (credit/zero), red (owes money) — consistent with financial conventions elsewhere.
- Deactivation blocked shows the specific reason inline.

## 16. Validation Rules
- `code`, `companyName` required; `taxNumber` format validated when provided.

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create/Edit | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Deactivate | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

## 18. State Management
- Standard TASK-005 query hooks; balance fetched from the Ledger Engine endpoint, not duplicated client-side.

## 19. Error Handling
- Duplicate code → `409` inline field error.

## 20. Edge Cases
- Customer with historical (non-active) contracts and zero balance can be deactivated even if it has extract history — history remains visible read-only.
- Customer name change does not rewrite historical extract/receipt print snapshots (which store a `customerNameSnapshot`).

## 21. Audit Requirements
- Create/Update/Deactivate audited.

## 22. Notifications
N/A directly (overdue-customer alerts are TASK-026, sourced from the Ledger Engine).

## 23. Reporting Impact
- Feeds Customer Statement, Uncollected Extracts, and Dashboard receivables KPIs.

## 24. Testing Requirements
- **API**: CRUD, deactivation-blocked scenarios, permission matrix.
- **E2E**: create customer → appears in list → profile loads with empty-state tabs.

## 25. Acceptance Criteria
- Given a customer with a positive balance, when deactivation is attempted, then it is blocked with a clear reason.
- Given a unique code, when creating a customer, then it appears immediately in the customer list.

## 26. Dependencies
TASK-002–006.

## 27. Deliverables
- Customer model/service/routes, list + profile UI.

## 28. Definition of Done
- Profile tabs render correctly even with zero related records (empty states); deactivation guard rails verified by tests.

---

# TASK-011 — Project Management

## 1. Objective
Implement Project CRUD scoped to a Customer, with an assigned-generators summary and a contracts/revenue summary on the project profile.

## 2. Business Purpose
Projects are the operational grouping the business actually plans around (a customer's job site); contracts, operations, and cost roll up per project as much as per generator.

## 3. User Story
As an **Operations Manager**, I want to organize contracts and generators under a customer's project, so that site-level tracking and reporting is possible.

## 4. Actors
Admin, Operations Manager (write); Finance Manager, Accountant, Viewer (read).

## 5. Preconditions
TASK-010 (Customer must exist to create a Project).

## 6. Scope
- Project CRUD: `code`, `name`, `customerId`, `location`, `siteManager`, `startDate`, `endDate`, `status`.
- Project profile: assigned generators (derived from active Contract Items under this project's contracts), contracts list, revenue summary (from Extracts scoped to the project).

## 7. Out of Scope
- Contract creation itself (TASK-012).

## 8. Functional Requirements
- FR-001: A Project must belong to exactly one Customer, set at creation and immutable thereafter (moving a project between customers is not supported in V1 — would orphan contract/financial history; documented as an Open Decision).
- FR-002: `endDate`, if set, must be `>= startDate`.
- FR-003: List view supports filtering by customer and status.

## 9. Business Rules
- A project's "assigned generators" is always a live derivation from active Contract Items, never a manually-maintained list, to avoid drift from the Contract module.

## 10. Data Model — Project
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| code | String | Yes | — | unique | — |
| name | String | Yes | — | 1–150 chars | — |
| customerId | ObjectId → Customer | Yes | — | ref exists, active | Immutable after creation |
| location | String | No | "" | max 200 chars | — |
| siteManager | String | No | "" | max 100 chars | — |
| startDate | Date | Yes | — | — | — |
| endDate | Date | No | null | `>= startDate` | — |
| status | String enum | No | "Active" | `Active\|Closed` | — |

Indexes: `code` unique; `(customerId, status)` compound.

## 11. Backend Architecture
- `modules/projects/{model,controller,service,routes,validation}.ts`.

## 12. API Specification
### GET `/api/projects` — list, filter by `customerId`, `status`. Permissions: any authenticated (read).
### POST `/api/projects` — create. Permissions: Admin, Operations Manager.
### GET `/api/projects/:id` — profile (assigned generators, contracts, revenue summary). Permissions: any authenticated.
### PATCH `/api/projects/:id` — update (not `customerId`). Permissions: Admin, Operations Manager.
### DELETE `/api/projects/:id` — close/deactivate. Permissions: Admin, Operations Manager.
Errors: `409` duplicate code; `409` close blocked (active contracts exist); `422` invalid date range.

## 13. Frontend Requirements
- `ProjectsListPage`, `ProjectFormDialog` (Customer select, dates), `ProjectProfilePage` (Overview + Generators + Contracts + Revenue summary cards).

## 14. Page Structure
```
Header: "Projects" | [+ New Project]
Filters: Customer | Status
DataTable: code, name, customer, siteManager, status, generator count
```

## 15. UX Behavior
- Closing a project with active contracts is blocked with an inline explanation.

## 16. Validation Rules
- `code`, `name`, `customerId`, `startDate` required; `endDate >= startDate`.

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create/Edit/Close | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Standard TASK-005 patterns; Customer select uses a searchable async combobox against `/api/customers`.

## 19. Error Handling
- Closing with active contracts → `409` with count of blocking contracts shown.

## 20. Edge Cases
- Project with zero contracts closes freely.
- A closed project remains visible/filterable in historical reports.

## 21. Audit Requirements
- Create/Update/Close audited.

## 22. Notifications
N/A.

## 23. Reporting Impact
- Project is a standard filter dimension across Operations, Fuel, Maintenance, Extracts, and Reports.

## 24. Testing Requirements
- **API**: CRUD, close-blocked scenario, date validation.
- **E2E**: create project under a customer → appears filtered correctly by that customer.

## 25. Acceptance Criteria
- Given a customer, when creating a project under it, then the project appears in that customer's profile "Projects" tab.
- Given an active contract under a project, when attempting to close it, then the action is blocked.

## 26. Dependencies
TASK-010.

## 27. Deliverables
- Project model/service/routes, list + profile UI.

## 28. Definition of Done
- Assigned-generators derivation verified against live contract data, not a stored list.


---

# TASK-012 — Rental Contract Management

## 1. Objective
Implement Rental Contract CRUD with Contract Items (one per generator), lifecycle transitions (Draft → Active → Expired/Cancelled), and insurance sub-object, wired to the Conflict Engine (TASK-013) and Pricing Engine (TASK-014).

## 2. Business Purpose
The Contract is the commercial backbone of the whole system — it is what makes a generator "Rented," what drives billing, and what every extract is generated from.

## 3. User Story
As an **Operations Manager**, I want to create a contract with one or more generators and commercial terms, so that rentals are formally tracked and billed correctly.

## 4. Actors
Admin, Operations Manager (write); Finance Manager, Accountant, Viewer (read).

## 5. Preconditions
TASK-008–011.

## 6. Scope
- Contract CRUD: `number` (auto-generated, unique), `customerId`, `projectId`, `startDate`, `endDate`, `rentalMethod`, `status`, `insurance` (embedded: provider, policyNumber, amount).
- Contract Items: `generatorId`, `billingMethod`, `unitPrice` per item.
- Lifecycle actions: `activate`, `cancel` (Draft or Active → Cancelled), automatic `expire` (date-based, handled by a scheduled job).

## 7. Out of Scope
- Conflict detection logic itself (TASK-013).
- Price calculation formulas (TASK-014) — this task stores the inputs (`unitPrice`, `billingMethod`) and calls the Pricing Engine when generating an Extract.

## 8. Functional Requirements
- FR-001: Contract `number` is auto-generated (sequential, human-readable, e.g. `CN-2026-0042`), never user-entered, never reused.
- FR-002: A Draft contract can freely add/remove Contract Items and edit dates.
- FR-003: `activate` transition runs the Conflict Engine hard-check (6.9) across all Contract Items before allowing the transition; any conflict blocks activation with a specific list of conflicting generators/contracts.
- FR-004: Activating a contract triggers Status Engine recalculation (TASK-009) for every generator on it.
- FR-005: `cancel` is allowed from Draft or Active; cancelling an Active contract triggers Status Engine recalculation and is audited with a mandatory reason.
- FR-006: A scheduled job transitions `Active → Expired` once `endDate` has passed, then triggers Status Engine recalculation.

## 9. Business Rules
- Full lifecycle: `Draft → Active → Expired`, and `Draft|Active → Cancelled`. No other transitions are valid (e.g. `Expired`/`Cancelled` are terminal).
- Conflict rule and Draft-vs-Active blocking behavior per Business Rule 6.9.
- Pricing per Business Rule 6.10 (delegated to TASK-014 at Extract-generation time).

## 10. Data Model — RentalContract
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| number | String | Yes | auto | unique | System-generated |
| customerId | ObjectId → Customer | Yes | — | ref exists | — |
| projectId | ObjectId → Project | Yes | — | ref exists, same customer | — |
| startDate | Date | Yes | — | — | — |
| endDate | Date | Yes | — | `>= startDate` | — |
| rentalMethod | String enum | Yes | — | `monthly\|daily\|weekly\|hourly` | Default billing method for items (item-level can override) |
| status | String enum | No | "Draft" | `Draft\|Active\|Expired\|Cancelled` | — |
| insurance.provider | String | No | "" | — | — |
| insurance.policyNumber | String | No | "" | — | — |
| insurance.amount | Decimal128 | No | 0 | >= 0 | — |
| cancelReason | String | No | "" | required when status=Cancelled | — |

### Data Model — ContractItem
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| contractId | ObjectId → RentalContract | Yes | — | ref exists | — |
| generatorId | ObjectId → Generator | Yes | — | ref exists, active | — |
| billingMethod | String enum | Yes | inherits contract's | `monthly\|daily\|weekly\|hourly` | — |
| unitPrice | Decimal128 | Yes | — | > 0 | — |
| priceSnapshot | Decimal128 | No | null | set at activation | Immutable copy for billed history |

Indexes: `RentalContract.number` unique; `(status, startDate, endDate)` compound for conflict/expiry queries; `ContractItem.(generatorId, contractId)` compound.

## 11. Backend Architecture
- `modules/contracts/{model,controller,service,routes,validation}.ts`; `service.ts` calls `contract-conflict-engine.service.ts` and `status-engine.service.ts`; a `jobs/expireContracts.ts` scheduled job.

## 12. API Specification
### GET `/api/contracts` — list, filter by `customerId`, `projectId`, `status`, date range. Permissions: any authenticated (read).
### POST `/api/contracts` — create Draft with items. Permissions: Admin, Operations Manager.
### GET `/api/contracts/:id` — detail with items. Permissions: any authenticated.
### PATCH `/api/contracts/:id` — update Draft-only fields/items. Permissions: Admin, Operations Manager.
### POST `/api/contracts/:id/activate` — transition Draft → Active (runs conflict check). Permissions: Admin, Operations Manager.
### POST `/api/contracts/:id/cancel` — body `{ reason }`. Permissions: Admin, Operations Manager.

Example error (conflict on activate):
```json
{ "success": false, "data": null, "message": "Conflicting generator assignment",
  "errors": [{ "field": "items[1].generatorId", "message": "GEN-014 overlaps with Active contract CN-2026-0031 (01–20 Jan)" }] }
```

## 13. Frontend Requirements
- `ContractsListPage`, `ContractFormWizard` (customer/project → dates/method → add items), `ContractDetailPage` (Tabs: Overview, Items, Extracts), `ActivateConfirmDialog`, `CancelDialog` (reason required).

## 14. Page Structure
```
Header: "Contracts" | [+ New Contract]
Filters: Customer | Project | Status | Date range
DataTable: number, customer, project, dates, method, status, item count
--
Contract Detail
Tabs: Overview | Items (generator, method, price) | Extracts (history)
Actions: Activate (Draft only) | Cancel (Draft/Active)
```

## 15. UX Behavior
- Activation shows a pre-check summary (any soft warnings from Draft-time conflict pre-check, Business Rule 6.9) before final confirm.
- A blocked activation lists every conflicting item inline, each linking to the conflicting contract.

## 16. Validation Rules
- `endDate >= startDate`; at least one Contract Item required to activate (Draft can be saved with zero items).
- `unitPrice > 0` per item.

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create/Edit Draft | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Activate/Cancel | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Wizard form state local until submit; Contract Items array managed via `useFieldArray` (React Hook Form).

## 19. Error Handling
- Activation conflict → `409` with structured per-item errors rendered against each item row.
- Attempting to edit an Active/Expired/Cancelled contract's core terms → `409 immutable state`.

## 20. Edge Cases
- Contract with overlapping items for the *same* generator within the *same* Draft contract (duplicate item) is rejected at save time.
- Cancelling an Active contract mid-billing-period does not retroactively alter already-Approved extracts for that period (see 6.7 — approved documents are never silently edited).
- Contract spanning a VAT-rate change: unaffected, since VAT is snapshotted per-extract, not per-contract.

## 21. Audit Requirements
- Create, Update (Draft), Activate, Cancel — all audited; Cancel requires and stores `reason`.

## 22. Notifications
- "Contract approaching expiry" (e.g. 7 days before `endDate`) — created here, dispatched via TASK-026.

## 23. Reporting Impact
- Feeds Contract Revenue basis for Pricing Engine, Extracts, Dashboard "Contracts approaching expiry" KPI, and Reports.

## 24. Testing Requirements
- **Unit**: lifecycle transition guard (only valid transitions allowed).
- **API**: create/activate/cancel, conflict-blocked activation, permission matrix.
- **E2E**: full flow — create Draft with 2 items → activate → generators show Rented.
- **Edge Case**: duplicate generator within same Draft; expiry job transition.

## 25. Acceptance Criteria
- Given a Draft contract with a non-conflicting generator, when activated, then status becomes Active and the generator's status becomes Rented.
- Given a Draft contract with a generator already Active on an overlapping contract, when activation is attempted, then it is blocked with the specific conflicting contract identified.
- Given an Active contract past its `endDate`, when the expiry job runs, then it transitions to Expired and the generator's status is recalculated.

## 26. Dependencies
TASK-008–011; integrates with TASK-013, TASK-014, TASK-009.

## 27. Deliverables
- Contract + ContractItem models/service/routes, wizard + detail UI, expiry job.

## 28. Definition of Done
- Every lifecycle transition tested; conflict engine hard-blocks activation with zero false negatives in test suite.

---

# TASK-013 — Contract Conflict Detection Engine

## 1. Objective
Implement the reusable service that detects overlapping active generator assignments across contracts, used both as a soft warning at Draft time and a hard block at Activation.

## 2. Business Purpose
Double-booking a physical generator is an operational failure (a truck shows up to a site expecting equipment already committed elsewhere) — this is one of the highest-value rules in the whole system.

## 3. User Story
As an **Operations Manager**, I want the system to actively prevent double-booking a generator, so that field operations never fail due to a scheduling mistake.

## 4. Actors
Consumed by TASK-012; surfaced to Operations Manager/Admin.

## 5. Preconditions
TASK-012 (Contract/ContractItem models exist).

## 6. Scope
- `ConflictEngineService.checkGenerator(generatorId, startDate, endDate, excludeContractId?)` → returns list of conflicting `{ contractId, contractNumber, startDate, endDate }`.
- `ConflictEngineService.checkContract(contractId)` → runs the above for every item on a contract, used at activation.
- Explicit "Shared Assignment" override path (Admin only) that records an approved exception.

## 7. Out of Scope
- The Contract lifecycle itself (TASK-012).

## 8. Functional Requirements
- FR-001: Conflict check only considers contracts in `Active` status (and, for the Draft-time soft warning, also other `Draft` contracts as an informational-only signal — never blocking).
- FR-002: Overlap formula: `existing.startDate <= new.endDate AND existing.endDate >= new.startDate`.
- FR-003: The check excludes the contract being activated/edited itself (`excludeContractId`).
- FR-004: An "Shared Assignment" override requires Admin permission, a mandatory justification, and is recorded distinctly from a normal non-conflicting assignment (flagged `isSharedAssignmentException: true` on the ContractItem).

## 9. Business Rules
Full detail per Business Rule 6.9.

## 10. Data Model
No new collection; adds `isSharedAssignmentException: Boolean (default false)` and `sharedAssignmentJustification: String` to `ContractItem` (TASK-012).

## 11. Backend Architecture
- `modules/contract-conflict-engine/service.ts`, pure function over `RentalContract`/`ContractItem` collections, no controller of its own (called internally by `contracts/service.ts`).

## 12. API Specification
N/A as a standalone endpoint — exposed indirectly via `POST /api/contracts/:id/activate` (TASK-012) and a lightweight `POST /api/contracts/check-conflict` used by the Draft-time soft-warning UI.

### POST `/api/contracts/check-conflict`
Purpose: on-demand soft check while editing a Draft (does not block, just warns). Auth required. Permissions: Admin, Operations Manager.
Request Body: `{ "generatorId": "...", "startDate": "...", "endDate": "...", "excludeContractId": "..." }`
Response: `{ "success": true, "data": { "conflicts": [ { "contractId": "...", "contractNumber": "CN-2026-0031", "startDate": "...", "endDate": "..." } ] } }`

## 13. Frontend Requirements
- Inline warning banner within `ContractFormWizard` (TASK-012) when adding an item whose generator has any Draft/Active overlap — non-blocking, dismissible, visually distinct (amber) from the hard-blocking Activation error (red).

## 14. Page Structure
N/A (embedded within TASK-012's UI).

## 15. UX Behavior
- Soft warning at Draft time: "This generator is also assigned to Draft/Active contract CN-... in this period — you can still save, but activation will be blocked unless resolved."
- Hard block at Activation: specific, per-item, non-dismissible until resolved (remove/replace the conflicting item or use Shared Assignment override).

## 16. Validation Rules
- Shared Assignment override requires a non-empty justification string.

## 17. Permissions
| Action | Admin | Ops Mgr | Others |
|---|---|---|---|
| Run conflict check | ✅ | ✅ | ❌ |
| Approve Shared Assignment override | ✅ | ❌ | ❌ |

## 18. State Management
N/A beyond the form-level warning state in TASK-012's wizard.

## 19. Error Handling
- Conflict check itself never errors on "conflict found" — that's a valid result, not an exception; only malformed input (missing dates/generatorId) is a `422`.

## 20. Edge Cases
- Back-to-back contracts where one ends exactly on the day the next starts: **treated as a conflict** (inclusive boundaries) unless the business explicitly wants same-day handover, which is documented as an Open Decision (Section 16) with the safe default being "conflict" (better to force explicit review than silently allow a same-day handover that field logistics can't actually support).
- Cancelled/Expired contracts never contribute conflicts, even if their dates would otherwise overlap.

## 21. Audit Requirements
- Shared Assignment override approvals are audited with the justification text.

## 22. Notifications
N/A directly (surfaced as inline UI, not a Notification Engine alert).

## 23. Reporting Impact
N/A directly.

## 24. Testing Requirements
- **Unit**: overlap formula truth table (fully-inside, partial-overlap-start, partial-overlap-end, exact-match, adjacent-boundary, no-overlap, excluded-contract-ignored, cancelled/expired-ignored).
- **API**: soft-check endpoint, hard-block on activation.
- **Edge Case**: same-day boundary handling as specified above.

## 25. Acceptance Criteria
- Given Generator A is Active on Contract X (01–31 Jan), when Contract Y (15 Jan–15 Feb) with Generator A is activated, then activation is blocked listing Contract X.
- Given the same scenario but an Admin applies a Shared Assignment override with justification, when activation is retried, then it succeeds and the exception is recorded and auditable.

## 26. Dependencies
TASK-012.

## 27. Deliverables
- Conflict engine service, soft-check endpoint, Draft-time UI warning, Shared Assignment override flow.

## 28. Definition of Done
- Full overlap truth table passes; zero false negatives verified against a seeded conflicting-contract test fixture.

---

# TASK-014 — Contract Pricing Engine

## 1. Objective
Implement the reusable pricing calculation service supporting Monthly, Daily, Weekly, and Hourly billing methods, producing the `Rent` line item and a stored calculation breakdown for traceability.

## 2. Business Purpose
Pricing must be computed identically everywhere it's needed (Extract generation, reports, what-if previews) — a single engine prevents billing discrepancies.

## 3. User Story
As a **Finance Manager**, I want rent to be calculated consistently from contract terms, so that every extract's rent figure is correct and explainable.

## 4. Actors
Consumed by TASK-020 (Extracts); surfaced read-only to Finance Manager/Accountant.

## 5. Preconditions
TASK-012 (Contract Items exist); TASK-015 (Operations, for the Hourly method's operating-hours input).

## 6. Scope
- `PricingEngineService.calculateRent(contractItem, periodStart, periodEnd)` → `{ amount, breakdown }` per Business Rule 6.10.
- Pro-ration logic for partial months (Monthly method) by day-count.

## 7. Out of Scope
- VAT/discount/total calculation (Financial Calculation Engine, TASK-021) — this engine produces only the `Rent` figure and its breakdown, one input among several to the Extract total.

## 8. Functional Requirements
- FR-001: Monthly: full months at `unitPrice` each; a partial month is pro-rated as `unitPrice × (days in partial month ÷ days in that calendar month)`.
- FR-002: Daily: `unitPrice × count of days in [periodStart, periodEnd]` inclusive.
- FR-003: Weekly: `unitPrice × (days in period ÷ 7)`, rounded per system rounding rule (2dp, half-up) at the final step only.
- FR-004: Hourly: `unitPrice × Σ operating hours` pulled from non-superseded Operation Logs for that generator/project within the period.
- FR-005: Every calculation stores its inputs (`method`, `unitPrice`, computed quantity, and — for Hourly — the specific Operation Log IDs summed) in `breakdown` for later audit/traceability.

## 9. Business Rules
Full formulas per Business Rule 6.10.

## 10. Data Model
No new collection; `breakdown` is an embedded object stored on the `Extract` line item (TASK-020) at generation time — this engine is stateless/computational.

## 11. Backend Architecture
- `modules/contract-pricing-engine/service.ts` — pure calculation service, no persistence of its own, no controller.

## 12. API Specification
### POST `/api/contracts/:id/preview-rent` — preview calculation for a given period without creating an Extract (used by the Extract creation wizard). Auth required. Permissions: Admin, Finance Manager, Accountant.
Request Body: `{ "periodStart": "...", "periodEnd": "..." }`
Response:
```json
{ "success": true, "data": { "items": [ { "generatorId":"...", "method":"monthly", "amount": "15000.00", "breakdown": { "fullMonths":1, "partialDays":10, "daysInPartialMonth":31 } } ] } }
```

## 13. Frontend Requirements
- Rent preview panel inside the Extract creation wizard (TASK-020), showing per-generator calculated rent with an expandable "How was this calculated?" breakdown.

## 14. Page Structure
N/A (embedded in TASK-020's wizard).

## 15. UX Behavior
- Breakdown is always available (not hidden behind a support request) so Finance can defend every invoice figure to a customer.

## 16. Validation Rules
- `periodEnd >= periodStart`; period must fall within (or be clipped to) the contract's own date range — a period outside the contract's dates is rejected.

## 17. Permissions
| Action | Admin | Finance Mgr | Accountant | Ops Mgr | Technician | Viewer |
|---|---|---|---|---|---|---|
| Preview/calculate rent | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

## 18. State Management
N/A — computed on demand, not cached client-side beyond normal query caching for the preview call.

## 19. Error Handling
- Hourly method with zero Operation Logs in the period → amount `0.00` with an explicit `breakdown.warning: "no operation logs in period"`, not a calculation error.

## 20. Edge Cases
- Monthly contract activated mid-month → first period is naturally partial/pro-rated using the rule above.
- Weekly rounding must not silently drift across many periods — each period's calculation is independent and rounded once, not accumulated with running fractional remainders.
- Hourly method double-counting: only non-superseded Operation Logs (per Business Rule 6.3 correction workflow) are summed.

## 21. Audit Requirements
- Not separately audited (the resulting Extract's audit trail, TASK-031, captures it); the breakdown itself is the traceability mechanism.

## 22. Notifications
N/A.

## 23. Reporting Impact
- Feeds Extract totals, and therefore every financial report and the Dashboard revenue KPI.

## 24. Testing Requirements
- **Unit**: all four billing methods, partial-month pro-ration edge cases, zero-operating-hours case, rounding-once-at-the-end behavior.
- **API**: preview endpoint permission matrix and period-validation errors.

## 25. Acceptance Criteria
- Given a Monthly contract item activated on the 21st of a 30-day month, when previewing rent for that partial month, then the amount equals `unitPrice × (10/30)` rounded to 2dp.
- Given an Hourly contract item with 3 Operation Logs totaling 62 operating hours in the period, when calculating, then rent equals `unitPrice × 62`.

## 26. Dependencies
TASK-012, TASK-015.

## 27. Deliverables
- Pricing engine service, preview endpoint, wizard preview panel.

## 28. Definition of Done
- All four billing methods unit-tested with edge cases; breakdown is persisted on every Extract line item generated from this engine.


---

# TASK-015 — Daily Operations Management

## 1. Objective
Implement Operation Log entry (meter readings, operating hours, downtime, notes) per generator/project/day, including the authorized correction workflow.

## 2. Business Purpose
Operation Logs are the ground truth for billable hours (Hourly contracts), fuel-consumption-rate denominators, and utilization reporting.

## 3. User Story
As a **Technician**, I want to record daily start/end meter readings for a generator on-site, so that operating hours are captured accurately for billing and reporting.

## 4. Actors
Admin, Operations Manager, Technician (write, Technician limited to assigned generators); Finance Manager, Accountant, Viewer (read).

## 5. Preconditions
TASK-008, TASK-011.

## 6. Scope
- OperationLog CRUD (create/list/view); correction workflow (`PATCH /:id/correct`) per Business Rule 6.3.
- Mobile-friendly quick-entry form (large touch targets, numeric keypad for meters).

## 7. Out of Scope
- Fuel entry (TASK-016).

## 8. Functional Requirements
- FR-001: `operatingHours = endMeter − startMeter`, computed server-side, never accepted as raw client input.
- FR-002: `endMeter < startMeter` is rejected (`422`) unless submitted through the correction endpoint by an authorized role.
- FR-003: `startMeter` on a new entry must be `>= Generator.currentMeter` at the time of entry (prevents impossible backward readings) unless it is itself a correction.
- FR-004: On successful entry, `Generator.currentMeter` is updated to `endMeter`.
- FR-005: Correction creates a new `OperationLog` (`correctionOf` = original id) and marks the original `status = Superseded`; both are queryable, only the latest counts toward totals.

## 9. Business Rules
Full detail per Business Rule 6.3.

## 10. Data Model — OperationLog
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| date | Date | Yes | — | not in the future | — |
| projectId | ObjectId → Project | Yes | — | ref exists | — |
| generatorId | ObjectId → Generator | Yes | — | ref exists | — |
| startMeter | Number | Yes | — | >= 0 | — |
| endMeter | Number | Yes | — | >= startMeter (or correction path) | — |
| operatingHours | Number | Yes | computed | = endMeter − startMeter | — |
| downtimeHours | Number | No | 0 | >= 0 | — |
| notes | String | No | "" | max 500 chars | — |
| status | String enum | No | "Active" | `Active\|Superseded` | — |
| correctionOf | ObjectId → OperationLog | No | null | — | Set only on correction records |
| correctionReason | String | No | "" | required if correctionOf set | — |

Indexes: `(generatorId, date)` compound; `(projectId, date)` compound; `status`.

## 11. Backend Architecture
- `modules/operations/{model,controller,service,routes,validation}.ts`; service updates `Generator.currentMeter` transactionally with the log write.

## 12. API Specification
### GET `/api/operations` — list, filter by `generatorId`, `projectId`, date range. Permissions: any authenticated (read).
### POST `/api/operations` — create. Permissions: Admin, Operations Manager, Technician (assigned generators only — enforced server-side by checking the Technician's assignment list).
### GET `/api/operations/:id` — detail.
### PATCH `/api/operations/:id/correct` — body `{ startMeter?, endMeter?, reason }`. Permissions: Admin, Operations Manager.
Errors: `422` `endMeter < startMeter` on a non-correction submit; `409` `startMeter < Generator.currentMeter` on a non-correction submit.

## 13. Frontend Requirements
- `OperationsListPage` (DataTable), `OperationEntryForm` (mobile-optimized: generator select, date, start/end meter numeric inputs, downtime, notes), `CorrectionDialog` (reason required, Admin/Ops Mgr only, shown as an action on a row).

## 14. Page Structure
```
Header: "Operations" | [+ New Entry]
Filters: Generator | Project | Date range
DataTable: date, generator, project, start/end meter, hours, downtime, status
Row action: Correct (Admin/Ops Mgr only)
```

## 15. UX Behavior
- Entry form pre-fills `startMeter` with the generator's `currentMeter` (read-only display) to reduce transcription error; only `endMeter` is typically entered.
- A rejected `endMeter < startMeter` submission shows an inline validation message directing the user to request a correction from a manager rather than resubmitting blindly.

## 16. Validation Rules
- `date` required, not future-dated; `endMeter >= startMeter` (non-correction); `downtimeHours >= 0` and `<= 24` per day-entry (sanity bound).

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ✅ (assigned) | ✅ |
| Create | ✅ | ✅ | ❌ | ❌ | ✅ (assigned) | ❌ |
| Correct | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Standard TASK-005 patterns; entry form resets after successful submit with a success toast and stays on the entry screen for rapid multi-generator logging.

## 19. Error Handling
- Concurrent entries for the same generator on the same day are allowed (multiple shifts) — not treated as a duplicate/conflict.

## 20. Edge Cases
- Entry spanning midnight (start one day, end logged next day) — V1 requires same-day entries; multi-day spans must be split into daily entries (documented as an Open Decision if a single multi-day entry is later required).
- Zero operating hours (`startMeter == endMeter`) is valid (generator idle, e.g. standby-only day) and must not error.
- A Technician attempting to log for a generator not on their assignment list → `403`.

## 21. Audit Requirements
- Create and Correct actions audited; Correct stores before/after meter values and the mandatory reason.

## 22. Notifications
N/A directly.

## 23. Reporting Impact
- Feeds the Hourly pricing method (TASK-014), Fuel consumption-rate denominator (TASK-016), and Operations report (TASK-028).

## 24. Testing Requirements
- **Unit**: operating-hours computation, backward-meter rejection.
- **API**: create, correction workflow, Technician-assignment enforcement.
- **E2E**: technician logs a reading → generator's currentMeter updates → reflected in profile.
- **Edge Case**: zero-hours entry accepted; backward meter rejected without correction.

## 25. Acceptance Criteria
- Given start meter 1230 and end meter 1250, when an operation log is created, then operating hours = 20 and `Generator.currentMeter` becomes 1250.
- Given an end meter lower than the start meter, when submitted through the normal create endpoint, then it is rejected with a clear validation error.
- Given an authorized correction with a valid reason, when submitted, then the original is marked Superseded and a new corrected record exists, both queryable.

## 26. Dependencies
TASK-008, TASK-011.

## 27. Deliverables
- OperationLog model/service/routes, entry + correction UI.

## 28. Definition of Done
- Correction workflow fully audited and tested; `Generator.currentMeter` never edited outside this module's transactional write path (except the Admin-only initial correction in TASK-008).

---

# TASK-016 — Fuel Management

## 1. Objective
Implement Fuel Log entry (liters, price per liter, computed total cost and consumption rate) per generator/project/day, wired to the Fuel Alert Engine.

## 2. Business Purpose
Fuel is typically the largest variable operating cost; accurate logging drives both cost tracking and anomaly detection (theft, leak, or misreporting).

## 3. User Story
As a **Technician**, I want to log fuel fill-ups for a generator, so that fuel cost and consumption are tracked accurately.

## 4. Actors
Admin, Operations Manager, Technician (write, assigned generators); Finance Manager, Accountant, Viewer (read).

## 5. Preconditions
TASK-008, TASK-015 (for operating-hours reference).

## 6. Scope
- FuelLog CRUD (create/list/view). Consumption rate computed from the nearest relevant Operation Log(s) for the same generator/period.

## 7. Out of Scope
- Alert creation logic itself (TASK-017) — this task only computes and stores the rate and calls the alert engine.

## 8. Functional Requirements
- FR-001: `totalCost = liters × pricePerLiter`, computed server-side via the money utility (TASK-003), never client-supplied.
- FR-002: `consumptionRate = liters ÷ operatingHours` where `operatingHours` is sourced from the relevant Operation Log(s) for the same generator/date range; if no operating hours are available, `consumptionRate = null` (displayed "N/A"), per Business Rule 6.4.
- FR-003: After saving, the service calls `FuelAlertEngineService.evaluate(fuelLogId)`.

## 9. Business Rules
Full detail per Business Rule 6.4.

## 10. Data Model — FuelLog
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| date | Date | Yes | — | not future | — |
| generatorId | ObjectId → Generator | Yes | — | ref exists | — |
| projectId | ObjectId → Project | Yes | — | ref exists | — |
| liters | Number | Yes | — | > 0 | — |
| pricePerLiter | Decimal128 | Yes | — | > 0 | — |
| totalCost | Decimal128 | Yes | computed | = liters × pricePerLiter | — |
| operatingHoursRef | Number | No | null | — | Sourced from Operation Logs, may be null |
| consumptionRate | Number | No | null | — | null if operatingHoursRef is 0/null |

Indexes: `(generatorId, date)`; `(projectId, date)`.

## 11. Backend Architecture
- `modules/fuel/{model,controller,service,routes,validation}.ts`; calls `fuel-alert-engine.service.ts` post-save.

## 12. API Specification
### GET `/api/fuel` — list, filter by `generatorId`, `projectId`, date range. Permissions: any authenticated (read).
### POST `/api/fuel` — create. Permissions: Admin, Operations Manager, Technician (assigned).
### GET `/api/fuel/:id` — detail, including which Operation Log(s) contributed the `operatingHoursRef`.
Errors: `422` invalid liters/price.

## 13. Frontend Requirements
- `FuelListPage` (DataTable with a "consumption rate vs. normal" variance column), `FuelEntryForm`, consumption analytics mini-chart (Recharts) on the Generator profile's Fuel tab.

## 14. Page Structure
```
Header: "Fuel" | [+ New Entry]
Filters: Generator | Project | Date range
DataTable: date, generator, liters, price/L, total cost, consumption rate, variance badge
```

## 15. UX Behavior
- Consumption rate cell shows "N/A" (not "0" or "∞") when operating hours are unavailable/zero, with a tooltip explaining why.
- A row that triggered an alert shows a small warning icon linking to the alert.

## 16. Validation Rules
- `liters > 0`, `pricePerLiter > 0`.

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ✅ (assigned) | ✅ |
| Create | ✅ | ✅ | ❌ | ❌ | ✅ (assigned) | ❌ |

## 18. State Management
- Standard TASK-005 patterns.

## 19. Error Handling
- Missing operating-hours reference is not an error — it's a valid, displayed "N/A" state.

## 20. Edge Cases
- Fuel logged for a generator with no Operation Log at all in the period ("fuel without operation records") — allowed, cost still tracked, consumption rate `N/A`.
- Multiple fuel fill-ups same day for the same generator — allowed, each is a distinct log; consumption rate is evaluated per fill-up against the operating hours in its own reference window, not double-counted.

## 21. Audit Requirements
- Create audited (fuel entries are not correctable in V1 the way meters are — a wrong entry is voided via a reversing entry with a note, keeping history intact; documented as an Open Decision if a direct correction workflow is later required).

## 22. Notifications
- None created directly by this task (delegated to TASK-017).

## 23. Reporting Impact
- Feeds Fuel Consumption report, Generator Profitability (fuel cost), Dashboard total fuel consumption/cost KPIs.

## 24. Testing Requirements
- **Unit**: totalCost computation, zero-operating-hours → null rate.
- **API**: create, Technician-assignment enforcement.
- **Edge Case**: fuel without any operation record.

## 25. Acceptance Criteria
- Given 200 liters over 100 operating hours, when a fuel log is created, then consumption rate = 2 liters/hour.
- Given zero operating hours in the reference window, when a fuel log is created, then consumption rate displays "N/A", not an error or zero.

## 26. Dependencies
TASK-008, TASK-015.

## 27. Deliverables
- FuelLog model/service/routes, list + entry UI, consumption analytics chart.

## 28. Definition of Done
- Alert engine is invoked on every fuel log creation (verified via integration test); no divide-by-zero anywhere in the codebase for this formula.

---

# TASK-017 — Fuel Consumption Alert Engine

## 1. Objective
Implement abnormal fuel consumption detection, alert severity/lifecycle, deduplication, and recipient routing, per Business Rule 6.5.

## 2. Business Purpose
Abnormal consumption is often the earliest signal of fuel theft, a mechanical fault, or a data-entry error; timely, non-spammy alerting protects margin.

## 3. User Story
As an **Operations Manager**, I want to be alerted when a generator's fuel consumption is abnormally high, so that I can investigate before it becomes a recurring loss.

## 4. Actors
Consumed by TASK-016; alerts surfaced to Operations Manager, assigned Technician, Admin.

## 5. Preconditions
TASK-016; TASK-026 (Notification Engine) for actual dispatch — this task creates the domain alert record and hands it to the Notification Engine.

## 6. Scope
- `FuelAlertEngineService.evaluate(fuelLogId)`: compares `consumptionRate` to `Generator.normalFuelConsumption × (1 + tolerancePercent)`.
- Alert lifecycle: `Open → Acknowledged → Resolved` (manual or auto).
- Deduplication: at most one Open/Acknowledged alert per generator.

## 7. Out of Scope
- The generic Notification delivery mechanism (bell icon, read/unread) — TASK-026.

## 8. Functional Requirements
- FR-001: Threshold and severity bands are read from `SystemSetting` (default 15%/30%, TASK-030), never hardcoded.
- FR-002: If an Open/Acknowledged alert already exists for the generator, a new abnormal reading updates `lastOccurrenceAt`/`occurrenceCount` rather than creating a duplicate.
- FR-003: If the *next* fuel log for that generator is within tolerance, the existing Open/Acknowledged alert transitions to `Resolved` with `resolutionNote = "auto-resolved: consumption returned to normal range"`.
- FR-004: Manual resolution requires a non-empty `resolutionNote`.

## 9. Business Rules
Full detail per Business Rule 6.5.

## 10. Data Model — FuelAlert
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| generatorId | ObjectId → Generator | Yes | — | ref exists | — |
| severity | String enum | Yes | — | `Warning\|Critical` | — |
| status | String enum | No | "Open" | `Open\|Acknowledged\|Resolved` | — |
| firstOccurrenceAt | Date | Yes | now | — | — |
| lastOccurrenceAt | Date | Yes | now | — | — |
| occurrenceCount | Number | No | 1 | >= 1 | — |
| triggeringFuelLogId | ObjectId → FuelLog | Yes | — | most recent trigger | — |
| resolutionNote | String | No | "" | required to manually resolve | — |
| resolvedAt | Date | No | null | — | — |
| resolvedBy | String enum | No | null | `system\|user` | — |

Index: `(generatorId, status)` — enforces the "at most one Open/Acknowledged" invariant via a partial unique index.

## 11. Backend Architecture
- `modules/fuel-alert-engine/{model,service,controller,routes}.ts`.

## 12. API Specification
### GET `/api/fuel-alerts` — list, filter by `status`, `severity`, `generatorId`. Permissions: Admin, Operations Manager, Technician (assigned).
### POST `/api/fuel-alerts/:id/acknowledge` — Permissions: Admin, Operations Manager, Technician (assigned).
### POST `/api/fuel-alerts/:id/resolve` — body `{ resolutionNote }`. Permissions: Admin, Operations Manager.

## 13. Frontend Requirements
- Alert list/badge in the Fuel module and on the Generator profile's Fuel tab; `AcknowledgeButton`, `ResolveDialog` (note required).

## 14. Page Structure
```
Fuel > Alerts tab
DataTable: generator, severity, status, first/last occurrence, occurrence count
Row actions: Acknowledge | Resolve
```

## 15. UX Behavior
- Severity badge colors: Warning = amber, Critical = red.
- Resolve action requires the note field to be non-empty before the Confirm button enables.

## 16. Validation Rules
- `resolutionNote` required (min 5 chars) for manual resolve.

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ❌ | ❌ | ✅ (assigned) | ❌ |
| Acknowledge | ✅ | ✅ | ❌ | ❌ | ✅ (assigned) | ❌ |
| Resolve | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Standard TASK-005 patterns; alert count badge in the app Header reflects Open+Acknowledged count for the current user's visible generators.

## 19. Error Handling
- Attempting to resolve without a note → `422` with a field error on `resolutionNote`.

## 20. Edge Cases
- Two abnormal readings in rapid succession for the same generator → single alert, `occurrenceCount` incremented, not two alerts.
- A generator resolved, then abnormal again the next day → a *new* alert is created (previous one is terminal/Resolved, not reopened), preserving history.

## 21. Audit Requirements
- Acknowledge and Resolve actions audited with actor and note.

## 22. Notifications
- Trigger: consumption exceeds threshold. Severity: per band. Recipients: Operations Manager, assigned Technician, Admin. Message: e.g. "GEN-014 consumption 3.1 L/h vs. normal 2.0 L/h (+55%)". Created on first occurrence only (dedup per FR-002); resolution is a separate notification event ("Alert resolved").

## 23. Reporting Impact
- Feeds Dashboard "Abnormal Fuel Consumption" KPI/alert list and the Fuel Consumption report's variance column.

## 24. Testing Requirements
- **Unit**: threshold/severity band logic, dedup logic, auto-resolve logic.
- **API**: acknowledge/resolve permission matrix, resolve-without-note rejected.
- **Edge Case**: rapid repeated abnormal readings produce one alert with incrementing count.

## 25. Acceptance Criteria
- Given consumption 20% above normal, when evaluated, then a `Warning` alert is created (or an existing Open one updated).
- Given consumption returns to normal on the next fuel log, when evaluated, then the alert auto-resolves with the standard system note.
- Given a manual resolve without a note, when submitted, then it is rejected.

## 26. Dependencies
TASK-016; TASK-026 for delivery.

## 27. Deliverables
- FuelAlert model/service/routes, alert list UI, acknowledge/resolve actions.

## 28. Definition of Done
- Dedup invariant enforced at the database level (partial unique index), not just application logic.

---

# TASK-018 — Maintenance Management

## 1. Objective
Implement Maintenance record CRUD (preventive/corrective), cost breakdown, and lifecycle (Open → In Progress → Completed/Cancelled), enforcing at most one open maintenance record per generator.

## 2. Business Purpose
Maintenance cost and downtime are core inputs to profitability and to the generator's operational status; disciplined tracking prevents both over-maintenance cost blindness and unsafe under-maintenance.

## 3. User Story
As a **Technician**, I want to open and complete maintenance records with a full cost breakdown, so that maintenance cost and history are tracked accurately per generator.

## 4. Actors
Admin, Operations Manager, Technician (write, assigned); Finance Manager, Accountant, Viewer (read).

## 5. Preconditions
TASK-008.

## 6. Scope
- Maintenance CRUD: `type`, `date`, `meter`, `partsCost`, `oilCost`, `laborCost`, `transportCost`, `totalCost` (computed), lifecycle actions (`open`, `start`, `complete`, `cancel`).
- Enforced invariant: at most one `Open`/`In Progress` record per generator.

## 7. Out of Scope
- `nextMaintenanceMeter` scheduling logic itself (TASK-019) — this task stores the maintenance-type cycle input and calls the Schedule Engine on completion.

## 8. Functional Requirements
- FR-001: `totalCost = partsCost + oilCost + laborCost + transportCost`, computed server-side.
- FR-002: Opening a new maintenance record for a generator that already has an Open/In Progress record is rejected (`409`).
- FR-003: Opening/starting a maintenance record triggers Status Engine recalculation (generator → Under Maintenance, unless overridden by a higher-priority Stopped state).
- FR-004: Completing a maintenance record triggers the Maintenance Schedule Engine to compute `nextMaintenanceMeter` and re-triggers Status Engine recalculation.

## 9. Business Rules
Full detail per Business Rule 6.6 and the priority interaction in 6.1.

## 10. Data Model — Maintenance
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| generatorId | ObjectId → Generator | Yes | — | ref exists | — |
| type | String enum | Yes | — | `Preventive\|Corrective` | — |
| status | String enum | No | "Open" | `Open\|In Progress\|Completed\|Cancelled` | — |
| date | Date | Yes | — | not future for Completed | — |
| meter | Number | Yes | — | >= Generator.currentMeter at open time | — |
| partsCost | Decimal128 | No | 0 | >= 0 | — |
| oilCost | Decimal128 | No | 0 | >= 0 | — |
| laborCost | Decimal128 | No | 0 | >= 0 | — |
| transportCost | Decimal128 | No | 0 | >= 0 | — |
| totalCost | Decimal128 | Yes | computed | — | — |
| maintenanceCycleOverride | Number | No | null | > 0 | Overrides Generator default cycle for this record |
| nextMaintenanceMeter | Number | No | null | set on completion | — |
| notes | String | No | "" | max 500 | — |

Index: partial unique index enforcing one `Open`/`In Progress` per `generatorId`.

## 11. Backend Architecture
- `modules/maintenance/{model,controller,service,routes,validation}.ts`; calls `status-engine.service.ts` and `maintenance-schedule-engine.service.ts`.

## 12. API Specification
### GET `/api/maintenance` — list, filter by `generatorId`, `status`, `type`, date range. Permissions: any authenticated (read).
### POST `/api/maintenance` — open a new record. Permissions: Admin, Operations Manager, Technician (assigned).
### PATCH `/api/maintenance/:id` — update costs/notes while Open/In Progress. Permissions: Admin, Operations Manager, Technician (assigned).
### POST `/api/maintenance/:id/start` — Open → In Progress. Permissions: Admin, Operations Manager, Technician (assigned).
### POST `/api/maintenance/:id/complete` — → Completed, triggers schedule engine. Permissions: Admin, Operations Manager.
### POST `/api/maintenance/:id/cancel` — body `{ reason }`. Permissions: Admin, Operations Manager.
Errors: `409` generator already has an open record.

## 13. Frontend Requirements
- `MaintenanceListPage`, `MaintenanceFormDialog` (cost fields with live total), lifecycle action buttons, `CancelDialog`.

## 14. Page Structure
```
Header: "Maintenance" | [+ New Maintenance]
Filters: Generator | Status | Type | Date range
DataTable: generator, type, status, date, meter, total cost, next due
```

## 15. UX Behavior
- Cost fields update a live-computed total as the user types (client-side preview; server recomputes authoritatively on save).
- Completing shows a summary including the newly computed `nextMaintenanceMeter`.

## 16. Validation Rules
- All cost fields `>= 0`; `meter` required and sane relative to current generator meter.

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ✅ (assigned) | ✅ |
| Open/Edit/Start | ✅ | ✅ | ❌ | ❌ | ✅ (assigned) | ❌ |
| Complete/Cancel | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Standard TASK-005 patterns.

## 19. Error Handling
- Opening a second maintenance record for an already-open generator → `409` with a link to the existing open record.

## 20. Edge Cases
- "Maintenance while generator is rented" — allowed; status shows Under Maintenance per the priority table, commercial assignment is unaffected (6.1).
- Cancelling an In Progress maintenance record does not compute a `nextMaintenanceMeter` (only Completion does).

## 21. Audit Requirements
- Open, cost edits, Start, Complete, Cancel are all audited (Complete/Cancel with reason where applicable).

## 22. Notifications
- Upcoming/overdue maintenance alerts are created by TASK-019, not this task directly.

## 23. Reporting Impact
- Feeds Maintenance report, Generator Profitability (maintenance cost), Dashboard maintenance cost KPI.

## 24. Testing Requirements
- **Unit**: totalCost computation, one-open-record invariant.
- **API**: full lifecycle, permission matrix, double-open rejection.
- **Edge Case**: maintenance opened while generator has an active contract.

## 25. Acceptance Criteria
- Given parts 1000 + oils 200 + labor 500 + transport 300, when a maintenance record is saved, then totalCost = 2000.
- Given a generator with an Open maintenance record, when a second is attempted, then it is rejected with `409` referencing the existing record.
- Given a maintenance record is completed at meter 5000 with a 250-hour cycle, when completed, then `nextMaintenanceMeter` = 5250.

## 26. Dependencies
TASK-008; integrates with TASK-009, TASK-019.

## 27. Deliverables
- Maintenance model/service/routes, list + entry UI, lifecycle actions.

## 28. Definition of Done
- One-open-record invariant enforced at the DB level; Status Engine and Schedule Engine both correctly triggered on every relevant transition.

---

# TASK-019 — Maintenance Schedule Engine

## 1. Objective
Compute `nextMaintenanceMeter` on maintenance completion and generate upcoming/overdue maintenance alerts, per Business Rule 6.6.

## 2. Business Purpose
Predictive maintenance scheduling prevents both costly unplanned failures and unnecessary early servicing.

## 3. User Story
As an **Operations Manager**, I want to be notified before a generator reaches its next maintenance due meter, so that I can schedule service proactively.

## 4. Actors
Consumed by TASK-018; alerts surfaced to Operations Manager, Technician (assigned), Admin.

## 5. Preconditions
TASK-018; TASK-026 for delivery.

## 6. Scope
- `MaintenanceScheduleEngineService.computeNext(maintenanceId)` — sets `nextMaintenanceMeter` on completion.
- A scheduled job comparing each active generator's `currentMeter` to its latest `nextMaintenanceMeter` to raise "Upcoming" (within a configurable meter-hours buffer, default 50 hours) and "Overdue" (meter has passed the threshold) alerts.

## 7. Out of Scope
- The Maintenance record lifecycle itself (TASK-018).

## 8. Functional Requirements
- FR-001: `nextMaintenanceMeter = meter (at completion) + (maintenanceCycleOverride ?? Generator.maintenanceCycleHours)`.
- FR-002: The comparison job runs on a schedule (e.g. hourly) and on every new Operation Log write (so an "Overdue" alert appears promptly after the meter crosses the threshold, not only on the next scheduled sweep).
- FR-003: Deduplication mirrors the Fuel Alert Engine pattern — at most one Open/Acknowledged maintenance-schedule alert per generator at a time; it upgrades from "Upcoming" to "Overdue" in place rather than creating a second alert.

## 9. Business Rules
Full detail per Business Rule 6.6; alert lifecycle mirrors 6.5's pattern (Open → Acknowledged → Resolved, auto-resolved when a new Maintenance record is opened for that generator).

## 10. Data Model — MaintenanceAlert
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| generatorId | ObjectId → Generator | Yes | — | ref exists | — |
| level | String enum | Yes | — | `Upcoming\|Overdue` | — |
| status | String enum | No | "Open" | `Open\|Acknowledged\|Resolved` | — |
| dueAtMeter | Number | Yes | — | — | The `nextMaintenanceMeter` this alert refers to |
| currentMeterAtCreation | Number | Yes | — | — | — |
| resolvedAt | Date | No | null | — | — |
| resolvedBy | String enum | No | null | `system\|user` | — |

Index: partial unique on `(generatorId, status)` for Open/Acknowledged.

## 11. Backend Architecture
- `modules/maintenance-schedule-engine/{model,service,job}.ts`.

## 12. API Specification
### GET `/api/maintenance-alerts` — list, filter by `status`, `level`, `generatorId`. Permissions: Admin, Operations Manager, Technician (assigned).
### POST `/api/maintenance-alerts/:id/acknowledge` — Permissions: Admin, Operations Manager, Technician (assigned).

## 13. Frontend Requirements
- Alert badge/list on Maintenance module and Generator profile's Maintenance tab.

## 14. Page Structure
```
Maintenance > Alerts tab
DataTable: generator, level, dueAtMeter, currentMeter, status
```

## 15. UX Behavior
- "Overdue" renders red, "Upcoming" renders amber; both link directly to "Open new Maintenance" pre-filled for that generator.

## 16. Validation Rules
N/A (system-generated).

## 17. Permissions
| Action | Admin | Ops Mgr | Technician | Others |
|---|---|---|---|---|
| View/Acknowledge | ✅ | ✅ | ✅ (assigned) | ❌ |

## 18. State Management
N/A beyond standard list caching.

## 19. Error Handling
N/A (system job; failures are logged, not user-facing).

## 20. Edge Cases
- A generator whose `maintenanceCycleHours` is changed after its last completed maintenance uses the new value only for the *next* schedule computation, not retroactively (consistent with TASK-008's edge case).
- Opening a new Maintenance record for a generator with an Open/Acknowledged schedule alert auto-resolves that alert ("addressed by new maintenance record").

## 21. Audit Requirements
- Acknowledge audited; auto-resolution logged with the triggering maintenance record id.

## 22. Notifications
- Trigger: meter within buffer of due (Upcoming) or past due (Overdue). Severity: Upcoming=info/warning, Overdue=critical. Recipients: Operations Manager, assigned Technician, Admin. Dedup/resolution as above.

## 23. Reporting Impact
- Feeds Dashboard "Upcoming Maintenance" KPI and the Maintenance report's due-status column.

## 24. Testing Requirements
- **Unit**: due-threshold math, dedup/upgrade-in-place logic.
- **API**: acknowledge permission matrix.
- **Integration**: new Operation Log pushing a generator's meter past due triggers an Overdue alert without waiting for the scheduled sweep.

## 25. Acceptance Criteria
- Given `nextMaintenanceMeter = 5250` and current meter reaches 5260, when the job/trigger runs, then an Overdue alert is created (or upgraded from Upcoming).
- Given a new Maintenance record is opened for that generator, when saved, then the existing schedule alert auto-resolves.

## 26. Dependencies
TASK-018; TASK-026.

## 27. Deliverables
- MaintenanceAlert model/service/job, alert list UI.

## 28. Definition of Done
- Overdue alerts appear within one operation-log-write cycle, not only on the next scheduled sweep; dedup invariant enforced at the DB level.


---

# TASK-020 — Extract / Invoice Management

## 1. Objective
Implement Extract creation (using the Pricing Engine for rent), lifecycle (Draft → Under Review → Approved → Partially Collected → Collected, plus Cancelled), and correction/cancellation rules that protect approved documents from silent edits.

## 2. Business Purpose
The Extract is the customer-facing billing document and the trigger for the customer ledger; correctness and immutability once approved are essential for trust and for VAT compliance.

## 3. User Story
As a **Finance Manager**, I want to generate an extract for a billing period with rent, services, transport, and discounts, so that the customer can be billed accurately and the amount is defensible.

## 4. Actors
Admin, Finance Manager (approve); Accountant (create); Operations Manager, Viewer (read).

## 5. Preconditions
TASK-012, TASK-014.

## 6. Scope
- Extract creation wizard: select customer/project/contract(s)/period → Pricing Engine pre-fills Rent per generator → add Services/Transport/Discount line items → preview Financial Calculation Engine totals (TASK-021) → save as Draft.
- Lifecycle transitions: `Draft → Under Review → Approved → Partially Collected → Collected`, and `→ Cancelled` from any non-Collected state.

## 7. Out of Scope
- The VAT/rounding/total formulas themselves (TASK-021).
- Receipt allocation logic (TASK-022) — this task only exposes the collection-status fields that Receipts update.

## 8. Functional Requirements
- FR-001: Extract `number` is auto-generated, sequential, unique, never reused.
- FR-002: `Draft` and `Under Review` extracts are freely editable; `Approved` and beyond are never directly edited — only cancelled (with a reversing ledger entry) and, if needed, reissued as a new Draft referencing the cancelled one.
- FR-003: `Draft → Approved` transition (via `Under Review`) snapshots the current VAT rate into `vatRateSnapshot` and locks all financial fields.
- FR-004: Collection status (`Partially Collected`/`Collected`) is set exclusively by the Receipts module (TASK-022) as allocations are recorded — never manually toggled here.

## 9. Business Rules
Full detail per Business Rule 6.7 (Financial Calculation Engine performs the actual math).

## 10. Data Model — Extract
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| number | String | Yes | auto | unique | — |
| customerId | ObjectId → Customer | Yes | — | ref exists | — |
| projectId | ObjectId → Project | Yes | — | ref exists | — |
| contractIds | [ObjectId → RentalContract] | Yes | [] | at least one | — |
| period.start / period.end | Date | Yes | — | end >= start | — |
| lineItems | [ {type, description, amount} ] | Yes | [] | type ∈ `rent\|transport\|services` | Embedded — small, bounded |
| discounts | Decimal128 | No | 0 | >= 0, <= totalWork | — |
| vatRateSnapshot | Number | No | null | set at approval | e.g. 0.14 |
| vat | Decimal128 | No | null | computed at approval | — |
| totalBeforeVat | Decimal128 | No | null | computed | — |
| finalTotal | Decimal128 | No | null | computed at approval | — |
| status | String enum | No | "Draft" | `Draft\|Under Review\|Approved\|Partially Collected\|Collected\|Cancelled` | — |
| collectedAmount | Decimal128 | No | 0 | maintained by Receipts | — |
| cancelReason | String | No | "" | required if Cancelled | — |
| customerNameSnapshot | String | No | — | set at approval | Print immutability |

Indexes: `number` unique; `(customerId, status)`; `(projectId, period.start)`.

## 11. Backend Architecture
- `modules/extracts/{model,controller,service,routes,validation}.ts`; delegates totals to `financial-engine.service.ts`, rent pre-fill to `contract-pricing-engine.service.ts`.

## 12. API Specification
### GET `/api/extracts` — list, filter by `customerId`, `projectId`, `status`, date range. Permissions: any authenticated (read).
### POST `/api/extracts` — create Draft. Permissions: Admin, Finance Manager, Accountant.
### PATCH `/api/extracts/:id` — edit while Draft/Under Review. Permissions: Admin, Finance Manager, Accountant.
### POST `/api/extracts/:id/submit-review` — Draft → Under Review. Permissions: Admin, Finance Manager, Accountant.
### POST `/api/extracts/:id/approve` — Under Review → Approved (snapshots VAT, locks). Permissions: Admin, Finance Manager.
### POST `/api/extracts/:id/cancel` — body `{ reason }`. Permissions: Admin, Finance Manager.
Errors: `422` discounts exceed total work; `409` editing a locked (Approved+) extract.

## 13. Frontend Requirements
- `ExtractsListPage`, `ExtractCreationWizard` (period/contract select → rent preview → line items → totals preview), `ExtractDetailPage` (locked view post-approval, print-style layout), `ApproveConfirmDialog`, `CancelDialog`.

## 14. Page Structure
```
Header: "Extracts" | [+ New Extract]
Filters: Customer | Project | Status | Date range
DataTable: number, customer, project, period, total, status, collected/remaining
--
Extract Detail (locked once Approved+)
Sections: Line items | Discounts | VAT | Final Total | Collection progress | Print/Export
```

## 15. UX Behavior
- Draft/Under Review show an editable form; Approved+ renders a read-only, print-styled document with a visible "Approved — locked" indicator.
- Attempting to edit a locked extract shows a clear message directing the user to Cancel + reissue instead.

## 16. Validation Rules
- `discounts <= totalWork` (rejects negative `netBeforeVat`).
- At least one line item required to submit for review.

## 17. Permissions
| Action | Admin | Finance Mgr | Accountant | Ops Mgr | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create/Edit Draft | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cancel | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Wizard state local until Draft save; totals preview recalculated live via the Financial Engine's preview endpoint (no client-side re-implementation of VAT math).

## 19. Error Handling
- Discounts exceeding total work → `422` inline on the Discounts field with the max allowed shown.
- Approve attempted on an extract with zero line items → `409`.

## 20. Edge Cases
- "Cancelled extracts" — cancelling an Approved+ extract creates a reversing ledger entry (6.2) and is blocked once `collectedAmount > 0` unless an offsetting Credit Note workflow is used (documented as an Open Decision — V1 requires collectedAmount = 0 to cancel directly; partially-collected extracts must be corrected via credit note, not raw cancellation).
- VAT rate changes in System Settings never affect already-approved extracts (snapshot rule, 6.7).
- Historical extracts remain fully viewable/printable after the customer or project is later deactivated.

## 21. Audit Requirements
- Create, Edit (Draft/Under Review), Submit-Review, Approve, Cancel — all audited; Approve logs the VAT snapshot value taken.

## 22. Notifications
- "Extract approaching customer-agreed due date unpaid" is handled by the Ledger Engine/overdue logic (TASK-023), not here directly.

## 23. Reporting Impact
- Primary input to Dashboard revenue KPI, Customer Statement, Uncollected Extracts report, and Profitability Engine.

## 24. Testing Requirements
- **Unit**: lifecycle transition guard, discount-exceeds-total rejection.
- **API**: full lifecycle, locked-edit rejection, permission matrix.
- **E2E**: create → approve → verify locked, verify appears in customer statement.
- **Edge Case**: cancel with `collectedAmount > 0` blocked.

## 25. Acceptance Criteria
- Given rent 100,000 + transport 10,000 + services 5,000 and discount 15,000, when approved with a 14% VAT rate, then VAT = 14,000 and final total = 114,000, matching Business Rule 6.7's worked example.
- Given an Approved extract, when a direct edit is attempted, then it is rejected with a message directing to cancel/reissue.

## 26. Dependencies
TASK-012, TASK-014; integrates with TASK-021, TASK-022, TASK-023.

## 27. Deliverables
- Extract model/service/routes, creation wizard, detail/print view, lifecycle actions.

## 28. Definition of Done
- Worked example from Business Rule 6.7 passes as an automated test verbatim; no code path mutates an Approved+ extract's financial fields.

---

# TASK-021 — Financial Calculation Engine

## 1. Objective
Centralize all extract-related monetary formulas (Total Work, Net Before VAT, VAT, Final Total), decimal-safe rounding, and VAT-rate snapshotting, exposed as one reusable service consumed by Extracts, Reports, and Dashboard.

## 2. Business Purpose
Financial correctness must be computed in exactly one place; any duplication risks silent discrepancies between the invoice a customer sees and the number a report shows.

## 3. User Story
As a **Finance Manager**, I want every financial total in the system to come from one trusted calculation, so that invoices, statements, and reports are always consistent with each other.

## 4. Actors
Consumed by TASK-020, TASK-023, TASK-025, TASK-028.

## 5. Preconditions
TASK-003 (money utility), TASK-020.

## 6. Scope
- `FinancialEngineService.calculateExtractTotals({ rent, transport, services, discounts, vatRate })` → `{ totalWork, netBeforeVat, vat, finalTotal }`.
- Rounding policy enforcement (2dp, ROUND_HALF_UP, applied once at each formula's final step).
- VAT-rate snapshot read (from `SystemSetting`) at the Draft→Approved transition only.

## 7. Out of Scope
- Rent calculation itself (TASK-014, a separate concern feeding this engine's `rent` input).

## 8. Functional Requirements
- FR-001: `totalWork = rent + transport + services`.
- FR-002: `netBeforeVat = totalWork − discounts`; rejects (throws `ValidationError`) if the result would be negative.
- FR-003: `vat = netBeforeVat × vatRate`, rounded to 2dp.
- FR-004: `finalTotal = netBeforeVat + vat`, rounded to 2dp.
- FR-005: All intermediate additions/subtractions use `decimal.js`; only the final display value of each formula step is rounded — no compounding rounding error.

## 9. Business Rules
Full detail per Business Rule 6.7.

## 10. Data Model
None — pure computation service; consumers persist its output on their own documents (`Extract.vat`, etc.).

## 11. Backend Architecture
- `modules/financial-engine/service.ts`, no controller of its own (used internally + via TASK-020's preview endpoint).

## 12. API Specification
### POST `/api/extracts/preview-totals` — used by the creation wizard to preview totals before saving. Permissions: Admin, Finance Manager, Accountant.
Request Body: `{ "rent": "100000.00", "transport": "10000.00", "services": "5000.00", "discounts": "15000.00" }`
Response: `{ "success": true, "data": { "totalWork": "115000.00", "netBeforeVat": "100000.00", "vat": "14000.00", "finalTotal": "114000.00", "vatRateUsed": 0.14 } }`
Errors: `422` if discounts exceed totalWork.

## 13. Frontend Requirements
- Read-only totals summary panel within `ExtractCreationWizard` (TASK-020), recalculated on every line-item change via the preview endpoint (never recomputed client-side independently).

## 14. Page Structure
N/A (embedded).

## 15. UX Behavior
- Totals panel updates with a short debounce as line items change; a clear "Discount exceeds total" inline error blocks submission rather than silently clamping.

## 16. Validation Rules
- `discounts <= totalWork`. All monetary inputs `>= 0`.

## 17. Permissions
Same as TASK-020's create/edit matrix (preview is part of the creation flow).

## 18. State Management
N/A — stateless computation, always server-verified (client never trusts its own preview math for the final save).

## 19. Error Handling
- Negative `netBeforeVat` → `422 ValidationError`, never silently clamped to zero (Business Rule 6.7).

## 20. Edge Cases
- VAT rate exactly at a rounding boundary (e.g. resulting in `x.xx5`) — ROUND_HALF_UP is applied consistently and unit-tested at that exact boundary.
- Zero-amount extract (all line items zero) is mathematically valid (`total = 0`) though such an extract would typically not be created in practice — this task does not prohibit it; a business policy decision on whether to block zero-total extracts is documented as an Open Decision.

## 21. Audit Requirements
- The `vatRateUsed` at approval time is recorded on the Extract (TASK-020) and therefore auditable there; this engine itself has no separate audit trail (stateless).

## 22. Notifications
N/A.

## 23. Reporting Impact
- Every financial report and the Dashboard revenue KPI read `Extract.finalTotal`/`vat` as computed and stored by this engine — never recompute independently from raw inputs.

## 24. Testing Requirements
- **Unit**: the full worked example in Business Rule 6.7 (rent 100,000 + transport 10,000 + services 5,000 − discount 15,000 → VAT 14,000 → final 114,000); rounding-boundary cases; negative-net rejection.
- **API**: preview endpoint permission matrix.

## 25. Acceptance Criteria
- Given the Section 6.7 worked example inputs, when calculated, then the outputs match exactly (100,000 / 14,000 / 114,000).
- Given discounts greater than total work, when calculated, then a validation error is raised, not a negative total.

## 26. Dependencies
TASK-003, TASK-020.

## 27. Deliverables
- Financial engine service, preview endpoint, totals panel UI.

## 28. Definition of Done
- 100% branch coverage on the rounding and validation logic; no other module computes VAT/totals independently (verified by code review).

---

# TASK-022 — Receipts & Collections

## 1. Objective
Implement Receipt creation (amount, payment method, account/transfer reference) and allocation against one or more Extracts, updating each Extract's collection status.

## 2. Business Purpose
Receipts are how cash actually reduces a customer's outstanding balance; correct allocation is essential for accurate statements and collections follow-up.

## 3. User Story
As an **Accountant**, I want to record a customer payment and allocate it to specific extracts, so that outstanding balances are accurate and collections are traceable.

## 4. Actors
Admin, Finance Manager, Accountant (write); Operations Manager, Viewer (read).

## 5. Preconditions
TASK-020 (Approved extracts exist to allocate against).

## 6. Scope
- Receipt CRUD (create/list/view); allocation sub-array (which Extract(s) this receipt pays down and how much of each).
- Auto-update of each allocated Extract's `collectedAmount` and derived status (`Partially Collected`/`Collected`).

## 7. Out of Scope
- Ledger/balance aggregation itself (TASK-023) — this task only produces the transactions the ledger reads.

## 8. Functional Requirements
- FR-001: Receipt `number` auto-generated, unique.
- FR-002: A receipt's total `amount` must equal the sum of its `allocations[].amount` (or be left fully unallocated as an on-account credit — allowed, see Edge Cases).
- FR-003: An allocation amount cannot exceed an extract's remaining balance (`finalTotal − collectedAmount`) at the time of allocation.
- FR-004: On save, each allocated Extract's `collectedAmount` increases and status recomputes: `Collected` if `collectedAmount >= finalTotal`, else `Partially Collected`.
- FR-005: Only `Approved`, `Partially Collected` extracts (of the same customer) are selectable for allocation — never `Draft`/`Under Review`/`Cancelled`.

## 9. Business Rules
- Allocation is transactional: creating a receipt with allocations and updating the target extracts' collection state happens atomically (MongoDB transaction) so a partial failure never leaves an extract in an inconsistent collected amount.
- Overpayment (receipt amount exceeds total remaining across allocated extracts) is not silently absorbed — the excess must be either left unallocated (on-account credit, reducing the customer's overall balance per the Ledger Engine) or explicitly rejected, per the user's choice in the UI (see 20. Edge Cases).

## 10. Data Model — Receipt
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| number | String | Yes | auto | unique | — |
| customerId | ObjectId → Customer | Yes | — | ref exists | — |
| date | Date | Yes | — | not future | — |
| amount | Decimal128 | Yes | — | > 0 | — |
| paymentMethod | String enum | Yes | — | `Cash\|BankTransfer\|Cheque\|Card` | — |
| account | String | No | "" | required if BankTransfer/Cheque | — |
| transferNumber | String | No | "" | required if BankTransfer | — |
| allocations | [ {extractId, amount} ] | No | [] | Σ amounts <= receipt.amount | Embedded |
| status | String enum | No | "Confirmed" | `Confirmed\|Cancelled` | — |
| cancelReason | String | No | "" | required if Cancelled | — |

Indexes: `number` unique; `(customerId, date)`.

## 11. Backend Architecture
- `modules/receipts/{model,controller,service,routes,validation}.ts`; service uses a MongoDB transaction spanning the Receipt write and the affected Extracts' updates; calls into `customer-ledger-engine` for balance recompute triggers (cache invalidation only — the ledger itself is always computed live).

## 12. API Specification
### GET `/api/receipts` — list, filter by `customerId`, date range, `paymentMethod`. Permissions: any authenticated (read).
### POST `/api/receipts` — create with allocations. Permissions: Admin, Finance Manager, Accountant.
### GET `/api/receipts/:id` — detail.
### POST `/api/receipts/:id/cancel` — body `{ reason }`, reverses allocations. Permissions: Admin, Finance Manager.
Errors: `422` allocation exceeds extract remaining balance; `409` allocating to a non-allocatable-status extract.

## 13. Frontend Requirements
- `ReceiptsListPage`, `ReceiptEntryForm` (customer select → outstanding extracts list with remaining balances → allocate amounts, with an "unallocated / on-account" bucket shown live), `CancelDialog`.

## 14. Page Structure
```
Header: "Receipts" | [+ New Receipt]
Filters: Customer | Date range | Payment method
DataTable: number, customer, date, amount, method, allocated/unallocated
--
Receipt Entry
Customer select → Amount/method/account/transfer# → Allocation table (extract, remaining, allocate amount) → Unallocated balance indicator
```

## 15. UX Behavior
- Allocation table shows each open extract's remaining balance and an input capped at that remaining amount; the "unallocated" indicator updates live and must reach exactly 0 or be explicitly confirmed as an on-account credit before submit.
- Cancelling a receipt shows which extracts will have their collected amounts reversed, before confirming.

## 16. Validation Rules
- `amount > 0`; `Σ allocations <= amount`; each allocation `<= that extract's remaining balance`.
- `account`/`transferNumber` conditionally required by `paymentMethod`.

## 17. Permissions
| Action | Admin | Finance Mgr | Accountant | Ops Mgr | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Allocation table state is local to the form; outstanding-extracts list is fetched fresh on customer selection (never stale-cached across a session, since remaining balances change frequently).

## 19. Error Handling
- Allocation exceeding remaining balance → `422` inline on that row, not a generic form error.
- Concurrent allocation race (two receipts allocating to the same nearly-exhausted extract simultaneously) is handled via the MongoDB transaction re-checking remaining balance at write time, rejecting the second with a clear "balance changed, please refresh" error rather than allowing over-collection.

## 20. Edge Cases
- **Partial payments**: allowed and expected — extract moves to `Partially Collected`.
- **Overpayments**: the user must either reduce the allocation (leaving a genuine on-account credit, which reduces the customer's overall Ledger balance per 6.2 even though it isn't tied to a specific extract) or the system rejects submission until allocations are adjusted — the UI defaults to *requiring* an explicit choice, never silently over-allocating past an extract's remaining balance.
- **Duplicate receipts** (same customer, amount, date entered twice) are not blocked automatically (legitimate duplicate payments happen) but the entry form shows a non-blocking "similar receipt entered today" warning.
- Cancelling a receipt with allocations reverses each affected extract's `collectedAmount` and recomputes its status (e.g. back from `Collected` to `Partially Collected` or `Approved`).

## 21. Audit Requirements
- Create and Cancel audited, including the full allocation breakdown at time of action.

## 22. Notifications
N/A directly (overdue-customer alerting is TASK-023/026).

## 23. Reporting Impact
- Feeds Customer Statement, Uncollected Extracts report, Dashboard receipts/receivables KPIs.

## 24. Testing Requirements
- **Unit**: allocation-sum validation, remaining-balance-cap validation.
- **API**: create with allocations, over-allocation rejection, cancel-with-reversal, concurrent-allocation race test.
- **E2E**: record a partial payment → extract shows Partially Collected → record the remainder → extract shows Collected.
- **Edge Case**: overpayment handling, duplicate-receipt warning (non-blocking).

## 25. Acceptance Criteria
- Given an extract with a 114,000 final total and no prior collection, when a 50,000 receipt is fully allocated to it, then the extract status becomes `Partially Collected` with `collectedAmount = 50,000`.
- Given the same extract, when a further 64,000 is allocated, then status becomes `Collected`.
- Given an allocation attempt exceeding the extract's remaining balance, when submitted, then it is rejected with a specific error.

## 26. Dependencies
TASK-020; integrates with TASK-023.

## 27. Deliverables
- Receipt model/service/routes, entry + allocation UI, cancel/reversal flow.

## 28. Definition of Done
- Allocation and reversal are both transactionally safe under concurrent load (tested); no path allows an extract's `collectedAmount` to exceed `finalTotal`.

---

# TASK-023 — Customer Ledger & Balance Engine

## 1. Objective
Implement the derived Customer Statement/Ledger (chronological Debit/Credit/Balance) and the live balance calculation, sourced from Extracts, Receipts, and Credit Notes/Discounts — never stored as a mutable field.

## 2. Business Purpose
Finance needs a single, trustworthy, always-current view of what each customer owes, reconcilable line-by-line against source documents.

## 3. User Story
As a **Finance Manager**, I want a complete, accurate account statement per customer, so that I can confidently communicate balances and pursue collections.

## 4. Actors
Admin, Finance Manager, Accountant (view); Operations Manager (view, per matrix); Viewer.

## 5. Preconditions
TASK-020, TASK-022.

## 6. Scope
- `LedgerEngineService.getStatement(customerId, { from, to })` → chronological list of `{ date, type, reference, debit, credit, runningBalance }`.
- `LedgerEngineService.getBalance(customerId)` → current balance per Business Rule 6.2.
- Overdue detection (extract past its implied due date, still not fully collected) feeding Dashboard/Notifications.

## 7. Out of Scope
- Extract/Receipt creation themselves (TASK-020/022) — this engine only reads them.

## 8. Functional Requirements
- FR-001: `balance = Σ Approved+ extract totals − Σ confirmed receipt amounts − Σ credit notes/discounts`, computed live on every read (no stored/cached balance field that could drift — a short-lived, invalidate-on-write in-memory cache is permitted for performance, never as the source of truth).
- FR-002: Only `Extract.status ∈ {Approved, Partially Collected, Collected}` contribute a debit line; `Cancelled` extracts contribute a reversing entry referencing the original (net effect zero, but visible for traceability).
- FR-003: Statement entries are strictly chronological with a running balance column, and each entry links back to its source document.
- FR-004: "Overdue" = an Approved+ extract not fully collected whose period end (or an explicit due-date field, if later added) is more than a configurable grace period (default 30 days) in the past.

## 9. Business Rules
Full detail per Business Rule 6.2, including the ambiguity-resolved cancellation-as-reversing-entry rule from 6.7/6.2.

## 10. Data Model
No new persisted collection for the balance itself (computed). A lightweight `CreditNote` model is introduced to support manual adjustments/discounts outside of extract line-item discounts:

| Field (CreditNote) | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| number | String | Yes | auto | unique | — |
| customerId | ObjectId → Customer | Yes | — | ref exists | — |
| amount | Decimal128 | Yes | — | > 0 | — |
| reason | String | Yes | — | min 5 chars | — |
| relatedExtractId | ObjectId → Extract | No | null | ref exists | Optional linkage |
| status | String enum | No | "Confirmed" | `Confirmed\|Cancelled` | — |

## 11. Backend Architecture
- `modules/customer-ledger-engine/{service,controller,routes}.ts`; `modules/credit-notes/{model,controller,service,routes,validation}.ts` (small, standalone module feeding this engine).

## 12. API Specification
### GET `/api/customers/:id/statement` — query `from`, `to`. Permissions: any authenticated (read, per matrix).
Response:
```json
{ "success": true, "data": { "entries": [ { "date":"2026-01-05","type":"Extract","reference":"EX-2026-0012","debit":"114000.00","credit":"0.00","runningBalance":"114000.00" }, { "date":"2026-01-20","type":"Receipt","reference":"RC-2026-0031","debit":"0.00","credit":"50000.00","runningBalance":"64000.00" } ], "closingBalance": "64000.00" } }
```
### GET `/api/customers/:id/balance` — current balance only (lightweight, used in list views). Permissions: any authenticated (read).
### POST `/api/credit-notes` — create. Permissions: Admin, Finance Manager.

## 13. Frontend Requirements
- Customer Profile "Statement" tab: DataTable of ledger entries with running balance column, closing balance summary card, date-range filter, export action (TASK-029).

## 14. Page Structure
```
Customer Profile > Statement tab
Filters: Date range
Summary card: Closing Balance
DataTable: date, type, reference (linked), debit, credit, running balance
```

## 15. UX Behavior
- Running balance column colored consistent with the balance-sign convention (red = owes, green = credit).
- Each reference is a clickable link to the source Extract/Receipt/Credit Note.

## 16. Validation Rules
- CreditNote `amount > 0`, `reason` required.

## 17. Permissions
| Action | Admin | Finance Mgr | Accountant | Ops Mgr | Technician | Viewer |
|---|---|---|---|---|---|---|
| View Statement/Balance | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create Credit Note | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Statement query is always server-computed; frontend never sums entries itself for the closing balance (avoids drift between displayed rows and the summary card).

## 19. Error Handling
- Invalid date range (`to < from`) → `422`.

## 20. Edge Cases
- A customer with zero financial history returns an empty statement with `closingBalance: 0.00`, not an error.
- A cancelled extract's reversing entry appears in the statement dated at the cancellation date (not the original extract date), so historical running-balance snapshots for prior periods remain accurate.
- Worked example from Business Rule 6.4 (Extracts 1,250,000 − Receipts 850,000 − Discounts 50,000 = 350,000) is used as a golden test.

## 21. Audit Requirements
- Credit Note create/cancel audited.

## 22. Notifications
- "Overdue customer" alert (per FR-004) — created here, dispatched via TASK-026.

## 23. Reporting Impact
- Directly powers the Customer Statement report, Uncollected Extracts report, and Dashboard "Total Outstanding Receivables"/"Overdue Customers" KPIs.

## 24. Testing Requirements
- **Unit**: the Section 6.2/15.4 worked example as a golden test; cancelled-extract reversal math; overdue threshold logic.
- **API**: statement endpoint with various date ranges, permission matrix.
- **Edge Case**: zero-history customer, mixed cancelled/active extracts.

## 25. Acceptance Criteria
- Given Extracts 1,250,000, Receipts 850,000, and Discounts 50,000, when the balance is computed, then it equals 350,000.
- Given an Approved extract is later cancelled, when the statement is viewed, then a reversing entry appears and the closing balance reflects zero net effect from that extract.

## 26. Dependencies
TASK-020, TASK-022.

## 27. Deliverables
- Ledger engine service, Credit Note module, Statement UI, balance endpoint.

## 28. Definition of Done
- Balance is provably never stored as a mutable, driftable field anywhere in the codebase; golden-example tests pass exactly.

---

# TASK-024 — Expense Management

## 1. Objective
Implement operating/administrative Expense CRUD with categories and optional Generator/Project attribution, plus the explicit shared-expense allocation action referenced in Business Rule 6.8.

## 2. Business Purpose
Expenses not directly tied to billing (fuel, maintenance) still affect true profitability and must be tracked, categorized, and optionally attributed without corrupting per-generator profit figures.

## 3. User Story
As an **Accountant**, I want to record operating and administrative expenses, so that true costs are visible in profitability and financial reports.

## 4. Actors
Admin, Finance Manager, Accountant (write); Operations Manager, Viewer (read).

## 5. Preconditions
TASK-002–006.

## 6. Scope
- Expense CRUD: `category`, `date`, `amount`, optional `generatorId`, optional `projectId`, `description`.
- "Allocate Shared Expense" action: splits an unattributed expense across chosen generators/projects (even split or manual percentages), creating attributed child Expense records referencing the original as `allocatedFrom`.

## 7. Out of Scope
- Profitability aggregation itself (TASK-025) — this task only produces the Expense records it consumes.

## 8. Functional Requirements
- FR-001: `category` is drawn from a configurable list in System Settings (TASK-030), not free text, for consistent reporting.
- FR-002: An expense with neither `generatorId` nor `projectId` is valid (company-level/unallocated) and is flagged as such in list views.
- FR-003: The Allocate action requires the split percentages to sum to exactly 100% (or amounts to sum to exactly the original amount) before it can be confirmed.

## 9. Business Rules
Full detail per Business Rule 6.8's allocation rule — unallocated expenses never silently affect generator-level profit.

## 10. Data Model — Expense
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| category | String | Yes | — | from SystemSetting list | — |
| date | Date | Yes | — | not future | — |
| amount | Decimal128 | Yes | — | > 0 | — |
| generatorId | ObjectId → Generator | No | null | ref exists if set | — |
| projectId | ObjectId → Project | No | null | ref exists if set | — |
| description | String | No | "" | max 300 chars | — |
| allocatedFrom | ObjectId → Expense | No | null | — | Set on child records created by allocation |
| status | String enum | No | "Confirmed" | `Confirmed\|Cancelled` | — |

Indexes: `(generatorId, date)`; `(projectId, date)`; `category`.

## 11. Backend Architecture
- `modules/expenses/{model,controller,service,routes,validation}.ts`.

## 12. API Specification
### GET `/api/expenses` — list, filter by `category`, `generatorId`, `projectId`, date range, `unallocatedOnly`. Permissions: any authenticated (read).
### POST `/api/expenses` — create. Permissions: Admin, Finance Manager, Accountant.
### PATCH `/api/expenses/:id` — edit (Confirmed, not yet allocated-from source of children). Permissions: Admin, Finance Manager, Accountant.
### POST `/api/expenses/:id/allocate` — body `{ splits: [{ generatorId|projectId, percentage|amount }] }`. Permissions: Admin, Finance Manager.
Errors: `422` splits don't sum to 100%/full amount.

## 13. Frontend Requirements
- `ExpensesListPage` (with an "Unallocated" filter chip), `ExpenseFormDialog`, `AllocateExpenseDialog` (dynamic split rows with a live remaining-percentage indicator).

## 14. Page Structure
```
Header: "Expenses" | [+ New Expense]
Filters: Category | Generator | Project | Date range | Unallocated only
DataTable: date, category, amount, generator/project (or "Unallocated"), description
Row action: Allocate (if unallocated)
```

## 15. UX Behavior
- Allocate dialog shows a running "remaining to allocate" indicator that must reach exactly 0 before Confirm enables.

## 16. Validation Rules
- `amount > 0`; `category` required from the configured list.

## 17. Permissions
| Action | Admin | Finance Mgr | Accountant | Ops Mgr | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create/Edit | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Allocate | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Standard TASK-005 patterns.

## 19. Error Handling
- Allocation splits not summing correctly → `422` with the specific shortfall/excess shown.

## 20. Edge Cases
- An already-allocated expense (has child records) cannot be re-allocated without first reversing the prior allocation (prevents double-counting).
- Editing an expense after it has been allocated is blocked — must reverse and recreate, consistent with the financial-document-immutability principle applied elsewhere.

## 21. Audit Requirements
- Create, Edit, Allocate all audited, including the full split breakdown.

## 22. Notifications
N/A.

## 23. Reporting Impact
- Feeds Expenses report and, via allocation, Generator Profitability; unallocated expenses feed the Profit & Expense Summary report separately.

## 24. Testing Requirements
- **Unit**: split-sum validation (percentage and fixed-amount modes).
- **API**: create/edit/allocate, re-allocation-blocked scenario.
- **Edge Case**: allocation splits summing to 99.9%/100.1% rejected.

## 25. Acceptance Criteria
- Given an unallocated 10,000 expense, when allocated 60/40 across two generators, then two child expenses of 6,000 and 4,000 are created, each referencing the original.
- Given an expense with no generator/project set, when Generator Profitability is calculated, then it does not appear in any individual generator's cost — only in project/company-level aggregates.

## 26. Dependencies
TASK-002–006; integrates with TASK-025.

## 27. Deliverables
- Expense model/service/routes, list UI, allocation workflow.

## 28. Definition of Done
- No code path in the Profitability Engine (TASK-025) ever divides an unallocated expense automatically; allocation is always an explicit, audited user action.


---

# TASK-025 — Generator Profitability Engine

## 1. Objective
Implement revenue vs. cost aggregation per generator/project/customer/period, per Business Rule 6.8, including the shared-expense allocation interaction with TASK-024.

## 2. Business Purpose
Profitability per generator is the ultimate business question this whole system exists to answer — fleet investment and pricing decisions depend on it being trustworthy.

## 3. User Story
As a **Finance Manager**, I want to see revenue, cost, and net profit per generator over any period, so that I can make informed fleet and pricing decisions.

## 4. Actors
Admin, Finance Manager, Operations Manager, Accountant (view); Viewer.

## 5. Preconditions
TASK-016, TASK-018, TASK-020, TASK-024.

## 6. Scope
- `ProfitabilityEngineService.calculate({ generatorId?, projectId?, customerId?, from, to })` → `{ revenue, cost: { fuel, maintenance, transport, labor, parts }, netProfit }`.
- Aggregation at generator, project, customer, and company (all generators) levels.

## 7. Out of Scope
- Expense allocation UI itself (TASK-024) — this engine only consumes already-attributed Expense/cost records.

## 8. Functional Requirements
- FR-001: `Revenue` = sum of Extract line-item Rent amounts attributable to the generator (via its Contract Items) within the period — computed from Extract data, not re-derived from the Pricing Engine independently (single source of truth).
- FR-002: `Cost` = Fuel (from FuelLog.totalCost) + Maintenance (from Maintenance.totalCost) + Transport/Labor/Parts (from attributed Expense records, including allocation children) for that generator within the period.
- FR-003: Unallocated (no `generatorId`) Expense records never enter a generator's cost figure (Business Rule 6.8) but do enter project-level/company-level aggregates as a distinct "Unallocated Expenses" line.
- FR-004: `netProfit = revenue − cost`.

## 9. Business Rules
Full detail per Business Rule 6.8.

## 10. Data Model
No new persisted collection — a fully computed aggregation, using MongoDB aggregation pipelines across Extract/FuelLog/Maintenance/Expense for performance (see Section 12 "Database Standards" for indexing guidance supporting this).

## 11. Backend Architecture
- `modules/profitability-engine/{service,controller,routes}.ts`, implemented via aggregation pipelines (not application-level loops over raw documents) for performance at scale.

## 12. API Specification
### GET `/api/profitability` — query `generatorId?`, `projectId?`, `customerId?`, `from`, `to`. Permissions: Admin, Finance Manager, Operations Manager, Accountant.
Response:
```json
{ "success": true, "data": { "revenue":"250000.00", "cost": { "fuel":"40000.00","maintenance":"15000.00","transport":"5000.00","labor":"8000.00","parts":"6000.00" }, "unallocatedExpenses":"3000.00", "netProfit":"176000.00" } }
```

## 13. Frontend Requirements
- Generator Profile "Profitability" tab: KPI cards (Revenue, Cost breakdown, Net Profit) + period filter + cost-breakdown pie/bar chart (Recharts).

## 14. Page Structure
```
Generator Profile > Profitability tab
Filters: Period
KPI cards: Revenue | Total Cost | Net Profit
Chart: Cost breakdown (Fuel/Maintenance/Transport/Labor/Parts)
```

## 15. UX Behavior
- Negative net profit renders in red with a clear "Cost exceeds revenue in this period" indicator, not just a negative number easy to miss.

## 16. Validation Rules
- `to >= from`.

## 17. Permissions
| Action | Admin | Finance Mgr | Ops Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

(Viewer excluded here per the sensitivity of profit data — an explicit, more restrictive row than the general "Viewer reads everything" default; documented as an intentional exception.)

## 18. State Management
- Query-cached per filter combination via TASK-005 patterns; never client-aggregated from raw lists.

## 19. Error Handling
- Invalid period → `422`.

## 20. Edge Cases
- A generator with zero Extract revenue in the period but real fuel/maintenance cost shows a negative net profit — this is a valid, meaningful state (e.g. idle generator still incurring costs), not an error.
- A cancelled Extract's revenue contribution is fully excluded, matching the Ledger Engine's treatment.

## 21. Audit Requirements
N/A (read-only aggregation).

## 22. Notifications
N/A.

## 23. Reporting Impact
- Directly powers the Generator Profitability report, "Most profitable generators" Dashboard widget, and Profit & Expense Summary report.

## 24. Testing Requirements
- **Unit**: aggregation math against a fixed fixture (known revenue/cost inputs → known net profit).
- **API**: permission matrix (Viewer excluded), period validation.
- **Edge Case**: negative profit, zero-revenue-with-cost generator, unallocated-expense exclusion.

## 25. Acceptance Criteria
- Given a fixture with revenue 250,000 and total attributed cost 74,000, when calculated, then netProfit = 176,000, matching Business Rule 6.8's formula.
- Given an unallocated company expense exists in the period, when a specific generator's profitability is calculated, then that expense does not appear in its cost breakdown.

## 26. Dependencies
TASK-016, TASK-018, TASK-020, TASK-024.

## 27. Deliverables
- Profitability engine service, API endpoint, Profitability tab UI.

## 28. Definition of Done
- Aggregation pipeline performance-tested against a realistically-sized dataset (see Section 14, Performance); fixture-based golden test passes.

---

# TASK-026 — Notification Engine

## 1. Objective
Implement the central Notification model, dispatch, deduplication-aware creation API (consumed by the Fuel Alert, Maintenance Schedule, Contract-expiry, and Ledger-overdue sources), and the read/unread lifecycle surfaced via the Header bell.

## 2. Business Purpose
Multiple engines need to alert users; a single Notification model with consistent read/unread/severity handling avoids five different ad hoc alert UIs.

## 3. User Story
As an **Operations Manager**, I want a single notifications inbox for every system alert relevant to my role, so that I don't have to check five different modules to stay on top of issues.

## 4. Actors
All roles (recipients vary by notification type and role/assignment).

## 5. Preconditions
TASK-017, TASK-019, TASK-012 (contract expiry), TASK-023 (overdue customers) — this task is built alongside/after those source events are defined, though the engine itself is generic and source-agnostic.

## 6. Scope
- `Notification` model: `type`, `severity`, `title`, `message`, `entityType`, `entityId`, `recipientRoles[]`, `status`, `dueDate?`, `readAt?`.
- `NotificationEngineService.create({...})` — a generic creation API called by every source engine (Fuel Alert, Maintenance Schedule, Contract expiry job, Ledger overdue job).
- Header bell UI: unread count, dropdown list, mark-as-read, "view all" page.

## 7. Out of Scope
- The business logic deciding *when* to alert (that lives in each source engine — TASK-017, 019, 012, 023). This task only stores and delivers.

## 8. Functional Requirements
- FR-001: A Notification is visible only to users whose role is in `recipientRoles` (or, for Technician-scoped alerts, whose assignment matches the entity).
- FR-002: `GET /api/notifications` returns the current user's applicable notifications, paginated, filterable by `status` (unread/read).
- FR-003: `PATCH /api/notifications/:id/read` marks read; a "mark all as read" bulk action is also available.
- FR-004: Each source engine is responsible for its own deduplication logic (per 6.5/6.6) before calling `create` — this engine does not itself dedupe across different source types.

## 9. Business Rules
- Recipients and severity per notification type are defined in each source's own business-rule section (6.5, 6.6) and in TASK-012/023; this engine enforces only generic role/assignment-based visibility.

## 10. Data Model — Notification
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| type | String enum | Yes | — | `FuelAlert\|MaintenanceAlert\|ContractExpiry\|OverdueCustomer\|GeneratorStoppedWhileAssigned` | — |
| severity | String enum | Yes | — | `info\|warning\|critical` | — |
| title | String | Yes | — | max 150 chars | — |
| message | String | Yes | — | max 500 chars | — |
| entityType | String | Yes | — | e.g. "Generator" | — |
| entityId | ObjectId | Yes | — | polymorphic ref | — |
| recipientRoles | [String] | Yes | — | non-empty | — |
| assignedUserId | ObjectId → User | No | null | — | For Technician-scoped alerts |
| status | String enum | No | "Unread" | `Unread\|Read\|Dismissed` | — |
| dueDate | Date | No | null | — | — |
| readAt | Date | No | null | — | — |

Indexes: `(recipientRoles, status, createdAt)`; `(entityType, entityId)`.

## 11. Backend Architecture
- `modules/notifications/{model,controller,service,routes}.ts`, invoked internally by other engines' services (no HTTP round-trip between engines).

## 12. API Specification
### GET `/api/notifications` — filter by `status`. Permissions: any authenticated (own-scoped).
### PATCH `/api/notifications/:id/read` — Permissions: any authenticated (own-scoped).
### PATCH `/api/notifications/read-all` — Permissions: any authenticated (own-scoped).

## 13. Frontend Requirements
- Header bell (unread badge count), dropdown (latest N, grouped by severity), `/notifications` full list page with filters, "mark all read" action.

## 14. Page Structure
```
Header bell → dropdown (latest, unread-highlighted)
/notifications
 Filters: Status | Severity | Type
 List: title, message, severity badge, entity link, time, mark-read action
```

## 15. UX Behavior
- Critical notifications visually distinct (red left-border) from info/warning.
- Clicking a notification navigates to the source entity and marks it read.

## 16. Validation Rules
N/A (system-created; no direct user-authored notifications in V1).

## 17. Permissions
- Visibility is role/assignment-scoped per FR-001; no separate write permission beyond mark-as-read (any authenticated user, own notifications only).

## 18. State Management
- Unread count polled/cached with short TTL (in-memory, not Redis) or refreshed on relevant mutation events; never a source of business truth (Dashboard/reports never read notification counts as data — they read the source engines directly).

## 19. Error Handling
- Marking as read a notification not visible to the current user → `403`/`404` (not leaking existence).

## 20. Edge Cases
- A role change mid-session may temporarily show/hide notifications inconsistently until the next auth refresh (documented as expected, consistent with TASK-006's permission-refresh edge case).
- A resolved source alert (e.g. Fuel Alert auto-resolved) does not retroactively delete its original Notification — the notification remains in history as "Read"/relevant context, with the underlying alert shown as resolved when the user navigates to it.

## 21. Audit Requirements
- Not separately audited (notifications are themselves a derivative/read layer over already-audited source events).

## 22. Notifications
N/A (this task IS the notification system).

## 23. Reporting Impact
- Dashboard's alert widgets (contract expiry, overdue customers, upcoming maintenance, stopped generators, abnormal fuel) read directly from this engine's data.

## 24. Testing Requirements
- **Unit**: role/assignment-based visibility filter.
- **API**: list/mark-read/mark-all-read, cross-user visibility isolation (User A cannot mark User B-scoped notification as read... actually role-scoped, so tested as "Technician cannot see notifications outside their assignment").
- **E2E**: a Fuel Alert triggers a bell-badge increment for the correct roles.

## 25. Acceptance Criteria
- Given a Critical Fuel Alert for a generator assigned to Technician X, when Technician X logs in, then it appears in their notifications; a different Technician not assigned to that generator does not see it.
- Given a user marks a notification as read, when the list is refreshed, then the unread badge count decrements accordingly.

## 26. Dependencies
TASK-017, TASK-019; integrates with TASK-012, TASK-023.

## 27. Deliverables
- Notification model/service/routes, bell UI, full notifications page.

## 28. Definition of Done
- Every source engine (Fuel Alert, Maintenance Schedule, Contract expiry, Overdue customer) is verified to call this engine's `create` rather than maintaining its own parallel alert-delivery mechanism.

---

# TASK-027 — Main Dashboard

## 1. Objective
Implement the management Dashboard: fleet/financial/operational KPI cards, alert widgets, and charts, all sourced from the engines already built (Status Engine, Ledger Engine, Profitability Engine, Fuel/Maintenance Alert Engines).

## 2. Business Purpose
The Dashboard is the single screen most roles open first; it must answer "what needs my attention today" at a glance, with numbers that are provably identical to the detail screens behind them.

## 3. User Story
As an **Operations Manager or Finance Manager**, I want a real-time overview of fleet status, financial position, and alerts, so that I can prioritize my day without digging through every module.

## 4. Actors
Admin, Operations Manager, Finance Manager, Accountant (full); Viewer (read); Technician (excluded per the general matrix, since Dashboard surfaces company-wide financials).

## 5. Preconditions
TASK-009, TASK-023, TASK-025, TASK-026.

## 6. Scope
- KPI cards: fleet (Total/Available/Rented/Under Maintenance/Stopped generators), financial (Revenue/Receipts/Outstanding/Expenses/Net Profit), operational (Operating Hours/Fuel Consumption/Maintenance Cost).
- Alert widgets: Expiring Contracts, Overdue Customers, Upcoming Maintenance, Stopped Generators, Abnormal Fuel Consumption.
- Charts: Monthly revenue trend, Extract status distribution, Most utilized generators, Most profitable generators.
- Global period/project/customer filter affecting all cards/charts.

## 7. Out of Scope
- Any KPI's underlying calculation logic (all delegated to the engines listed in Preconditions).

## 8. Functional Requirements
- FR-001: Every KPI card is computed by calling the owning engine's existing endpoint/service — the Dashboard module performs no independent recalculation of any formula.
- FR-002: KPIs support a period filter (default: current month) and optional project/customer scoping.
- FR-003: Each KPI has a defined empty-state (e.g. "No revenue in this period" rather than a blank or "0" with no context).

## 9. Business Rules
None new — this task is purely an aggregation/presentation layer over existing engines. Per-KPI definitions:

| KPI | Calculation | Source |
|---|---|---|
| Total/Available/Rented/Under Maintenance/Stopped Generators | Count by `status` | Status Engine (TASK-009) |
| Revenue | Σ Approved+ Extract `finalTotal` in period | Financial Engine / Extracts |
| Receipts | Σ Confirmed Receipt `amount` in period | Receipts (TASK-022) |
| Outstanding Receivables | Σ customer balances (positive only) | Ledger Engine (TASK-023) |
| Expenses | Σ Expense `amount` in period | Expenses (TASK-024) |
| Net Profit | Σ Profitability Engine `netProfit` across fleet in period | Profitability Engine (TASK-025) |
| Operating Hours | Σ OperationLog `operatingHours` in period | Operations (TASK-015) |
| Fuel Consumption | Σ FuelLog `liters` / avg `consumptionRate` in period | Fuel (TASK-016) |
| Maintenance Cost | Σ Maintenance `totalCost` in period | Maintenance (TASK-018) |
| Expiring Contracts | Active contracts with `endDate` within N days | Contracts (TASK-012) |
| Overdue Customers | Per Ledger Engine's overdue definition | TASK-023 |
| Upcoming/Overdue Maintenance | Open Maintenance Alerts | TASK-019 |
| Stopped Generators | Count `status = Stopped` | Status Engine |
| Abnormal Fuel Consumption | Open Fuel Alerts | TASK-017 |

## 10. Data Model
No new collection — pure aggregation/read layer, optionally with a short-TTL in-memory cache per filter combination (never a system of record).

## 11. Backend Architecture
- `modules/reports/dashboard.controller.ts` (or a dedicated `dashboard` sub-module) that calls each engine's service function directly and composes one response, avoiding N sequential HTTP round-trips internally (direct service calls, not internal HTTP).

## 12. API Specification
### GET `/api/dashboard` — query `from?`, `to?`, `projectId?`, `customerId?`. Permissions: Admin, Operations Manager, Finance Manager, Accountant, Viewer.
Response: a composed object with `fleet`, `financial`, `operations`, `alerts`, `charts` sections, each keyed exactly as the KPI table above.

## 13. Frontend Requirements
- `DashboardPage`: KPI card grid, alert widget row, chart grid (Recharts: line for revenue trend, pie for extract status distribution, bar for top generators by utilization/profit).
- Global filter bar (period, project, customer) affecting the whole page via one query.

## 14. Page Structure
```
Header: "Dashboard" | Filter bar (Period | Project | Customer)
Row 1: Fleet KPI cards (5)
Row 2: Financial KPI cards (5)
Row 3: Operational KPI cards (3)
Row 4: Alert widgets (5, each linking to its module)
Row 5: Charts (Revenue trend | Extract status | Top utilized | Top profitable)
```

## 15. UX Behavior
- All cards show Skeleton while loading as one composed request resolves (not staggered independent spinners, to avoid layout jank).
- Every alert widget is clickable, deep-linking to the filtered list in its owning module.

## 16. Validation Rules
- `to >= from` for the period filter.

## 17. Permissions
| Action | Admin | Ops Mgr | Finance Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

## 18. State Management
- One composed query per filter combination, cached with standard TASK-005 patterns; filter state in the URL.

## 19. Error Handling
- Partial engine failure (e.g. Profitability Engine query times out) degrades gracefully — that one card/chart shows its own `ErrorState` with retry, without blocking the rest of the Dashboard from rendering.

## 20. Edge Cases
- A brand-new deployment with zero data renders every KPI as a clear zero/empty state, not a crash.
- Filtering to a project with no generators shows an explicit "No generators in this project" state on the fleet KPIs rather than misleadingly showing company-wide totals.

## 21. Audit Requirements
N/A (read-only).

## 22. Notifications
N/A directly (surfaces TASK-026's data).

## 23. Reporting Impact
- The Dashboard and the Reports Center (TASK-028) are guaranteed consistent because both read the same underlying engines.

## 24. Testing Requirements
- **Unit**: KPI composition logic (correct engine calls with correct filter propagation).
- **API**: full dashboard query, partial-failure graceful degradation.
- **E2E**: dashboard loads with seed data and every card/chart renders non-crashing values.

## 25. Acceptance Criteria
- Given seeded fleet/financial/operational data, when the Dashboard loads for the current month, then every KPI matches the value independently computed by its owning module's own detail screen.
- Given one underlying engine call fails, when the Dashboard renders, then only that card/chart shows an error state — the rest of the page still renders.

## 26. Dependencies
TASK-009, TASK-023, TASK-025, TASK-026 (and transitively TASK-015–024).

## 27. Deliverables
- Dashboard composition endpoint, Dashboard page UI with KPI cards/alerts/charts.

## 28. Definition of Done
- Every KPI cross-checked against its owning module's own numbers in an integration test (no drift).

---

# TASK-028 — Reports Center

## 1. Objective
Implement the Reports module: Generator Revenue, Generator Profitability, Operations, Fuel Consumption, Maintenance, Customer Statement, Uncollected Extracts, Expenses, and Profit & Expense Summary — each with defined filters, columns, calculations, and export.

## 2. Business Purpose
Reports are how management and finance extract structured, filterable, exportable views of the same trusted data for planning, audits, and external communication.

## 3. User Story
As a **Finance Manager**, I want a library of standard reports with consistent filtering and export, so that I can produce the numbers management and auditors need without ad hoc queries.

## 4. Actors
Admin, Finance Manager, Operations Manager, Accountant (per-report, matrix below); Viewer (read, most reports).

## 5. Preconditions
TASK-015, 016, 018, 020, 023, 024, 025.

## 6. Scope
Nine reports, each following the standard shape: report selector → filters → server-paginated table → export (TASK-029).

| Report | Metrics | Filters | Permissions |
|---|---|---|---|
| Generator Revenue | Rental revenue per generator | Date, generator, project | Admin, Finance Mgr, Ops Mgr |
| Generator Profitability | Revenue, fuel, maintenance, labor, transport, parts, net profit | Date, generator | Admin, Finance Mgr, Ops Mgr |
| Operations | Start/end meter, operating hours, downtime | Date, project, generator | Admin, Finance Mgr, Ops Mgr, Accountant |
| Fuel Consumption | Liters, cost, liters/hour, variance from normal | Date, generator | Admin, Ops Mgr |
| Maintenance | Maintenance jobs and costs | Date, generator, type | Admin, Ops Mgr |
| Customer Statement | Extracts, receipts, discounts, balance | Customer, period | Admin, Finance Mgr, Accountant |
| Uncollected Extracts | Extract total, collected, remaining, status | Customer, period | Admin, Finance Mgr, Accountant |
| Expenses | Operating/admin expenses | Category, date, project, generator | Admin, Finance Mgr, Accountant |
| Profit & Expense Summary | Revenue, expenses, net profit | Period, project, generator | Admin, Finance Mgr |

## 7. Out of Scope
- Export file generation itself (TASK-029) — this task defines the on-screen tabular report; export consumes the same query.

## 8. Functional Requirements
- FR-001: Every report is built on the shared DataTable/pagination system (TASK-005) with server-side filtering/sorting — no client-side aggregation of full datasets.
- FR-002: Every report's numbers are sourced from the same engines as the Dashboard (Profitability Engine, Ledger Engine, etc.) — no parallel calculation.
- FR-003: Each report has a defined empty state ("No records match these filters") distinct from a loading/error state.

## 9. Business Rules
None new — reports reuse Business Rules 6.1–6.10 via their owning engines.

## 10. Data Model
No new collections — reports are read/aggregation views over existing collections, implemented via MongoDB aggregation pipelines for performance.

## 11. Backend Architecture
- `modules/reports/{controller,routes}.ts` with one handler per report, each delegating to the relevant engine/service (e.g. Customer Statement report calls `LedgerEngineService.getStatement`).

## 12. API Specification
### GET `/api/reports/revenue` · `/profitability` · `/operations` · `/fuel-consumption` · `/maintenance` · `/customer-statement` · `/uncollected-extracts` · `/expenses` · `/profit-expense-summary`
Each: paginated, filter query params per the table above. Auth required. Permissions per the table above.
Example (`/api/reports/uncollected-extracts`):
```json
{ "success": true, "data": { "items": [ { "extractNumber":"EX-2026-0012","customer":"Acme Co","total":"114000.00","collected":"50000.00","remaining":"64000.00","status":"Partially Collected" } ], "meta": { "page":1,"limit":20,"total":37 } } }
```

## 13. Frontend Requirements
- `ReportsCenterPage`: report selector sidebar/tabs, shared filter bar per report, DataTable, `ExportButton` (TASK-029).

## 14. Page Structure
```
Header: "Reports"
Sidebar: report list (9 reports)
Selected report:
  Filters (per report definition)
  DataTable
  [Export ▾]
```

## 15. UX Behavior
- Switching reports resets filters to that report's defaults (not carried over incorrectly from a different report's filter set).

## 16. Validation Rules
- Each report's filter set validated per its own field types (dates, ObjectId references).

## 17. Permissions
Per the table in Section 6 above; enforced per-endpoint at the API level.

## 18. State Management
- Standard TASK-005 query hooks, one per report, keyed by report name + filters.

## 19. Error Handling
- Invalid filter combination (e.g. malformed date) → `422` with field-level errors.

## 20. Edge Cases
- Customer Statement report for a customer with zero activity in the selected period still shows the correct opening/closing balance carried from before the period (not a false zero).
- Generator Profitability report row for a deactivated generator still renders (marked "Inactive") rather than disappearing from historical reports.

## 21. Audit Requirements
N/A (read-only); report *access* could optionally be logged as a lightweight audit line (view-only actions) — documented as an Open Decision on whether view-level audit is required for compliance.

## 22. Notifications
N/A.

## 23. Reporting Impact
This task IS the reporting layer.

## 24. Testing Requirements
- **API**: each of the 9 endpoints — filters, pagination, permission matrix.
- **Unit**: report-specific aggregation queries against fixtures with known expected output.
- **E2E**: navigate Reports Center, run at least 2 representative reports, verify table renders.

## 25. Acceptance Criteria
- Given a customer and period, when running the Customer Statement report, then the output matches the Ledger Engine's own statement endpoint exactly.
- Given a Viewer role, when accessing the Generator Profitability report, then access is denied per the matrix (Viewer is excluded from profitability, consistent with TASK-025).

## 26. Dependencies
TASK-015, 016, 018, 020, 023, 024, 025.

## 27. Deliverables
- 9 report endpoints, Reports Center UI.

## 28. Definition of Done
- Every report's numbers verified against its owning engine/module in an integration test; no report recalculates a formula independently.

---

# TASK-029 — Export & Print

## 1. Objective
Implement CSV/Excel/PDF export for reports, statements, extracts, and operational lists, and print-friendly layouts for Extracts and Customer Statements.

## 2. Business Purpose
Finance and management need to share numbers outside the application (email to a customer, board deck, auditor request).

## 3. User Story
As an **Accountant**, I want to export a report or statement to Excel/PDF, so that I can share it outside the system.

## 4. Actors
Same per-report/per-document permissions as TASK-028/020/023.

## 5. Preconditions
TASK-028, TASK-020, TASK-023.

## 6. Scope
- Generic `ExportButton` component wired to any DataTable-backed screen: CSV, Excel (`.xlsx`), PDF options.
- Dedicated print-styled PDF templates for Extract (customer-facing invoice look) and Customer Statement.

## 7. Out of Scope
- Any scheduled/emailed export delivery (out of scope — manual, on-demand export only in V1).

## 8. Functional Requirements
- FR-001: Export always reflects the currently applied filters/sort — never a full unfiltered dump silently.
- FR-002: Export respects the same permission checks as the underlying report/list endpoint (no export bypass of read permissions).
- FR-003: Large exports (beyond a configurable row threshold, default 10,000) are generated as a background job with a "your export is being prepared" notice rather than blocking the request thread; smaller exports are synchronous.

## 9. Business Rules
- Exported financial documents (Extracts) always reflect the stored, immutable Approved+ figures — never a live recalculation that could differ from the original invoice the customer received.

## 10. Data Model
No new persisted collection beyond an optional lightweight `ExportJob` record (status/downloadUrl/expiresAt) for the async path.

| Field (ExportJob) | Type | Required | Default | Description |
|---|---|---|---|---|
| requestedBy | ObjectId → User | Yes | — | — |
| reportType | String | Yes | — | — |
| filters | Object | Yes | — | Snapshot of filters used |
| format | String enum | Yes | — | `csv\|xlsx\|pdf` |
| status | String enum | No | "Processing" | `Processing\|Ready\|Failed` |
| downloadUrl | String | No | null | — |
| expiresAt | Date | No | — | Time-limited download link |

## 11. Backend Architecture
- `services/export/{csv,excel,pdf}Generator.ts`, `modules/export-jobs/*` for the async path.

## 12. API Specification
### POST `/api/exports` — body `{ reportType, filters, format }`. Sync response with a file stream for small datasets; `202` + job id for large ones. Permissions: same as the underlying report/list.
### GET `/api/exports/:jobId` — poll status/download link for async exports.

## 13. Frontend Requirements
- `ExportButton` (dropdown: CSV/Excel/PDF) on every report/list screen and on Extract/Statement detail pages; async-export toast with a "Download when ready" link.

## 14. Page Structure
N/A (embedded control, not a standalone page) beyond an optional `/exports` history list for a user's recent exports.

## 15. UX Behavior
- Synchronous export triggers an immediate browser download; asynchronous shows a toast/progress indicator and a notification (via TASK-026) when ready.

## 16. Validation Rules
- `format` must be one of the supported enum values.

## 17. Permissions
Inherits the permission matrix of the source report/list/document (no separate export-specific role).

## 18. State Management
- Export job status polled via standard query hooks (short interval) until `Ready`/`Failed`.

## 19. Error Handling
- Failed export generation → job marked `Failed` with a user-facing reason ("template rendering error") and a retry action; never a silent disappearing request.

## 20. Edge Cases
- Exporting a report with zero matching rows produces a valid, empty file with headers only, not an error.
- RTL text (Arabic customer/company names) renders correctly in PDF exports (right-to-left text shaping verified explicitly, a common PDF-library pitfall).

## 21. Audit Requirements
- Export of financial documents (Extracts, Statements) is audited (who exported what, when) given its compliance sensitivity.

## 22. Notifications
- Async export completion notification via TASK-026.

## 23. Reporting Impact
This task is the export layer for every report defined in TASK-028 plus TASK-020/023's documents.

## 24. Testing Requirements
- **Unit**: CSV/Excel/PDF generators against fixed fixtures (byte-for-byte or structurally verified output).
- **API**: sync vs. async threshold behavior, permission inheritance.
- **Edge Case**: zero-row export, RTL text rendering in PDF.

## 25. Acceptance Criteria
- Given a filtered report with 50 rows, when exported to Excel, then the downloaded file contains exactly those 50 rows with matching column headers.
- Given a dataset exceeding the async threshold, when export is requested, then a `202` with a job id is returned and the file becomes downloadable once `Ready`.

## 26. Dependencies
TASK-028, TASK-020, TASK-023.

## 27. Deliverables
- Export services (CSV/Excel/PDF), ExportButton component, ExportJob module for async path.

## 28. Definition of Done
- Export output verified against on-screen filtered data for at least 3 representative reports; RTL PDF rendering verified visually.


---

# TASK-030 — System Settings

## 1. Objective
Implement the System Settings module: VAT rate, currency, payment methods, fuel alert thresholds, maintenance cycle defaults, and expense categories — all consumed by name via `SystemSetting` lookups elsewhere in the system, never hardcoded.

## 2. Business Purpose
Business parameters (tax rate, thresholds) change over time and by jurisdiction; centralizing them avoids code changes for policy changes and ensures every module reads the same value.

## 3. User Story
As a **System Admin**, I want to configure system-wide business parameters, so that policy changes don't require code deployments.

## 4. Actors
System Admin (full); Finance Manager (VAT/finance-related settings only, per matrix).

## 5. Preconditions
TASK-006.

## 6. Scope
- `SystemSetting` key/value store: `vatRate`, `currency`, `paymentMethods[]`, `fuelAlertTolerancePercent`, `fuelAlertCriticalPercent`, `defaultMaintenanceCycleHours`, `expenseCategories[]`, `maintenanceScheduleBufferHours`, `overdueGracePeriodDays`.
- Settings UI grouped by category (Financial, Operational, Reference Lists).

## 7. Out of Scope
- Any setting that would require a schema migration to apply retroactively (e.g. changing currency does not retroactively convert historical amounts — out of scope, documented as an Open Decision).

## 8. Functional Requirements
- FR-001: Every setting has a documented default (matching the values referenced elsewhere in this PRD: VAT 14%, fuel tolerance 15%/30%, maintenance buffer 50 hours, overdue grace 30 days).
- FR-002: Changing `vatRate` never retroactively affects already-approved Extracts (snapshot rule, 6.7) — enforced by TASK-020/021, not this task, but this task's UI must clearly communicate that behavior to the Admin ("this only affects extracts approved after this change").
- FR-003: `expenseCategories`/`paymentMethods` are editable lists; removing a category/method already in use on historical records does not delete or corrupt those historical records — it only prevents the value being selected for new entries.

## 9. Business Rules
- These settings are the canonical inputs referenced throughout Section 6 (VAT rate → 6.7; fuel tolerance → 6.5; maintenance cycle → 6.6; overdue grace → 6.2/TASK-023).

## 10. Data Model — SystemSetting
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| key | String | Yes | — | unique | e.g. "vatRate" |
| value | Mixed | Yes | — | validated per key's expected type | — |
| category | String enum | Yes | — | `Financial\|Operational\|ReferenceList` | — |
| updatedBy | ObjectId → User | No | — | — | — |

Index: `key` unique.

## 11. Backend Architecture
- `modules/settings/{model,controller,service,routes,validation}.ts`; a small in-memory cache (with invalidation on write) avoids a DB round-trip on every read of hot settings like `vatRate` — consistent with the "no Redis, in-memory only" constraint.

## 12. API Specification
### GET `/api/settings` — all settings (grouped). Permissions: Admin, Finance Manager (Financial category only — enforced by field-level filtering, not just UI hiding).
### PATCH `/api/settings/:key` — update one setting. Permissions: Admin (all); Finance Manager (Financial category keys only).
Errors: `403` Finance Manager attempting to edit an Operational/ReferenceList key.

## 13. Frontend Requirements
- `SettingsPage` (Tabs: Financial, Operational, Reference Lists), form fields per setting type (number, select, editable list).

## 14. Page Structure
```
Settings
Tabs: Financial (VAT rate, currency, payment methods) | Operational (fuel thresholds, maintenance cycle, buffers) | Reference Lists (expense categories)
```

## 15. UX Behavior
- Changing `vatRate` shows an inline notice: "This will apply to extracts approved after saving. Already-approved extracts are unaffected."

## 16. Validation Rules
- `vatRate`: 0–1 (as a decimal fraction) or 0–100 (as a percentage, converted consistently); `fuelAlertTolerancePercent < fuelAlertCriticalPercent`.

## 17. Permissions
| Action | Admin | Finance Mgr | Ops Mgr | Accountant | Technician | Viewer |
|---|---|---|---|---|---|---|
| View | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit Financial | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit Operational/Reference Lists | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 18. State Management
- Settings fetched once per session and cached; write invalidates both the frontend cache and the backend in-memory cache.

## 19. Error Handling
- Invalid value type/range for a key → `422` with the expected range shown.

## 20. Edge Cases
- Removing a `paymentMethod` still in use on historical Receipts does not break those records' display (they store the method value as plain text/enum snapshot at creation, not a live reference).
- Concurrent edits to the same setting by two Admins — last-write-wins with an audit trail showing both changes (no optimistic-lock UI in V1; documented as acceptable given low concurrency on settings).

## 21. Audit Requirements
- Every setting change is audited with before/after value and actor — settings changes are high-impact and must be fully traceable.

## 22. Notifications
N/A.

## 23. Reporting Impact
- Indirect — every engine referencing a setting (VAT, fuel tolerance, maintenance cycle, overdue grace) is affected going forward.

## 24. Testing Requirements
- **Unit**: value-type validation per key.
- **API**: permission matrix (Finance Manager blocked from Operational keys), audit-on-change.
- **Integration**: changing `vatRate` affects only extracts approved afterward (cross-checked with TASK-020/021's tests).

## 25. Acceptance Criteria
- Given the VAT rate is changed from 14% to 15%, when an already-Approved extract is viewed, then it still shows 14% (its snapshot); a newly-approved extract shows 15%.
- Given a Finance Manager attempts to edit `defaultMaintenanceCycleHours`, when submitted, then it is rejected with `403`.

## 26. Dependencies
TASK-006.

## 27. Deliverables
- SystemSetting model/service/routes, Settings UI, in-memory cache with invalidation.

## 28. Definition of Done
- All defaults match the values referenced throughout this PRD; every consuming engine reads via the settings service, never a hardcoded constant.

---

# TASK-031 — Audit Log Engine

## 1. Objective
Implement the centralized Audit Log: before/after diffing, persistence, and a searchable Admin-only viewer, consumed by every sensitive create/update/approve/cancel/collect/correct action across the system.

## 2. Business Purpose
Financial and operational integrity requires a tamper-evident trail of who changed what, when, and why — for internal control, dispute resolution, and compliance.

## 3. User Story
As a **System Admin**, I want a complete, searchable audit trail of sensitive actions, so that any financial or operational discrepancy can be traced to its source.

## 4. Actors
System Admin (sole viewer, per Section 7 matrix); every role indirectly generates entries as an actor.

## 5. Preconditions
TASK-006; consumed by essentially every write-capable module (Generators, Contracts, Extracts, Receipts, Maintenance, Settings, Users/Roles, etc.).

## 6. Scope
- `AuditLog` model: `userId`, `action`, `entityType`, `entityId`, `before`, `after`, `timestamp`, `ip`.
- `AuditService.record({...})` — a single reusable function called from every module's service layer at the point of a sensitive mutation (never from controllers, to guarantee it fires regardless of entry point).
- Admin-only Audit Log viewer: filterable by user, entity type, entity id, action, date range.

## 7. Out of Scope
- Automatic diffing of every read (only mutations are audited).

## 8. Functional Requirements
- FR-001: Every module identified in Section 21 of each task above ("Audit Requirements") calls `AuditService.record` synchronously within the same request/transaction as the mutation — an audit-write failure must not silently succeed the business mutation without the audit trail (the audit write is part of the same transaction where the underlying operation already uses one, e.g. Receipts; where no transaction is used, the audit write happens immediately after the mutation commits and a failure is logged as a critical system alert, since audit-log durability is treated as a first-class requirement, not best-effort).
- FR-002: `before`/`after` are stored as diffed field-level objects (only changed fields), not full document dumps, for readability and storage efficiency.
- FR-003: The Audit Log itself is append-only — no update or delete endpoint exists for `AuditLog` documents, by any role, including Admin.

## 9. Business Rules
- Sensitive actions requiring audit (non-exhaustive, aggregated from every task's Section 21): Generator create/update/stop/resume/deactivate; Contract create/update/activate/cancel; Maintenance open/edit/start/complete/cancel; Extract create/edit/submit/approve/cancel; Receipt create/cancel; Expense create/edit/allocate; Credit Note create/cancel; Settings change; User/Role create/update/deactivate/permission change; login success/failure.

## 10. Data Model — AuditLog
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| userId | ObjectId → User | No | null | null for system-actor events (e.g. scheduled jobs) | — |
| actorType | String enum | Yes | "user" | `user\|system` | — |
| action | String | Yes | — | e.g. "Extract.approve" | — |
| entityType | String | Yes | — | e.g. "Extract" | — |
| entityId | ObjectId | Yes | — | — | — |
| before | Object | No | {} | field-diff only | — |
| after | Object | No | {} | field-diff only | — |
| reason | String | No | "" | copied from the action's own reason field where applicable | — |
| timestamp | Date | Yes | now | — | — |
| ip | String | No | "" | — | — |

Indexes: `(entityType, entityId, timestamp)`; `(userId, timestamp)`; `(action, timestamp)`.

## 11. Backend Architecture
- `modules/audit/{model,service,controller,routes}.ts`; `AuditService.record` imported by every other module's `service.ts`.

## 12. API Specification
### GET `/api/audit-logs` — filter by `userId`, `entityType`, `entityId`, `action`, date range. Permissions: Admin only.
Response: paginated list of audit entries with actor name resolved for display.

## 13. Frontend Requirements
- `/settings/audit-log` (Admin only): DataTable with expandable before/after diff view per row, filter bar.

## 14. Page Structure
```
Settings > Audit Log (Admin only)
Filters: User | Entity Type | Entity Id | Action | Date range
DataTable: timestamp, actor, action, entity, (expand → before/after diff)
```

## 15. UX Behavior
- Diff view highlights changed fields (old value struck through, new value shown), not a raw JSON dump, for readability.

## 16. Validation Rules
N/A (system-generated; no direct user authoring).

## 17. Permissions
| Action | Admin | All Others |
|---|---|---|
| View Audit Log | ✅ | ❌ |

## 18. State Management
- Standard TASK-005 query hooks, Admin-only.

## 19. Error Handling
- An audit-write failure is treated as a critical system alert (logged and surfaced to Admin via the Notification Engine) rather than silently dropped, given its compliance importance.

## 20. Edge Cases
- A deleted (soft-deleted) entity's audit history remains fully viewable, referencing the entity by its last-known identifying fields even though the live record is inactive.
- High-volume modules (Operations, Fuel) still audit only their designated sensitive actions (create + correct), not every read — preventing audit-log bloat while still covering the auditable actions called out in each task.

## 21. Audit Requirements
This task IS the audit requirement mechanism for every other task.

## 22. Notifications
- Audit-write failure → critical system notification to Admin (per FR above).

## 23. Reporting Impact
N/A directly (internal control tool, not a business report), though it may be referenced by external auditors.

## 24. Testing Requirements
- **Unit**: field-diff computation (only changed fields captured).
- **API**: Admin-only access enforced; append-only enforced (no update/delete route exists — tested by asserting the route literally does not exist, returning 404/405).
- **Integration**: at least one sample mutation per major module (Extract approve, Contract activate, Generator stop) verified to produce a correct audit entry.

## 25. Acceptance Criteria
- Given any Extract approval, when it completes, then an `AuditLog` entry exists with `action: "Extract.approve"` and the correct before/after VAT/status diff.
- Given a non-Admin user, when requesting `/api/audit-logs`, then access is denied with `403`.

## 26. Dependencies
TASK-006; consumed by all mutating modules.

## 27. Deliverables
- AuditLog model/service/routes, Admin viewer UI, `AuditService.record` integrated into every listed module.

## 28. Definition of Done
- A code-review checklist item added ("does this mutation call AuditService.record?") to be verified for every module touching a Section-21-listed action; append-only invariant enforced at the route layer.

---

# TASK-032 — File / Document Attachments

## 1. Objective
Implement generic file attachment support (upload, list, download, delete) attachable to Maintenance records, Contracts, and Extracts, for supporting documents (invoices, photos, insurance certificates).

## 2. Business Purpose
Maintenance jobs need photo evidence, contracts need signed copies, and extracts sometimes need supporting backup — a single generic attachment mechanism avoids each module building its own.

## 3. User Story
As a **Technician**, I want to attach a photo to a maintenance record, so that completed work has visual evidence.

## 4. Actors
Admin, Operations Manager, Technician (Maintenance attachments); Finance Manager, Accountant (Extract/Contract attachments); Viewer (read, where permitted by the parent entity's own read permission).

## 5. Preconditions
TASK-012, TASK-018, TASK-020.

## 6. Scope
- `Attachment` model: `entityType`, `entityId`, `fileName`, `fileType`, `fileSize`, `storagePath`, `uploadedBy`.
- Generic upload/list/delete endpoints, reused by Maintenance/Contract/Extract detail pages via a shared `AttachmentsPanel` component.
- Local/on-disk (or equivalent single-node) storage abstraction for V1, behind an interface that could later swap to object storage — the interface, not the specific provider, is what's specified here (provider choice is a deployment concern, out of scope per this PRD's explicit exclusions).

## 7. Out of Scope
- Any specific cloud storage provider integration/configuration (deployment concern).
- Document generation (that's TASK-029's export/print concern) — this task is only for user-uploaded supporting files.

## 8. Functional Requirements
- FR-001: Upload validates file type (allow-list: `pdf, jpg, jpeg, png, docx, xlsx`) and size (configurable max, default 10MB).
- FR-002: Attachments to a locked (Approved+) Extract are still allowed (supporting backup can be added after approval) but never replace/alter the extract's financial fields.
- FR-003: Deleting an attachment is a soft delete (marked removed, not purged) for entities under audit retention policy (Extracts, Contracts); Maintenance attachments may be hard-deleted by an Admin.

## 9. Business Rules
- Attachments are supplementary evidence, never a source of computed business data — no module reads figures out of an attached file automatically.

## 10. Data Model — Attachment
| Field | Type | Required | Default | Validation | Description |
|---|---|---|---|---|---|
| entityType | String enum | Yes | — | `Maintenance\|Contract\|Extract` | — |
| entityId | ObjectId | Yes | — | ref exists | — |
| fileName | String | Yes | — | max 255 chars | — |
| fileType | String | Yes | — | from allow-list | — |
| fileSize | Number | Yes | — | <= configured max | — |
| storagePath | String | Yes | — | — | Internal reference, never exposed raw to client |
| uploadedBy | ObjectId → User | Yes | — | — | — |
| isDeleted | Boolean | No | false | — | Soft delete (Extract/Contract) |

Index: `(entityType, entityId)`.

## 11. Backend Architecture
- `modules/attachments/{model,controller,service,routes,validation}.ts`; `services/storage/StorageAdapter.ts` interface (local-disk implementation for V1).

## 12. API Specification
### POST `/api/attachments` — multipart upload with `entityType`, `entityId`. Permissions: same write permission as the parent entity (e.g. Maintenance attach requires Maintenance write permission).
### GET `/api/attachments?entityType=&entityId=` — list. Permissions: same read permission as the parent entity.
### GET `/api/attachments/:id/download` — stream file. Permissions: same read permission as the parent entity.
### DELETE `/api/attachments/:id` — Permissions: uploader or Admin.
Errors: `422` disallowed file type/size; `404` unknown entity reference.

## 13. Frontend Requirements
- `AttachmentsPanel` (drag-drop upload, file list with type icon/size, download/delete actions) embedded in Maintenance/Contract/Extract detail pages.

## 14. Page Structure
```
{Parent Detail Page} > Attachments section
 Upload dropzone
 File list: name, type icon, size, uploader, date, [download] [delete]
```

## 15. UX Behavior
- Disallowed file type/oversized file rejected client-side first (fast feedback) and re-validated server-side (defense in depth).

## 16. Validation Rules
- File type allow-list, max size, `entityType`/`entityId` must reference an existing document.

## 17. Permissions
Inherits the parent entity's own read/write matrix (no separate attachment-specific role).

## 18. State Management
- Standard TASK-005 query hooks scoped by `(entityType, entityId)`.

## 19. Error Handling
- Upload interrupted mid-transfer → no partial `Attachment` record is persisted (write only on confirmed complete upload).

## 20. Edge Cases
- Deleting the parent entity (soft delete) leaves its attachments queryable for historical/audit purposes, not orphaned-and-inaccessible.
- Extremely large legitimate file (e.g. a scanned multi-page PDF) near the size limit shows a clear pre-upload size check rather than failing after a slow upload.

## 21. Audit Requirements
- Upload and Delete are audited (entity, file name, actor).

## 22. Notifications
N/A.

## 23. Reporting Impact
N/A.

## 24. Testing Requirements
- **Unit**: file type/size validation.
- **API**: upload/list/download/delete, permission inheritance from parent entity.
- **Edge Case**: interrupted upload leaves no orphaned record; soft-deleted parent entity's attachments remain accessible.

## 25. Acceptance Criteria
- Given a valid PDF under the size limit, when uploaded to a Maintenance record, then it appears in that record's Attachments list and is downloadable.
- Given a disallowed file type, when upload is attempted, then it is rejected before any file is stored.

## 26. Dependencies
TASK-012, TASK-018, TASK-020.

## 27. Deliverables
- Attachment model/service/routes, storage adapter interface + local implementation, AttachmentsPanel component.

## 28. Definition of Done
- Storage adapter is swappable behind its interface (verified by at least a second no-op/mock implementation used in tests) without touching controller/service code.

---

# TASK-033 — Testing & Quality Assurance

## 1. Objective
Establish and execute the full testing strategy across unit, API/integration, permission, edge-case, and E2E levels for every module delivered in TASK-001–032, per Section 14 (Testing Strategy).

## 2. Business Purpose
Given the financial nature of the system, undetected calculation or permission errors carry direct monetary and trust risk; systematic testing is not optional polish.

## 3. User Story
As a **Development Team**, we want comprehensive automated test coverage across every critical business rule, so that regressions are caught before reaching production.

## 4. Actors
Developer/QA (execution); indirectly protects all end users from defects.

## 5. Preconditions
TASK-001–032 (this task runs continuously alongside them in practice, but is tracked here as the point where full-suite coverage and CI gating are finalized).

## 6. Scope
- Unit test suites for every financial formula (6.2–6.10), the Status Engine truth table, and every engine's core logic.
- API/integration tests for every endpoint's success, validation-error, and permission-denied paths.
- E2E tests for the primary workflow: Generator → Customer/Project → Contract → Operations/Fuel/Maintenance → Extract → Receipt → Ledger → Profitability → Dashboard/Reports.
- Permission tests: every role/action cell in Section 7's matrix (and each task's own matrix) exercised against a real protected endpoint.
- A CI pipeline gate requiring all suites green before merge (test execution/gating itself; no deployment automation, per the explicit out-of-scope constraint on infrastructure).

## 7. Out of Scope
- Load/performance testing at production scale (TASK-034 covers targeted performance validation of specific queries; full load testing infrastructure is out of scope).
- Deployment pipeline configuration.

## 8. Functional Requirements
- FR-001: Every Business Rule worked example in Section 6 exists as an automated, named test (e.g. `financial-engine.worked-example.spec.ts`).
- FR-002: Every permission matrix row across every task has at least one corresponding automated test.
- FR-003: CI fails the build on any test failure, lint error, or TypeScript error.

## 9. Business Rules
N/A (this task verifies rules defined elsewhere; it does not define new ones).

## 10. Data Model
N/A — uses seed data (TASK-007) as fixtures.

## 11. Backend Architecture
- `backend/tests/{unit,integration,e2e}/`, using Vitest/Jest + Supertest for API, Playwright for E2E.

## 12. API Specification
N/A (testing infrastructure, not a product endpoint).

## 13. Frontend Requirements
- Playwright E2E specs living alongside `frontend/e2e/`.

## 14. Page Structure
N/A.

## 15. UX Behavior
N/A.

## 16. Validation Rules
N/A.

## 17. Permissions
N/A (this task tests permissions, defined per-module).

## 18. State Management
N/A.

## 19. Error Handling
N/A (this task verifies error handling defined elsewhere).

## 20. Edge Cases
- Every "Edge Cases" section across TASK-001–032 has at least one corresponding automated test — used as the master checklist for this task's coverage review.

## 21. Audit Requirements
N/A directly (TASK-031's own audit behavior is tested here as part of its module coverage).

## 22. Notifications
N/A.

## 23. Reporting Impact
N/A directly (Reports/Dashboard correctness is verified here via cross-engine consistency tests, per TASK-027/028's own testing sections).

## 24. Testing Requirements
### Unit Tests
All formulas in Section 6; Status Engine truth table; pricing engine's four billing methods; validation schemas.
### API Tests
Every endpoint across every module: success, `422` validation, `403` permission-denied, `404` not-found, `409` conflict paths.
### E2E Tests
Full primary workflow (Section 8.1-equivalent flow) end-to-end; login/logout; RTL rendering spot-check.
### Permission Tests
Every cell of Section 7's global matrix and every task-level matrix.
### Edge Case Tests
Every edge case enumerated across TASK-008–032.

## 25. Acceptance Criteria
- Given the full test suite, when run in CI, then 100% of Business-Rule worked examples pass and the build fails if any regress.
- Given any permission-matrix cell marked ❌, when the corresponding action is attempted by that role in a test, then it is rejected with the correct status code.

## 26. Dependencies
TASK-001–032.

## 27. Deliverables
- Full unit/API/E2E/permission/edge-case test suites, CI test-gating configuration (test execution only, no deployment).

## 28. Definition of Done
- CI is green; a coverage report shows all Business Rule formulas and all permission-matrix cells are exercised by at least one test.

---

# TASK-034 — Performance & Security Hardening

## 1. Objective
Finalize indexing, pagination/query optimization, input validation hardening, authentication hardening, and rate limiting across the whole system, per Sections 15 (Performance) and Section on Security below.

## 2. Business Purpose
A financial operations system must remain responsive at scale and resistant to common attack patterns before being trusted with production data.

## 3. User Story
As a **System Admin**, I want the system to remain fast and secure under real fleet-sized data volumes and against common attacks, so that operations aren't degraded and data isn't compromised.

## 4. Actors
Developer/Admin (hardening); protects all end users.

## 5. Preconditions
TASK-001–033.

## 6. Scope
- Index audit across every collection against the query patterns actually used by list/report endpoints (see Section 12, Database Standards).
- Rate limiting on authentication endpoints and, more loosely, on write endpoints generally (in-memory token bucket, no Redis).
- Input validation audit (every endpoint has a Zod schema; every ObjectId param is validated as a well-formed ObjectId before querying, to avoid Mongo cast-error 500s).
- CORS/security headers review; secrets/config audit (no secrets in source, `.env.example` complete).
- Aggregation pipeline review for the Profitability Engine and Reports Center against realistic data volumes.

## 7. Out of Scope
- Infrastructure-level scaling (load balancers, DB sharding/replication topology) — explicitly out of scope for this PRD.

## 8. Functional Requirements
- FR-001: `POST /api/auth/login` is rate-limited (e.g. 10 attempts / 15 minutes per IP+email combination), returning `429` with a `Retry-After` header when exceeded.
- FR-002: Every route accepting an `:id` param validates ObjectId format before querying, returning `422` (not a raw driver error) for malformed ids.
- FR-003: All list/report endpoints are verified (via `explain()`) to use an index, not a collection scan, for their default filter/sort combinations.
- FR-004: Aggregation-heavy endpoints (Profitability, Dashboard, Reports) are benchmarked against a seeded dataset of realistic scale (e.g. 500 generators, 100,000 operation logs, 50,000 fuel logs) and meet a defined response-time budget (e.g. p95 < 800ms).

## 9. Business Rules
N/A (this task hardens delivery of existing rules; it does not define new ones).

## 10. Data Model
No new collections; this task reviews and finalizes indexes on all existing collections (see Section 12).

## 11. Backend Architecture
- `middleware/rateLimit.ts` (in-memory token bucket, explicitly not Redis-backed), `middleware/validateObjectId.ts`, index-migration scripts.

## 12. API Specification
No new endpoints; existing endpoints gain rate-limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) where applicable.

## 13. Frontend Requirements
- Graceful handling of `429` responses (a specific "too many attempts, try again in N minutes" message on the login form, not a generic error).

## 14. Page Structure
N/A.

## 15. UX Behavior
- Rate-limited login shows a countdown-style message rather than a raw error code.

## 16. Validation Rules
- Malformed ObjectId path params rejected with `422` before any database call.

## 17. Permissions
N/A (this task hardens enforcement of permissions already defined; it verifies, via test, that `requirePermission` is present on every mutating route — a missing-permission-check audit is a required deliverable).

## 18. State Management
N/A.

## 19. Error Handling
- Rate-limit exceeded → `429` with `Retry-After`; malformed id → `422`, never a raw 500 from an unhandled Mongo `CastError`.

## 20. Edge Cases
- A legitimate user behind a shared corporate IP hitting the login rate limit — mitigated by keying the limiter on IP+email combination rather than IP alone, reducing false positives for shared-IP offices.
- An aggregation query that performs well at seed-data scale but degrades at realistic scale — caught specifically by the FR-004 benchmark task, not left to production discovery.

## 21. Audit Requirements
- A completed "missing permission check" audit across all mutating routes is itself recorded as a deliverable/checklist artifact (not a runtime audit log entry).

## 22. Notifications
N/A.

## 23. Reporting Impact
- Ensures Reports/Dashboard/Profitability remain responsive as data grows — directly protects the usability of TASK-025/027/028.

## 24. Testing Requirements
- **Unit**: rate limiter bucket logic, ObjectId validation middleware.
- **API**: rate-limit trigger and reset, malformed-id rejection across a sample of endpoints.
- **Performance**: benchmark suite against the realistic-scale seeded dataset (FR-004), run as part of CI or a dedicated perf-check step.
- **Security**: a full pass confirming every mutating route has `requireAuth` + `requirePermission`.

## 25. Acceptance Criteria
- Given 11 failed login attempts within 15 minutes for the same IP+email, when the 11th is attempted, then it is rejected with `429` and a `Retry-After` header.
- Given the realistic-scale seeded dataset, when the Dashboard and Profitability endpoints are queried, then p95 response time is under the defined budget.
- Given every mutating route in the codebase, when the security audit runs, then each one is confirmed to have both `requireAuth` and an appropriate `requirePermission`.

## 26. Dependencies
TASK-001–033.

## 27. Deliverables
- Rate limiting middleware, ObjectId validation middleware, finalized index set, performance benchmark report, security audit checklist (all mutating routes verified).

## 28. Definition of Done
- All FRs verified by automated tests; performance budget met on the realistic-scale fixture; zero mutating routes found missing a permission check.


---

## 9. Dashboard (Reference Summary)

See TASK-027 for the full implementation spec. KPI formulas are defined once in Section 6 and TASK-027's Section 9 table, and are never recalculated independently by the Dashboard layer.

| Group | KPIs |
|---|---|
| Fleet | Total, Available, Rented, Under Maintenance, Stopped generators |
| Financial | Revenue, Receipts, Outstanding Receivables, Expenses, Net Profit |
| Operations | Operating Hours, Fuel Consumption, Maintenance Cost |
| Alerts | Expiring Contracts, Overdue Customers, Upcoming Maintenance, Stopped Generators, Abnormal Fuel Consumption |
| Charts | Monthly revenue trend, Extract status distribution, Most utilized generators, Most profitable generators |

---

## 10. Reports (Reference Summary)

See TASK-028 for the full implementation spec (filters, permissions, endpoint contracts).

| Report | Metrics | Filters |
|---|---|---|
| Generator Revenue | Rental revenue per generator | Date, generator, project |
| Generator Profitability | Revenue, fuel, maintenance, labor, transport, parts, net profit | Date, generator |
| Operations | Start/end meter, operating hours, downtime | Date, project, generator |
| Fuel Consumption | Liters, cost, liters/hour, variance from normal | Date, generator |
| Maintenance | Maintenance jobs and costs | Date, generator, type |
| Customer Statement | Extracts, receipts, discounts, balance | Customer, period |
| Uncollected Extracts | Extract total, collected, remaining, status | Customer, period |
| Expenses | Operating/admin expenses | Category, date, project, generator |
| Profit & Expense Summary | Revenue, expenses, net profit | Period, project, generator |

---

## 11. API Standards

### 11.1 URL Naming
- Plural nouns for collections: `/api/generators`, `/api/contracts`.
- Nested sub-resources only where the child cannot exist independently of the parent's identity in the URL (rare in this system — most modules use top-level routes with a `filter` query param instead, e.g. `/api/operations?generatorId=`, to keep filtering flexible).
- Actions that aren't pure CRUD are modeled as sub-resource verbs: `POST /api/contracts/:id/activate`, `POST /api/extracts/:id/approve`.

### 11.2 HTTP Methods & Status Codes
| Method | Use | Typical Success | Typical Errors |
|---|---|---|---|
| GET | Read (list/detail) | 200 | 404 |
| POST | Create / lifecycle action | 201 (create) / 200 (action) | 400, 401, 403, 409, 422 |
| PATCH | Partial update | 200 | 400, 401, 403, 404, 409, 422 |
| DELETE | Soft delete/deactivate | 200 | 401, 403, 404, 409 |

### 11.3 Pagination, Filtering, Sorting, Search
- Query params: `page` (default 1), `limit` (default 20, max 100), `sort` (field name, allow-listed per endpoint; prefix `-` for descending), `search` (free text where applicable), plus endpoint-specific filters (`status`, `customerId`, `from`/`to`, etc.).
- Date ranges always use `from`/`to` ISO-8601 date strings.

### 11.4 Standard Response Envelope
Success:
```json
{ "success": true, "data": { }, "message": null, "meta": {} }
```
List success additionally populates `meta`:
```json
{ "success": true, "data": { "items": [], "meta": { "page":1, "limit":20, "total":0, "totalPages":0 } }, "message": null }
```
Error:
```json
{ "success": false, "data": null, "message": "Validation failed", "errors": [ { "field": "email", "message": "Invalid email format" } ] }
```

### 11.5 Error Format Rules
- `message` is always a short, human-readable summary.
- `errors[]` is present for field-level validation failures; omitted (or empty) for non-field errors (e.g. `403`).
- Stack traces are never included in any response, in any environment.

---

## 12. Database Standards

### 12.1 Soft Deletion
Every entity referenced by financial or operational history uses `isDeleted`/`active`-style soft deletion (never a hard `deleteOne`) so historical reports and audit trails remain intact: Generator, Customer, Project, User. Purely transactional/log-style entities (OperationLog, FuelLog) are never deleted at all in V1 — only superseded (per Business Rule 6.3) or reversed via a compensating entry.

### 12.2 Indexing Strategy
- Every unique business identifier (`code`, `number`) has a unique index.
- Every foreign-key-style `ObjectId` reference used in a filter has an index; frequently-combined filters (e.g. `generatorId + date`, `customerId + status`) use compound indexes matching actual query shapes, verified via `explain()` (TASK-034).
- All list/report endpoints are covered by an index for their default sort field to avoid in-memory sort penalties at scale.

### 12.3 Timestamps
- Every collection uses Mongoose `timestamps: true` (`createdAt`/`updatedAt`) as a baseline, per TASK-003's base schema mixin.

### 12.4 Decimal/Monetary Fields
- Every monetary field uses `Schema.Types.Decimal128`; all arithmetic in application code goes through the `decimal.js`-based money utility (TASK-003); rounding is 2dp, ROUND_HALF_UP, applied once per formula's final step (Business Rule 6.7, TASK-021).

### 12.5 Embedding vs. Referencing
See Section 5.2 for the full decision table; the short rule: embed small, bounded, always-loaded sub-documents; reference anything independently paginated/queried/growing.

---

## 13. UI/UX Standards

- shadcn/ui is the exclusive component system; Tailwind CSS handles layout/spacing/responsive behavior.
- Arabic RTL is a first-class, always-on-capable mode — logical CSS properties only, verified per TASK-004.
- Visual direction: modern, professional, clean, enterprise-oriented, data-dense, consistent — following the provided dashboard screenshot's direction, not as a pixel-perfect copy.
- Every list screen: Skeleton (loading), Empty (zero records — with contextual CTA), Error (with Retry), populated (DataTable) — no other unstated state is acceptable.
- Destructive/state-changing actions (cancel, deactivate, stop) always use `ConfirmDialog`, never a native browser confirm.
- Status colors are fixed and consistent app-wide (see TASK-009's status color mapping as the canonical example); the same convention (green=good/available, amber=warning/in-progress, red=critical/stopped/overdue, blue=active/informational) is reused for every status badge in the system (Contract, Extract, Maintenance, Notification).
- Financial amounts are always formatted with the configured currency (TASK-030) and 2 decimal places, using the shared currency formatter — never ad hoc `toFixed()` calls scattered across components.
- Tables default to server-side pagination/filtering/sorting for any collection that can exceed ~100 rows in realistic use (i.e., essentially every list in this system) — see TASK-005.

---

## 14. Testing Strategy

| Level | Coverage |
|---|---|
| Unit Tests | Every formula in Section 6, Status Engine truth table, Pricing Engine's four billing methods, money/rounding utility, permission-key matching |
| API Tests | CRUD, validation, authorization, contract conflicts, financial workflows — every endpoint's success/422/403/404/409 paths |
| Integration Tests | Multi-document workflows (contract activation → status recalculation; receipt allocation → extract status; maintenance completion → schedule engine) |
| E2E Tests | Login, generator creation, contract creation → activation, operation entry, extract creation → approval, receipt, dashboard, RTL spot-check |
| Permission Tests | Every role/action cell in Section 7's global matrix and every task-level matrix |
| Regression Tests | Every Business Rule worked example (Section 6, Section 15 equivalents) re-run after every major module lands |
| Performance Tests | Aggregation-heavy endpoints (Profitability, Dashboard, Reports) benchmarked at realistic scale (TASK-034) |

Full detail and execution ownership: TASK-033 (functional coverage) and TASK-034 (performance/security).

---

## 15. Global Definition of Done

A feature — any feature, in any task — is only complete when **all** of the following hold:

- Backend implementation is complete: routes → controllers (HTTP only) → services (business rules) → models, following the layering rule in Section 2.2.
- Frontend implementation is complete, using shadcn/ui per Section 13, with Loading/Empty/Error states implemented.
- Database changes (schema, indexes, soft-delete strategy) are complete per Section 12.
- Input validation is implemented at both the Zod (API boundary) and Mongoose (persistence boundary) layers.
- Permissions are implemented and enforced **at the API level**, not only hidden in the UI, matching the relevant permission matrix.
- Error handling covers validation, authentication, authorization, not-found, duplicate, conflict, and calculation-error cases per the standard envelope.
- All financial/business-rule edge cases identified in the owning task's Section 20 are handled and tested.
- Sensitive actions are audited per TASK-031's integration.
- Unit tests pass for all business rules/formulas touched.
- API/integration tests pass for all endpoints touched.
- Relevant E2E tests pass for the primary workflow(s) touched.
- No TypeScript errors, no lint errors.
- No duplicated business/calculation logic (verified: the feature calls the owning engine/service rather than reimplementing a formula).
- UI follows the established shadcn/ui design system and renders correctly in RTL.
- Acceptance criteria (Given/When/Then) for the task are all independently verified.

---

## 16. Open Decisions / Recommended Decisions

The following ambiguities were identified during this enhancement pass. Each has a recommended default (already reflected in the relevant task/business rule above) but is flagged here as an explicit decision point for stakeholder confirmation before/soon after implementation.

| # | Ambiguity | Risk if unresolved | Recommended Decision (already implemented above) |
|---|---|---|---|
| 1 | Can a generator be under maintenance while commercially assigned to an active contract? | Billing/status confusion, accidental double-booking | Status priority order (6.1): Stopped > Rented > Under Maintenance > Available, with a separate `commercialStatus` flag; see TASK-009 |
| 2 | Should a contract be pausable (stop billing) while its generator is under maintenance? | Customers billed for downtime with no formal recourse | Not supported in V1 — operational status and billing are decoupled; flagged for a future "Contract Pause" enhancement |
| 3 | Same-day contract handover (one contract ends the day another begins) — conflict or allowed? | Either false-positive blocking or real double-booking | Treated as a conflict by default (inclusive boundary check); override via Admin "Shared Assignment" exception (TASK-013) |
| 4 | Can an Approved, partially-collected extract be cancelled outright? | Ledger corruption if a collected amount is simply discarded | Blocked once `collectedAmount > 0`; must be corrected via Credit Note instead (TASK-020/023) |
| 5 | Should zero-total extracts be permitted? | Clutter / unclear business intent | Not prohibited by the Financial Engine, but flagged as a policy question for Finance to decide whether to block at the UI level |
| 6 | Does changing currency retroactively convert historical monetary values? | Silent, incorrect restatement of historical financials | Not supported — currency change only affects new records going forward (TASK-030) |
| 7 | Should report *viewing* (not just mutation) be audit-logged for compliance? | Under- or over-logging relative to actual compliance need | Left as a stakeholder decision; TASK-028 flags it explicitly |
| 8 | Password reset via email / MFA | Account-recovery gap; security posture | Out of scope for V1 (requires an email-provider decision outside this PRD's scope); Admin can reset passwords manually in the interim |
| 9 | Multi-day Operation Log entries (spanning midnight) | Data-entry friction for overnight shifts | V1 requires same-day entries only; documented as a possible future enhancement |
| 10 | Fuel Log correction workflow (parallel to the Operation Log correction workflow) | Wrong fuel entries handled inconsistently vs. meter corrections | V1 uses a reversing/voiding entry with a note rather than a symmetrical correction workflow; flagged for future alignment with TASK-015's pattern if needed |

---

**End of Enhanced PRD.** This document supersedes the original v1.0 PRD as the single source of truth for the Generator Rental Management System development team.
