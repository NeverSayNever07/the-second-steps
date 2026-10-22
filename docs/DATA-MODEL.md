# Data model

The access, people/organisation, property/ownership, landlord-lead, actions and instruction foundations are implemented in Prisma and PostgreSQL. The remaining product model is a discussion model and must not be turned into tables until its product and data-ownership decisions are approved.

Implemented tables include the access foundation, contacts and organisations, properties and ownership, landlord leads/appraisals/tasks, general actions, the instruction tables below, private documents, property compliance, and listings (`listings`, `listing_content_versions`, `listing_events`, `listing_media`; ADR-034). Their migrations enable and force RLS, use transaction-local verified identity/workspace context, and apply workspace-aware foreign keys. Applied hardening protects workspace-aware audit actors, named-branch scopes, the final active Account Owner, and tenant/branch isolation. Applicant-side CRM, tenancies, property management, accounting and participant tables do not exist yet.

Appraisal booking details and annual instruction fees (migration `20261021160000_appraisal_booking_details`; created and tested locally, not yet applied to shared development Supabase): appraisals can store optional staff booking notes, and instruction terms can record an annual fee frequency. Existing percentage fees without a frequency remain valid for historical compatibility; the application requires a frequency on new percentage and fixed-fee terms.

Chunk 6A instructions (migration `20261017120000_instructions_and_terms`; applied to shared development Supabase and checkpointed on 2026-10-19): `instructions` (one current per property; from a won landlord lead; journey Onboarding, Ready to market, Withdrawn; ended date and reason), `instruction_parties` (landlords, one main contact, removal kept), `instruction_terms_versions` and `instruction_terms_charges` (whole immutable terms; money in integer pence, percentage fees in basis points, VAT inclusive/exclusive/none), `instruction_agreement_events`, `instruction_ownership_checks`, `instruction_exceptions` and `instruction_journey_history` (append-only). Properties and contacts gain database-kept `current_instruction_count` and `current_instruction_party_count`, which block archiving; a property with a current instruction cannot change branch. Design and rules: `.cursor/plans/landlord-property-onboarding.md` (Chunk 6).

C1 private documents (migration `20261020120000_private_documents`; tested locally and applied to shared development Supabase on 2026-10-20): `documents` (one immutable file per row in the private `zayto-documents` bucket, linked to an instruction for agreements or a property for compliance evidence; detected type, size, SHA-256, uploader; status pending, stored, failed or removed, moving one way). The object key is built in code from the workspace, document id and type. Staff-only RLS follows the linked record's branch scope; the app role cannot delete rows. Design: `.cursor/plans/c0-design-private-documents.md`.

C2 landlord agreements (migration `20261020180000_instruction_agreements`; tested locally and applied to shared development Supabase on 2026-10-20): `instruction_agreements` (one uploaded agreement PDF per row, linked to its instruction and document; the database records the terms version, a fingerprint of the material terms — service, fees, extra charges and current landlords — and the landlords who must sign; draft, then completed with a signed date or discarded with a reason, never changed afterwards; a later completed agreement links to the one it supersedes). Ready to market needs a completed agreement matching the current material terms; agreement exceptions and hand-recorded Signed milestones no longer count or can be added. Design: `.cursor/plans/c2-design-landlord-agreements.md`.

C3 manual property compliance (migration `20261021100000_property_compliance`; tested locally, independently security-reviewed and applied to shared development Supabase on 2026-10-21): `compliance_requirements` (the five initial England areas, versioned system definitions, read-only to the app), `property_compliance_items` (one per property and area, created on first record), and three append-only histories: `property_compliance_assessments` (Applies, Does not apply or Needs specialist review, with a reason where required), `property_compliance_evidence` (staff-entered reference, provider, event and expiry dates, EPC rating, notes, and a linked stored file except for smoke and CO alarms) and `property_compliance_status_events` (Awaiting evidence, Reviewed or Action required, naming the evidence relied on). Current values are the newest rows; Not assessed, Not requested, Expired and Superseded are derived, never stored. A file that a status has relied on can never be removed. The app can only read and add. Design: `.cursor/plans/c3-design-property-compliance.md`.

## Boundary and identifier rules

`Workspace` is the hard tenant boundary (ADR-020). Every workspace-owned row includes `workspaceId`, including module records whose parent already has it. Application code scopes every query and mutation by the verified workspace context; PostgreSQL RLS enforces the same boundary as defence in depth.

Proposed IDs are UUIDs. Where practical, relationships use composite workspace-aware foreign keys such as `(workspaceId, propertyId)` so the database rejects cross-workspace links. Index `workspaceId`, foreign keys, and genuine search columns.

## Import-ready modelling principles

Future CRM entities must support customer migration without shaping the model around one legacy supplier:

- Preserve meaningful external record identifiers with their workspace, source, entity type, and import context so related people, properties, tenancies, records, and documents can be reconnected safely. External identifiers do not replace Zayto IDs or prove access.
- Represent current, ended, inactive, and archived states, with effective dates or relationship history where the domain requires them. Landlord/property, tenant/tenancy, party/case, and document/record associations must remain accurate historically rather than being overwritten by the latest state.
- Keep source provenance and original source timestamps distinct from import timestamps, later corrections, and Zayto audit events.
- Keep canonical validation strict. Incomplete or inconsistent legacy values are handled through a future staging, mapping, validation, and exception process rather than making normal Zayto records ambiguous or broadly nullable.
- Give imported notes, documents, source-specific fields, and relevant history a classified mapped destination or a clearly labelled retained-source representation. Exact extension/custom-field structures remain unresolved and must not leak one vendor's schema into core entities.

Exact import-support tables and fields are deferred until the first relevant CRM entities are designed. See ADR-028 and `.cursor/plans/customer-data-migration-and-onboarding.md`.

## Global identity and personal account

```text
UserIdentity 1──* AuthenticationProviderLink
UserIdentity 0..1── PersonalProfile
UserIdentity 1──* Membership
UserIdentity 1──* Participation
```

`UserIdentity` represents one human login and initially references Supabase Auth. It holds no global customer role. Nullable first-name, last-name, and primary-email fields support the internal user directory; Supabase remains the authentication authority. Human records use the same first-name/last-name baseline under ADR-029, without assuming either field contains only one word. Organisations retain separate organisation/trading/legal names.

`PersonalProfile` is a small, user-controlled set of reusable details. It is not a globally shared CRM contact record. Sharing into an application, tenancy, or check is explicit and produces an auditable workspace/case record or snapshot.

## Workspaces, ownership, and business access

```text
Workspace 0..1── Organisation owner
Workspace 0..1── Person owner
Workspace 1──* Branch
Workspace 1──* Membership *──1 UserIdentity
Membership 1──* MembershipRole
Membership *──* Branch (via MembershipBranchAccess)
```

Implemented workspace types are `agency`, `landlord`, and `platform_internal`. The CRM contact foundation now represents people and organisations, but the proposed workspace-owner linkage, landlord roles, and property ownership relationships are not implemented yet.

The implemented workspace and branch records also hold the small set of customer administration details shown to Platform Owners: trading/legal name, company number, contact details, registered address, branch contact/address, and active status. These are account metadata rather than CRM people, property, or tenancy records.

`Membership` is for people who operate a business workspace. Platform administration is separate and grants no standing customer-data access.

## Workspace people and relationships

```text
Workspace 1──* WorkspacePerson
WorkspacePerson 0..1── IdentityPersonLink ──1 UserIdentity
WorkspacePerson 1──* PersonRelationship
Workspace 1──* Property
Property *──* WorkspacePerson (via PropertyParty)
```

Each workspace keeps its own operational person record and history. An identity link allows the person to use Zayto without exposing their record or other relationships to another workspace. A person may be a landlord, applicant, tenant, guarantor, contractor, or staff member in different contexts; those capacities are relationships and participations, not global identity roles.

Human `WorkspacePerson` records use structured title, first name, middle names, and surname for the confirmed landlord/contact workflow. First name and surname are initially required; the other fields are optional. The dormant preferred-name field is not collected in this slice. Former/legal-name history and mononyms remain deferred until a real workflow specifies them. Imports with only a full-name value must be mapped or reviewed rather than split on spaces automatically.

The confirmed Phase 1 product requirements and proposed relationships for people, organisations, contact points, properties, historical ownership, landlord opportunities, appraisals, instructions, versioned terms, tasks, and activity are recorded in `.cursor/plans/landlord-property-onboarding.md`. Those boundaries remain a planning proposal until the owner approves the Chunk 1 data-design gate; they must not be treated as implemented tables.

## Participation and external access

Applicants, tenants, guarantors, and invited landlords are first-class users but not broad members of an agency workspace.

```text
UserIdentity 1──* Participation
Workspace 1──* Participation
Participation 1──* ResourceGrant
Participation 0..* ConsentRecord
Participation 0..* Invitation / InvitationClaim
```

A participation identifies the workspace, module, case/resource, participant type, status, and effective dates. A grant limits permitted actions, records, and fields. Module-specific records such as `ApplicationParty`, `ReferenceSubject`, `TenancyParty`, and `GuaranteeParty` may link to this common access foundation.

Joint application membership never grants access to another party's confidential information. Data must be classified as participant-private, shared with named participants, workspace-internal, provider-restricted, landlord-shareable, or final shared documentation.

## Commercial access

```text
Product 1──* Feature
Plan 1──* PlanVersion 1──* PlanEntitlementDefinition
Workspace 1──* Subscription / Trial / AddOn
Workspace 1──* WorkspaceEntitlement
Workspace 1──* UsageEvent
Workspace 1──* ServiceOrder
```

Plans are versioned so later catalogue edits do not silently change existing terms. Entitlements can come from a free plan, subscription, trial, add-on, promotion, manual grant, allowance, or one-off order. Usage events are append-only and idempotent; corrections use adjustments. Prices, tiers, allowances, grace periods, and providers remain unresolved.

## Shared operational records

- `Document` — workspace, owner/case, classification, storage key, mime type, creator, retention, and access grants.
- `AuditEvent` — actor, workspace, participation/resource, action, outcome, request ID, and safe metadata.
- `Job` / `OutboxEvent` — durable provider and webhook work.
- `IntegrationAttempt` — workspace, provider, correlation/idempotency keys, status, and safe response metadata.
- `Conversation`, `ConversationParticipant`, `Message`, and `Notification` — proposed; every audience is explicit.

## Independently usable product modules

Core owns only neutral platform concepts. Optional modules own their records and cannot require another optional module.

- CRM: landlord leads, instructions, listings, applicants and reusable requirements, property enquiries, viewings, and offers. **Applicant shape (ADR-036, ADR-037; tables applied 2026-10-22, viewings to come):** `applicants` (one per household, lead contact), `applicant_members`, append-only `applicant_requirement_versions`, `property_enquiries` (only on a Ready to advertise listing, one open per applicant and listing) with append-only stage history, `lettings_outcome_reasons`, optional applicant and enquiry links on `actions`, and later `viewings` with status history. A property enquiry links an applicant to one listing; it is not the applicant, viewing, offer, or application itself.
- Pre-tenancy: applications, applicant parties, tasks, agreements, move-in. **Planned tenancy shape (ADR-035, accepted):** a tenancy is its own record linked to one property, the instruction it runs under and the listing it came from, with a start date, an ended date and a move-out reason; at most one current per property. A move-out ends the tenancy, not the instruction, and a property's letting status is derived, not stored.
- Referencing: native reference cases, subjects, evidence, reviews, provider requests, and outcomes.
- AML / identity / Right to Rent: native cases and workflows with external specialist adapters where approved.
- Property management: work orders, inspections, renewals, compliance records.
- Accounting: later ledger, charges, receipts, allocations, and reconciliation behind a strong boundary.
- Sales: later, reusing neutral property and people concepts without importing lettings internals.

Referencing and AML workflows are owned by Zayto. External results do not authorise invented legal, compliance, or underwriting rules.

## Applicant-to-tenant continuity

An application is not overwritten when it succeeds. The same identity gains a linked tenancy participation, while the historical application and submitted snapshots remain intact. Reusable profile fields can be confirmed; sensitive evidence or provider reports are not silently copied or shared.

## Referential integrity and deletion

Use foreign keys and workspace-scoped unique constraints. Cascade only true owned children. People, properties, applications, tenancies, financial entries, audit records, and regulated evidence require explicit retention and deletion rules. Exact legal retention remains unresolved.

## Deliberately unresolved

- Exact product plans, prices, trials, and free allowances
- Customer-defined roles
- Franchise and parent/child workspace structures
- Personal-profile fields and cross-case evidence reuse
- Data-controller/processor responsibilities by data category
- Detailed accounting ledger design
- Detailed referencing, AML, Right to Rent, insurance, and deposit rules
- Sales entities and workflows
- Import staging, source-reference, custom-field, duplicate-resolution, and rollback details
