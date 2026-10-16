# ADR-006: Row Level Security

- **Status:** Superseded by ADR-023 (timing confirmed)
- **Context:** Application `organisationId` filters can be missed.
- **Decision lean:** Add PostgreSQL RLS as defence in depth after basic Prisma scoping works. Not required for the first schema spike. The app already connects as `zayto_app` (cannot bypass RLS), so policies will apply when added.
- **Date:** 2026-10-11
