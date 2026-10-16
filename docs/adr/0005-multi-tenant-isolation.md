# ADR-005: Multi-tenant isolation

- **Status:** Superseded by ADR-020
- **Decision:** Shared PostgreSQL, `organisationId` on tenant data, shared-schema. Not a database-per-agency for v1.
- **Why:** Simpler operations for a PoC and early commercial product. Revisit only if a customer contract requires physical isolation.
- **Date:** 2026-10-11
