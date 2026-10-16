# ADR-015: Data residency, MFA, and agency onboarding

- **Status:** Accepted (owner decision, 2026-10-11)
- **Decision:** All agency and personal data is stored in the **UK only** (London region) for the database, file storage, and any provider that holds personal data. Staff **must** use two-step login (MFA) at release. ADR-026 allows enforcement to remain feature-flagged off during proof-of-concept development, with a release safeguard that can force it on. Agencies are **invite-only** for the proof of concept: the owner creates each agency workspace; there is no public agency sign-up.
- **Updated by ADR-020 and ADR-022:** one identity may belong to several workspaces and participate in cases across several organisations. Whether independent landlords may self-register for a free or paid workspace remains unresolved.
- **Date:** 2026-10-11
