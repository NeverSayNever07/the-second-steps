# ADR-002: App Router as target, Pages Router until migration

- **Status:** Superseded by ADR-012 (timing changed: migrate now, before CRM screens)
- **Context:** The repo uses Pages Router. Next.js currently recommends the App Router for new apps (Server Components, layouts, Server Actions).
- **Decision:** Do not migrate until a dedicated, tested task. New screens stay in `pages/` until then. After migration, new features use `app/`. shadcn `rsc: false` should be revisited at migration.
- **Date:** 2026-10-11
