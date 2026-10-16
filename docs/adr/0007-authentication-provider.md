# ADR-007: Authentication provider

- **Status:** Superseded by ADR-019 before installation.
- **Decision:** **Better Auth**, storing users and sessions in our own PostgreSQL, using its organisation feature for agencies, memberships, roles and invitations, and its two-factor feature (required per ADR-015). Custom password handling is rejected.
- **Why:** accounts stay in our UK database (simpler UK GDPR position), no per-user fees, and organisations/invitations match invite-only agency onboarding.
- **Note:** Confirm current Better Auth APIs from its official docs at install time. Changing auth requires owner approval.
- **Date:** 2026-10-11
