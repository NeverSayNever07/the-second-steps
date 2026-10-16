# ADR-022: Identity, membership, participation, and personal portal

- **Status:** Accepted (owner decision, 2026-10-12)
- **Decision:** One global login identity may operate in many capacities. Business operators use workspace-specific `Membership`s. Applicants, tenants, guarantors, and invited landlords use resource-specific `Participation`s and access grants rather than broad workspace membership. Roles are never global customer roles.
- **Personal data:** A small user-controlled personal profile may reduce repeated entry. Each workspace keeps its own operational person record and history. Information is shared into a case explicitly; sensitive evidence and results remain case-scoped. Joint applicants' and guarantors' financial, identity, and referencing information is private by default.
- **Portal:** One personal portal may aggregate the signed-in user's authorised applications, tenancies, guarantees, and landlord relationships across workspaces. It must evaluate each participation separately and must not expose one workspace or relationship to another.
- **Commercial treatment:** External participants do not consume staff seats. Plans may instead meter cases, properties, tenancies, storage, messages, or chargeable provider transactions.
- **Date:** 2026-10-12
