# ADR-020: Workspace is the tenant and commercial boundary

- **Status:** Accepted (owner decision, 2026-10-12). Supersedes ADR-005's organisation-only boundary.
- **Decision:** `Workspace` is the hard boundary for tenant data, subscriptions, entitlements, usage, and business permissions. Initial workspace types are agency, independent landlord, and internal platform. An organisation may own a workspace, while an individual landlord may own one without being modelled as a company.
- **Identity:** One identity may hold different memberships and participations across many workspaces. Selecting a business workspace is explicit; object identifiers never select or prove workspace access.
- **Administration:** Platform administration is separate from customer membership and grants no standing access to customer data. Support access will require separately approved controls and audit.
- **Date:** 2026-10-12
