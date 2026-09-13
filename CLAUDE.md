# CLAUDE.md — Generator Rental Management System

Guidance for Claude Code (or any AI coding agent) working in this repository.

## Source of Truth

Before implementing anything, read these two documents in full — they govern every decision in this repo and take precedence over ad hoc chat instructions:

- `constitution.md` — non-negotiable architectural, financial, security, and quality rules.
- `generator_rental_management_prd.md` — the full product spec: domain model, business rules (Section 6), and 34 implementation tasks (TASK-001 → TASK-034), each with its own data model, API contract, permission matrix, edge cases, and acceptance criteria.

If a request conflicts with either document, stop and flag the conflict rather than silently picking a side.

## Repository Layout

```
/backend    Node.js + Express + TypeScript + MongoDB/Mongoose — REST API only
/frontend   Next.js + TypeScript + Tailwind + shadcn/ui — consumes the API only
```

The frontend never imports a Mongoose model or opens a DB connection. All access goes through `/api/*`.

## Required Skill Usage

- **Any frontend/UI task MUST use the `frontend-design:frontend-design` skill.** This applies to every task that touches `/frontend` — building or modifying a page, a shadcn/ui component, a layout, a form, a dashboard widget, a chart, or any visual/styling change. Load and follow that skill's guidance (design tokens, styling constraints, aesthetic direction) before writing or editing any frontend code — do not default to generic/templated component output.
- This is mandatory, not a suggestion: if the task at hand includes a UI deliverable, invoking the skill is a required first step, in the same way reading the relevant task's PRD section is required before implementing it.
- This does not replace anything in this file or in `constitution.md` — the skill governs visual/styling execution; the layering, permission, and business-rule conventions below still apply in full to any component the skill helps produce.

## Working Conventions

- **Always work task-by-task.** Pick up the next TASK-XXX in dependency order (see each task's "Dependencies" section), or the specific task the user names. Read that task's full spec before writing code — the 28-section template is exhaustive on purpose (data model, validation, permissions, edge cases, acceptance criteria).
- **Layering is enforced, not optional:** `Route → Middleware → Controller → Service → Model`. Controllers never contain a calculation or a business conditional. If you're about to write an `if` that encodes a business rule inside a controller or a React component, move it into the module's `service.ts` (backend) or the relevant shared engine.
- **Never duplicate a formula or a status rule.** Business Rules live in PRD Section 6 and are each owned by exactly one engine (Status Engine, Contract Conflict Engine, Financial Calculation Engine, Customer Ledger Engine, Fuel Alert Engine, Maintenance Schedule Engine, Profitability Engine). If two features need the same number, both call the same engine function — never re-derive it.
- **Money is Decimal128 + `decimal.js`, always.** Never a native JS float for any monetary field or calculation.
- **Every list endpoint is paginated and server-filtered** using the shared `paginateQuery` service and, on the frontend, the shared `DataTable`/`useDataTableQuery` system. Don't hand-roll a new pagination pattern.
- **Soft delete, never hard delete**, for anything with financial or operational history (Generator, Customer, Project, User, Contract). Operation/Fuel logs are never deleted — only superseded or reversed, per the PRD's correction workflows.
- **Every mutating route needs `requireAuth` + `requirePermission`**, matching the permission matrix in that task's Section 17. Don't rely on the frontend hiding a button.
- **Audit sensitive actions.** If a task's Section 21 ("Audit Requirements") lists an action, call `AuditService.record(...)` in the same service method that performs the mutation.
- **Follow each task's validation rules exactly** (Section 16) using Zod at the API boundary and Mongoose constraints at the persistence boundary — both, not one or the other.

## Before Marking a Task Done

Check it against the task's own Section 28 ("Definition of Done") and the global Definition of Done in PRD Section 15:
- Backend + frontend + DB changes complete, validation and permissions enforced server-side, error/empty/loading states implemented.
- Unit tests for every formula/edge case the task specifies; API tests for success/validation/permission-denied paths; relevant E2E coverage.
- No TypeScript or lint errors. No duplicated business logic — verify the code calls the owning engine/service rather than reimplementing it.
- RTL rendering unaffected or explicitly checked, for any UI change.

## Commands (adjust once the workspace is scaffolded per TASK-001)

```bash
pnpm install                     # install both apps
pnpm --filter backend dev        # run API locally
pnpm --filter frontend dev       # run web app locally
pnpm --filter backend seed       # baseline roles/settings (TASK-007)
pnpm --filter backend seed:demo  # demo data, dev/test only — refuses to run in production
pnpm lint && pnpm typecheck
pnpm test                        # unit + API suites
pnpm --filter frontend e2e       # Playwright E2E
```

## When Unsure

- Ambiguity about a business rule: check PRD Section 16 ("Open Decisions") first — it may already document the recommended default and the reasoning.
- Ambiguity about scope for a task: re-read that task's "Out of Scope" section before assuming a feature belongs to it.
- Never introduce Redis, another UI component library, deployment/infra tooling, or a new caching layer — these are Constitution-level exclusions, not open questions.
