# Permissions and access

Supabase login, server-verified sessions, the workspace and membership access foundation, fixed staff roles, feature-flagged TOTP MFA enforcement, and the separate Platform Owner shell are implemented. Platform Owners can browse limited account-administration metadata and manage audited user names, customer details, and customer feature-flag overrides; this does not grant access to customer CRM contacts. Authorised customer staff can now create, read, update, search, archive/reactivate, and check duplicate contact candidates according to their role and branch scope. Participations, entitlements, resource/field grants, invitations, and access to other CRM modules are not implemented.

## Three-layer access model (confirmed)

Every protected server operation answers three separate questions:

1. **Entitlement** — may this workspace use the module, feature, allowance, or pay-per-use service?
2. **Permission** — may this identity perform this action through the current membership or participation?
3. **Resource and field access** — may they act on this particular record and see these fields?

Menus may reflect these answers, but the server enforces them. Never trust a client-supplied `workspaceId`, role, entitlement, branch, resource ID, or price.

## Workspace isolation (confirmed)

`Workspace` is the hard tenant boundary. Application code derives it from verified access and scopes every query and mutation. PostgreSQL RLS applies the same boundary from the first workspace-owned tables. Changing a UUID or workspace selector must never cross that boundary.

Branch scope is additional and weaker. Memberships use either whole-workspace access or a non-empty explicit list of named branches. A branch-scoped staff viewer sees workspace-wide staff plus staff sharing at least one of their branches; staff assigned exclusively to other branches are hidden. Resource exceptions are deferred.

Users with `membership.read` may see the first name, last name, and sign-in email of memberships visible under those workspace and branch rules. The database enforces the same boundary; authentication-provider links and identities from unrelated workspaces remain hidden.

## Business memberships (confirmed model)

Memberships are for people operating a workspace. The first fixed role set is implemented:

| Role               | Intent                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `workspace_owner`  | **Account Owner** in the UI; customer account, access, and commercial control                |
| `agency_admin`     | Agency users, branches, permissions, and all agency records                                  |
| `branch_manager`   | Views staff and operates within approved branches; cannot administer roles                   |
| `negotiator`       | Landlord leads, listings, applicants, property enquiries, viewings, offers, and applications |
| `property_manager` | Tenancies, inspections, maintenance, and compliance                                          |
| `accounts`         | Financial records when accounting exists                                                     |
| `read_only`        | Reporting or training within its granted scope                                               |

A membership may hold several roles. `read_only` is exclusive and cannot be combined with another role. Only an existing Account Owner can grant or remove `workspace_owner`; Agency Admins can administer ordinary staff roles. Self-role changes and removal of the final active Account Owner are denied. Colleague identity details (name and work email) are visible in the database to Account Owners, Agency Admins, Branch Managers, Negotiators, Property Managers and Read Only, limited to colleagues who share a branch or have workspace-wide access; Negotiators and Property Managers were added on 2026-10-16 so lead workers can hand over landlord-lead work. Accounts sees only its own identity. Staff-listing screens remain gated by `membership.read`. Role changes are serialised per workspace and database triggers protect the last active owner after the hardening migration is applied. The current permissions cover the access foundation only; each later product module must add its own narrow permissions.

`platform_owner` is a Zayto staff role stored separately from customer memberships. It grants the internal platform shell, not standing access to customer records. Future support access must be strongly authenticated, justified, time-limited, workspace-specific, and audited.

## Local sandbox identities

These fictional addresses work only when `APP_ENV` is `local` or `demo` (ADR-032). When `SANDBOX_QUICK_SIGN_IN` is enabled, `/login` shows a labelled persona selector and creates a normal Supabase session without a password. Setting the flag to `false` restores the Mailpit magic-link form. Quick sign-in is always off when `APP_ENV` is `production`. The authenticator step appears when `staff_mfa` is enabled for the effective audience; there are no shared passwords or bypass codes.

## Feature flags

Feature flags control whether a capability is available; they do not grant membership, permissions, entitlements, or record access. Platform Owners manage global and verified Zayto-user audiences at `/platform/feature-flags`, and workspace overrides from each customer profile. Customer overrides use inherit/on/off and show the effective result. Effective precedence for staff is: enabled Zayto testing audience, explicit workspace override, then global default. An ordinary unavailable feature fails off; an unavailable security control such as staff MFA fails on. All changes are server-authorised and audited.

| Email                        | Expected result                                     |
| ---------------------------- | --------------------------------------------------- |
| `owner@zayto.local`          | Oakfield Lettings (Demo) as Account Owner           |
| `branch.manager@zayto.local` | Oakfield Main Branch as Branch Manager              |
| `platform.owner@zayto.local` | Zayto Platform Owner shell only                     |
| `dual.owner@zayto.local`     | Context chooser for platform and Oakfield workspace |
| `no.access@zayto.local`      | Signed in safely, with no platform/workspace access |

## Participants (confirmed model)

Applicants, tenants, guarantors, and invited landlords use resource-specific participations and grants rather than broad agency membership.

- Applicant: their property enquiries, viewings, applications, own submissions, requested checks, signing, and move-in tasks.
- Tenant: relevant current/historical tenancies, permitted documents and balances, their maintenance, communications, renewals, notices, and move-out tasks.
- Guarantor: only their requested checks, submissions, obligations, and relevant documents.
- Invited landlord: only properties, statements, documents, maintenance, or actions the managing workspace explicitly shares.

One identity may have many memberships and participations across workspaces. The personal portal aggregates only those authorised items and never reveals one relationship to another workspace.

## Privacy inside shared cases (confirmed)

Joint applicants and guarantors do not automatically see one another's income, employment, banking, identity evidence, provider reports, detailed outcomes, or internal notes. Shared progress and documents require an explicit classification or grant. Landlords receive only approved information or outcomes, not raw evidence by default.

## Commercial access (confirmed model)

External participants do not consume staff seats. Plans may limit operator seats, branches, properties, tenancies, active cases, storage, included transactions, or other usage. A workspace entitlement never gives every member permission, and a user permission never bypasses an absent entitlement.

## Invitations and claims (confirmed requirements)

Invitations are purpose-bound, single-use, expiring, revocable, and auditable. Tokens are stored safely. An existing identity claims the participation without creating another account; a new user creates one identity. Accounts are never merged from a name or similar email alone.

## Security and audit requirements

- Default deny at entitlement, permission, resource, and field levels.
- Required staff and Account Owner MFA at release. Development enforcement is controlled by `staff_mfa`; the server-only release safeguard can force it on but never off.
- Log authentication, permission changes, invitations, failed access, exports, sensitive document views, and money events without logging the sensitive content.
- Test cross-workspace, cross-branch, cross-role, and cross-participant denial for every data path.
- Revoke active access when a relationship ends while preserving any continuing right to retain specific documents.

## Unresolved product and legal decisions

- Customer-defined roles and future module-specific permission matrices
- Applicant/tenant MFA and step-up authentication rules
- What reference and AML progress or results each party may see
- What landlords may receive from checks
- Rights after applications or tenancies end
- Representatives, attorneys, carers, minors, and delegated access
- Identity recovery, duplicate accounts, and controlled merging
- Data retention, erasure, portability, and controller/processor responsibilities
