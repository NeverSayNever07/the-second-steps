# ADR-011: Next.js upgrade path

- **Status:** Accepted and done (2026-10-11): now Next.js 16.4.0, React 19.3.0. Next.js advisories cleared. Remaining `npm audit` items are development-time only: `braces` (shadcn CLI) and `mysql2` / `deepmerge-ts` (Prisma CLI). None of these ship in the deployed app. Revisit when those tools ship updates.
- **Context:** Installed Next.js is 15.4.1. `npm audit` reports high and critical advisories. The current release is 16.4.0; 15.5.27 is the 15.x security backport.
- **Decision:** Commit a checkpoint, upgrade to 15.5.27 and verify, then upgrade to 16 with the official codemod (`npx @next/codemod upgrade latest`) and verify. Node 22 meets Next 16's minimum (20.9). Patch before any public hosting.
- **Date:** 2026-10-11
