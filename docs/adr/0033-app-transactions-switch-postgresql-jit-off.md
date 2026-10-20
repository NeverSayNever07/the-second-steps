# ADR-033: App transactions switch PostgreSQL JIT off

- **Status:** Accepted (owner decision, 2026-10-20)
- **Context:** A volume test (6,000 contacts, 3,000 properties and leads, 300 instructions) found Landlords search taking about 1.2 seconds when few contacts matched. `EXPLAIN` showed the query ran in about 21ms; PostgreSQL's JIT compiler spent about 1.17 seconds compiling it, because row security makes short reads look expensive to the planner.
- **Decision:** `withVerifiedIdentity` sets `jit = off` with `set_config('jit', 'off', true)`, in the same statement that sets `app.auth_subject` at the start of every app transaction. It is transaction-local, like the rest of the database context ([ADR-023](0023-tenant-isolation-uses-application-scoping-and-postgresql-rls-from-the.md)).
- **Rules out:** Leaving JIT on (adds up to a second to row-secured reads). A role-level `ALTER ROLE zayto_app SET jit = off` migration (a shared-database change for the same effect, and invisible in the code). Rewriting queries to look cheaper to the planner (fragile).
- **Trade-offs:** Long analytical queries would lose JIT's benefit. The app has none today; a future reporting job can set it back on for its own transaction. Transactions that do not go through `withVerifiedIdentity` keep the server default.
- **Evidence:** `RUN_PERF=1 npm run test:integration -- tests/integration/query-volume.test.ts`; after the change every measured read took 63ms or less. A database test checks the setting is off inside and not left on the connection.
- **Date:** 2026-10-20
