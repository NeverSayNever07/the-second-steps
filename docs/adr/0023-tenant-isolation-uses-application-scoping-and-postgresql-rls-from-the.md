# ADR-023: Tenant isolation uses application scoping and PostgreSQL RLS from the first slice

- **Status:** Accepted (owner decision, 2026-10-12). Supersedes ADR-006's proposed timing.
- **Decision:** Every tenant-owned row is scoped by `workspaceId`. Server-side application code must derive the active workspace from verified access and filter every query and mutation. PostgreSQL Row Level Security is added with the first workspace-owned records as defence in depth, not deferred until later scale work and not used as a substitute for application checks.
- **Testing:** Each repository and mutation needs tests proving that another workspace is denied. Participant-facing data also needs tests proving that joint applicants and other parties cannot read one another's private fields or evidence.
- **Date:** 2026-10-12
