# Product workflows (high level)

These are lifecycle shapes, not screen specifications or legal advice. Detailed referencing, AML, Right to Rent, insurance, deposit, accounting, notice, and retention rules remain unresolved.

## Business workspace setup

An agency or independent landlord receives a workspace. Owners invite operators through memberships and roles. Agencies may add branches and branch scope. Workspace module access comes from entitlements, not roles.

Agency onboarding is controlled for the proof of concept. Whether independent landlords may self-register for a free or paid workspace is unresolved.

## CRM intake and terminology

An incoming enquiry is an event that must be routed into the correct workflow; it is not one universal record type.

```text
Incoming contact
  ├─ landlord wants agency help
  │    → Landlord lead → Appraisal → Instruction
  │
  └─ renter wants a home
       → Applicant + Requirements
           → Property enquiry → Viewing → Offer → Application → Tenancy
```

The current proof of concept implements the landlord-lead side only. Applicant/property-enquiry work remains a separate future workflow. The planned staff work area is a **Pipeline** with distinct views rather than a single table mixing both kinds of work.

## Landlord-lead journey

1. Capture the landlord, contact method, property/postcode, source, branch, owner, and next action without forcing complete permanent records too early.
2. Qualify the opportunity and either continue follow-up, book an appraisal, postpone it, or record it lost.
3. When an appraisal is booked, review duplicates and create or link the durable landlord and property records.
4. Record the appraisal recommendation and follow-up until the lead is won, lost, or postponed.
5. A won lead starts a separately reviewed instruction; it does not silently become one.

## Applicant journey

1. Be identified as an existing or new applicant, with reusable non-sensitive requirements when appropriate.
2. Make a general search enquiry or a property enquiry linked to a particular listing.
3. Request or book a viewing where supported, then preserve attendance, feedback, and follow-up separately.
4. Make an offer; an accepted offer remains distinct from the application it may start.
5. Claim an expiring, purpose-bound application invitation with an existing or new Zayto identity.
6. Confirm reusable personal details and submit case-specific information.
7. Complete their own referencing, identity, and Right to Rent tasks when those modules and rules exist.
8. Upload private evidence and see permitted progress, messages, and notifications.
9. Review and sign relevant tenancy documents, then complete move-in tasks.

Joint applicants may see explicitly shared household/application information, never one another's confidential financial, identity, or referencing data by default.

## Applicant-to-tenant continuity

A successful application remains as history. The same identity receives a linked tenancy participation without creating another account. The user confirms reusable details rather than re-entering everything; sensitive evidence and external reports are not silently copied or disclosed.

## Tenant journey

1. View current and historical tenancies and permitted documents.
2. View rent balances, payment history, and payment options where supported.
3. Report maintenance and track permitted progress.
4. Communicate with the agent or landlord.
5. Handle renewals, agreed changes, and notices when specified.
6. Complete move-out tasks and view relevant deposit information.

Ending a tenancy ends active operational access but may leave continuing access to documents the tenant is entitled to retain. Exact retention and access rules require approval.

**When a tenant moves out (proposed, ADR-035):** the tenancy ends with a move-out reason, but the landlord's instruction carries on. The property returns to Ready to market (a void period), a new listing is prepared under the same instruction (optionally starting from the previous listing's text), and the old listing and tenancy stay as history. If the landlord ends the instruction instead, a later return starts with a new landlord lead linked to the earlier instruction; an ended instruction is never reopened. Full design: `.cursor/plans/property-lifecycle-design.md`.

## Guarantor journey

A guarantor claims a participation tied to their own request, submits their own financial/evidence information, tracks their tasks, and views or signs documents relevant to their obligation. They do not automatically see applicant evidence, other guarantors, or general tenancy-management information.

## Landlord journeys

An independent landlord operates their own landlord workspace, manages entitled properties and users, and may buy standalone services without agency CRM.

An invited landlord uses the same identity but receives narrow participation and grants inside the managing agency's workspace. Information is not automatically synchronised between their own workspace and the agency relationship.

## Lettings lifecycle

```text
Landlord lead → Appraisal → Instruction → Property onboarding → Listing
        → Applicant + Property enquiry → Viewing → Offer
        → Application + participant-private submissions
        → Referencing / identity / Right to Rent cases
        → Agreement + Tenancy participations
        → Occupancy (rent, works, inspections)
        → Check-out / deposit / end
```

Each optional stage requires its workspace entitlement. Standalone pre-tenancy or referencing can begin with the minimum context it needs and must not require CRM records.

## Native referencing and AML

Zayto owns the case, consent, tasks, evidence, progress, audit, review, result presentation, and commercial order. Approved specialists provide data or verification behind adapters. Provider status is not automatically a Zayto legal or underwriting decision.

## Personal portal

One personal portal may aggregate the signed-in user's applications, tenancies, guarantees, and invited-landlord relationships across workspaces. Each item identifies the responsible organisation/landlord, and each access decision is evaluated independently. Email matching alone never grants or discovers access.

## Operational rules we will not guess

- Who must complete which checks
- What check detail applicants, landlords, guarantors, or staff may see
- Insurance eligibility or underwriting
- Right to Rent decision rules
- AML decisions and escalation rules
- Deposit schemes, prescribed information, and statutory timelines
- Notices, eviction, retention, and cross-border UK variations
- The legal effect of portal messages
