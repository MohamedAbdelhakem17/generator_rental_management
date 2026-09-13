# Constitution — Generator Rental Management System

Version 1.0 | Ratified alongside PRD v2.0 (`generator_rental_management_prd.md`)

This document is the non-negotiable governing charter for this project. Where the PRD describes *what* to build, this Constitution defines the principles no implementation, task, or shortcut may violate — for any reason, including deadlines, convenience, or a stakeholder request made outside this process. If a PRD task ever appears to conflict with this Constitution, the Constitution wins and the conflict must be resolved by amending one of the two documents explicitly (see Governance).

## Article I — Architectural Integrity

1. **Two applications, one contract.** `/backend` and `/frontend` are independent applications communicating only through the versioned REST API. The frontend MUST NEVER import a Mongoose model, open a MongoDB connection, or otherwise reach past the API boundary.
2. **Layering is mandatory.** Every backend module follows `Route → Middleware → Controller → Service → Model`. Controllers handle HTTP concerns only. All business rules, calculations, and cross-entity consistency checks live in services. A pull request that puts a calculation or a conditional business rule in a controller or a React component is rejected on that basis alone.
3. **Cross-cutting engines are singular.** Status derivation, contract conflict detection, financial calculation, customer ledger, fuel/maintenance alerting, profitability, notifications, and audit logging each live in exactly one engine module. No other module may reimplement, shadow, or partially duplicate their logic. If two modules need the same rule, they both call the same engine — the rule is never copy-pasted.

## Article II — Technology Constraints (Non-Negotiable)

1. Backend: Node.js, Express, TypeScript, MongoDB, Mongoose. Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui.
2. **Redis is permanently excluded.** No external cache, message broker, or session store of any kind is introduced without a formal Constitution amendment. Temporary/derived state uses in-process memory only, and must be safe to lose on restart.
3. **shadcn/ui is the only UI component system.** No Material UI, Ant Design, Chakra, Bootstrap, or similar is ever introduced alongside it.
4. **Money is never a JavaScript float.** Every monetary field is `Decimal128` in MongoDB; every monetary calculation in application code goes through the shared decimal-safe money utility. A PR introducing raw float arithmetic on money is rejected regardless of how small the amount.
5. No deployment or infrastructure tooling is introduced as part of feature work. Infrastructure decisions are explicitly out of scope for this phase and require a separate, deliberate process.

## Article III — Financial Integrity

1. **Approved financial documents are immutable.** Once an Extract reaches `Approved` or beyond, its financial fields are never edited in place. Corrections happen only through cancellation + reissue or a Credit Note — always a new, audited transaction, never a silent mutation of history.
2. **VAT and other point-in-time rates are snapshotted.** A rate used to approve a document is copied onto that document at the moment of approval and is never recalculated from a later, changed system setting.
3. **The customer balance is always derived, never stored as a freely-writable field.** It is computed live from Extracts, Receipts, and Credit Notes every time it's read. If a cached value exists for performance, the ledger engine — not any other module — owns its invalidation.
4. **No silent rounding, no silent clamping.** A calculation that would produce a negative or otherwise invalid financial result is rejected with a clear validation error, never quietly forced to zero or another "safe-looking" value.

## Article IV — Data Integrity & Operational Truth

1. **Status fields are derived, not declared.** `Generator.status` is written only by the Status Engine (plus the two explicit stop/resume actions it consumes as input). No feature is permitted to set it directly to make a screen "look right."
2. **History is never destroyed.** Entities referenced by financial or operational history are soft-deleted, not hard-deleted. Meter corrections, once entered, keep the original record visible (marked Superseded) alongside the correction — the correction never overwrites the original in place.
3. **One conflict engine decides double-booking.** No screen, script, or manual override bypasses the Contract Conflict Engine's hard check at contract activation, except the single explicitly-audited "Shared Assignment" exception path.

## Article V — Security & Access

1. **Authorization is enforced at the API, always.** A frontend that hides a button is a UX nicety, never a security control. Every mutating route carries an explicit `requirePermission` check matching the permission matrices in the PRD.
2. Passwords are hashed, never stored or logged in plain text. Sessions use httpOnly, secure cookies. No endpoint trusts a client-supplied role or permission claim.
3. Every sensitive mutation (see the PRD's Audit Requirements per task) is written to the append-only Audit Log in the same operation as the mutation it describes — this is not an optional or "add later" concern.

## Article VI — Quality Gates

A change does not merge unless:

1. It follows the layering rule (Article I.2) — verified in review, not just by tests passing.
2. It introduces no duplicated business/calculation logic — verified by confirming the code calls the owning engine/service.
3. Its financial or status-affecting logic has automated unit tests covering the relevant Business Rule's worked example and edge cases.
4. Its API surface has tests for the success path, validation failure, and permission denial.
5. TypeScript and lint are clean; no `any` used to silence a type error on a money, status, or permission field.
6. RTL rendering is unaffected or explicitly verified where UI changed.

## Article VII — Governance

1. This Constitution and the PRD are the two source-of-truth documents. Any other note, chat message, or verbal instruction that conflicts with either is not authoritative until one of these documents is formally amended.
2. Amendments are explicit: a change to a Business Rule, a permission matrix, or an Article above is made by editing the relevant document directly and noting the change, not by quietly diverging in code while the document stays stale.
3. When a task's specification and this Constitution appear to conflict, implementation stops on the conflicting point until it is resolved in the documents — the agent or developer does not silently pick a side.
4. "It was faster this way" is never sufficient justification for violating Articles I–V.
