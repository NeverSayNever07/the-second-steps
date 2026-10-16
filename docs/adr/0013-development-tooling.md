# ADR-013: Development tooling

- **Status:** Accepted and done (2026-10-11)
- **Decision:** ESLint 9 with `eslint-config-next` and `eslint-config-prettier` (via the ESLint CLI, since Next.js 16 removes `next lint`), Prettier 3, Vitest 5 for unit/integration tests, Playwright for browser tests (Chromium). `npm run check` runs typecheck, lint, format check and unit tests. shadcn output (`components/ui`) is excluded from Prettier so CLI updates diff cleanly. `@types/node` moved to v22 to match the installed Node.js 22.
- **Date:** 2026-10-11
