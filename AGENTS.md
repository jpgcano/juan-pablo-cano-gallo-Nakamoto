# Repository Guidelines

## Project Structure & Architecture

This repository contains three independent TypeScript projects; do not introduce cross-project source imports.

- `frontend/`: React/Vite client. Organize UI by feature in `src/features/`, shared UI in `src/components/`, and browser utilities in `src/lib/`.
- `backend/`: Fastify REST/WebSocket API. Each business module (`identity`, `messaging`, `copilot`) follows `domain/`, `application/`, `infrastructure/`, and `interfaces/` layers. Import another module only through its `index.ts`.
- `database/`: PostgreSQL migrations, seed corpus, SQL queries, and integration tests. Migrations are ordered numerically under `migrations/`.
- `docs/`: OpenAPI contract, architecture notes, and diagrams; update `docs/openapi.yaml` with API changes.

Read `ARCHITECTURE.md` before changing authentication, authorization, or module boundaries. RLS is the final authorization boundary; never replace it with frontend-only or API-only checks.

## Build, Test, and Development Commands

Use pnpm 9 and Node.js 20; do not use npm or Yarn. From each project directory:

```bash
pnpm install                 # install that project's dependencies
pnpm dev                     # run frontend or backend in watch mode
pnpm build                   # compile/package frontend or backend
pnpm lint                    # run ESLint (or TypeScript validation in database)
pnpm test                    # run backend/database Vitest suites
```

For a local database workflow, first start the PostgreSQL service as documented in `README.md`, then run `cd database && pnpm migrate && pnpm seed`. Backend and database tests use a real seeded PostgreSQL instance.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, single quotes, and existing ESM `.js` import specifiers. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and descriptive `*.test.ts` names. Keep HTTP schemas beside routes and persistence adapters in `infrastructure/`.

ESLint enforces React Hooks and backend architecture boundaries. Resolve errors and relevant warnings before review.

## Testing Guidelines

Write Vitest tests close to the relevant layer: API security coverage belongs in `backend/tests/`; database/RLS behavior belongs in `database/tests/`. Name cases as behavior statements, e.g. `it('rejects a request without a token', ...)`. Use the existing seed corpus and verify allowed and denied paths.

## Commits & Pull Requests

Follow the repository's Conventional Commit style: `feat(frontend): ...`, `fix(backend): ...`, or `docs: ...`. Keep commits focused. Pull requests should state the affected project, describe user-visible and security effects, link the relevant issue when available, include test/lint results, and attach screenshots for frontend changes. Do not commit `.env` or credentials; copy `.env.example` for local configuration.
