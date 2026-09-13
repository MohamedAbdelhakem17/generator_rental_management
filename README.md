# Generator Rental Management System

Internal business management platform for a generator rental company — see
`generator_rental_management_prd.md` for the full product spec (34 tasks, TASK-001 → TASK-034)
and `constitution.md` for the non-negotiable architectural/financial/security rules. Both govern
every change in this repo; read `CLAUDE.md` before implementing anything.

## Stack

- `/backend` — Node.js + Express + TypeScript + MongoDB/Mongoose (REST API only)
- `/frontend` — Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (consumes the API only)

## Requirements

- Node.js >= 20 (see `.nvmrc`)
- pnpm >= 10 (`corepack enable` will pick up the `packageManager` field automatically)
- A running MongoDB instance (local or remote)

## Setup

```bash
pnpm install

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# then fill in backend/.env — at minimum MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
```

## Development

```bash
pnpm --filter backend dev     # Express API on http://localhost:4000
pnpm --filter frontend dev    # Next.js app on http://localhost:3000
pnpm dev                      # both, in parallel
```

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Project structure

```
/
├── backend/     Express API (src/app.ts factory, src/server.ts entrypoint, src/config/env.ts)
├── frontend/    Next.js App Router app
├── constitution.md
├── generator_rental_management_prd.md
└── CLAUDE.md
```
