# ADR-004: PostgreSQL and Prisma

- **Status:** Accepted (owner approved install, 2026-10-11)
- **Decision:** PostgreSQL as the system of record; Prisma as ORM and migration tool.
- **Why:** Relational data (tenancies, FKs, transactions) fits SQL. Prisma is widely used with Next.js.
- **Installed:** Prisma 7.10.0 (latest stable; the npm `latest` tag pointed at an 8.0 release candidate needing a newer Node.js), with the `@prisma/adapter-pg` driver. Schema in `prisma/schema.prisma`, settings in `prisma.config.ts`, client in `core/db/client.ts`, generated code in `core/db/generated/` (not committed). Commands: `npm run db:migrate` (create/apply a migration locally), `npm run db:deploy` (apply in production).
- **Audit note:** Prisma's command-line tool brings in `mysql2` and `deepmerge-ts` with high-severity advisories. Both run only on developer machines during Prisma commands (we use PostgreSQL, not MySQL) and are not in the deployed app. The only automatic fix is downgrading to Prisma 6; revisit when Prisma ships updates.
- **Date:** 2026-10-11
