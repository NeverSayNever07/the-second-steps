# User roles and workspace access foundation

**Status:** Confirmed access-foundation slice with hardening implemented and verified. The fixed role matrix, role-aware routes, staged TOTP mechanism, five sandbox personas, branch visibility, last-owner concurrency, least-privilege database roles, and disposable integration tests are implemented. The shared role cutover and access-hardening migrations were applied and verified on 2026-10-13; the Platform Owner branch-visibility policy was applied and verified on 2026-10-14. Invitations, customer-defined roles, product-module permissions, MFA recovery, and production delivery remain deferred.

**Outcome:** Replace the authenticated-but-unrestricted dashboard sandbox with a secure business-workspace foundation. A signed-in staff user will only enter a workspace through an active membership, at the required MFA level, and every protected server operation will enforce the user's permission and workspace/branch scope. Workspace owners and authorised administrators will be able to view staff and manage permitted role assignments. No CRM, applicant, tenancy, landlord, accounting, or other customer records are introduced by this plan.

**Cursor build rule:** Work through the phases in order. Stop at every owner approval gate. Do not implement a later phase while an earlier security test is failing. Keep `app/login/` and the protected dashboard shell working throughout.

## 1. Scope and boundaries

### Included

- Global Zayto identity linked to the existing Supabase Auth identity.
- Agency and independent-landlord workspaces, plus a reserved internal workspace type.
- Business-operator memberships with active, suspended, and ended states.
- The initial fixed role names already recorded in `docs/PERMISSIONS.md`:
  - `workspace_owner`
  - `agency_admin`
  - `branch_manager`
  - `negotiator`
  - `property_manager`
  - `accounts`
  - `read_only`
- Multiple roles on one membership, subject to safe combination rules.
- Explicit whole-workspace or named-branch scope.
- Code-defined permissions and a default-deny authorisation service.
- Explicit active workspace selection verified from the current session.
- Required MFA assurance for staff/workspace-owner access.
- A separate Zayto platform shell protected by the internal `platform_owner` role.
- Named fictional sandbox identities for Account Owner and Platform Owner routing tests.
- Audit events for access and role-administration actions.
- PostgreSQL Row Level Security (RLS) as defence in depth.
- Responsive, light/dark/system-compatible workspace and user-role screens.
- Unit, database integration, and browser tests for the implemented slice.

### Excluded and deferred

- Applicants, tenants, guarantors, and invited landlords. They use `Participation` and `ResourceGrant`, not staff roles, and belong to Phase 2.
- Customer-defined/custom roles. The data model lists these as unresolved; use fixed system roles for the first slice.
- Platform support access or impersonation. Only the confirmed `platform_owner` is included initially; future platform operations, support, billing, and auditor roles are deferred.
- Full entitlements, billing, seat charging, plans, and product catalogue. Add an authorisation seam for entitlement checks, but do not invent commercial rules.
- CRM/property/lettings records and their detailed permission rules.
- Production email delivery, SMS MFA, or any paid service.
- Referencing, AML, KYC, Right to Rent, insurance, deposit, accounting, retention, or legal business rules.
- Public agency registration. Agency onboarding remains controlled and invite-only.

## 2. Decisions required before schema or implementation

Cursor must present these decisions to the owner in plain English and wait for approval. Once approved, update `docs/PERMISSIONS.md`, `docs/DATA-MODEL.md`, and `docs/adr/README.md` before implementing the affected behaviour.

### Gate A — approve the first role matrix

Recommended first-slice matrix:

| Capability                                 | Workspace owner     | Agency admin        | Branch manager        | Negotiator  | Property manager | Accounts    | Read only              |
| ------------------------------------------ | ------------------- | ------------------- | --------------------- | ----------- | ---------------- | ----------- | ---------------------- |
| Enter workspace and view its basic details | Yes                 | Yes                 | Yes, scoped           | Yes, scoped | Yes, scoped      | Yes, scoped | Yes, scoped            |
| View staff and role assignments            | Yes                 | Yes                 | Own branch only       | No          | No               | No          | Read-only within scope |
| Invite ordinary staff                      | Yes                 | Yes                 | **Decision required** | No          | No               | No          | No                     |
| Change ordinary staff roles/scope          | Yes                 | Yes                 | **Decision required** | No          | No               | No          | No                     |
| Grant/remove `workspace_owner`             | Existing owner only | No                  | No                    | No          | No               | No          | No                     |
| Change workspace settings                  | Yes                 | Yes, non-commercial | No                    | No          | No               | No          | No                     |
| Manage commercial settings                 | Yes                 | No                  | No                    | No          | No               | No          | No                     |
| View security audit                        | Yes                 | Yes                 | No                    | No          | No               | No          | No                     |

This plan deliberately does not define access to future CRM, property-management, or accounting records. Add those permissions with the product slice that owns the records. The `accounts` role is reserved now but does not unlock data before an accounting design is approved.

The user-facing label for `workspace_owner` is **Account Owner**. This means the person responsible for the customer's Zayto account; it does not mean Zayto Platform Owner, legal owner of the agency, or owner/landlord of every property.

### Gate B — decide branch-manager administration

Recommendation: a branch manager may view staff assigned to their branches but cannot invite staff or change roles in the first slice. This avoids accidental privilege escalation while invitation and branch delegation rules are still unresolved.

### Gate C — decide `read_only` combination behaviour

Recommendation: make `read_only` exclusive in the first slice. It cannot be combined with a role that grants writes. This is easier to understand and safer than treating it as an override whose precedence could be misread.

### Gate D — confirm the active workspace URL shape

Recommendation: use an explicit route such as `/dashboard/w/[workspaceSlug]`, with `/dashboard` acting as a safe resolver/workspace picker. The slug selects a candidate only; the server must still prove active membership on every request. Do not trust a cookie or URL value as authorisation.

### Gate E — approve database work

The project rules require owner approval before adding tables or running a migration against the shared database. Present the final proposed tables and RLS approach before changing `prisma/schema.prisma`. Never use `prisma db push` on the shared database.

### Gate F — confirm MFA factor for the proof of concept

Recommendation: use Supabase Auth authenticator-app TOTP first. It is supported by the installed provider and avoids selecting or paying for an SMS provider. A staff session must reach `aal2` before workspace data or role administration is available. Recovery policy and production support process remain a separate approval item.

### Confirmed internal role — Platform Owner

`platform_owner` is a Zayto staff role, stored separately from customer workspace memberships. It may enter the internal platform shell and manage platform-level configuration, internal staff access, customer workspace lifecycle, and other explicitly implemented platform operations. It does not create standing permission to browse customer records. Any future customer-data support access needs a named workspace, reason, time limit, strong authentication, and audit trail under a separately approved design.

## 3. Authorisation vocabulary

Define named permissions once in `core/access/domain/permission.ts`. Use narrow action names rather than checking role strings throughout pages and actions.

Initial permissions proposed for this slice:

```text
workspace.read
workspace.update
workspace.commercial.manage
membership.read
membership.invite
membership.roles.manage
membership.suspend
branch.read
branch.manage
audit.read
```

Rules:

- Roles are bundles of permissions; application code asks for a permission, never `role === "agency_admin"`.
- More than one assigned role produces the union of allowed permissions after validating incompatible combinations.
- Permissions never bypass workspace or branch scope.
- Permission checks default to deny for unknown roles, permissions, membership states, or workspace types.
- An entitlement check remains a distinct step even though this slice uses only a temporary core-platform entitlement adapter.
- UI visibility may mirror permissions but cannot replace server-side checks.
- `workspace_owner` is not equivalent to legal ownership and must not be inferred from Supabase metadata.
- `platform_owner` is not a workspace role, is never assigned through `MembershipRole`, and does not imply membership of any customer workspace.

## 4. Proposed data model

Keep the first migration small. Use UUID primary keys, UTC timestamps, explicit statuses, foreign keys, unique constraints, and indexes. Every tenant-owned row includes `workspaceId`, even where its parent already has one.

### Global identity tables

`UserIdentity`

- Internal Zayto identity ID.
- Lifecycle timestamps and status only; do not duplicate authentication secrets.

`AuthenticationProviderLink`

- `userIdentityId`.
- Provider (`supabase` initially).
- Provider subject: the verified Supabase Auth user ID.
- Unique `(provider, providerSubject)` constraint.
- No customer role in Supabase user/app metadata.

`PlatformRoleAssignment`

- `userIdentityId`, fixed internal role code (`platform_owner` initially), status, assigning actor, and timestamps.
- Stored outside customer workspace membership tables and never grants a customer `workspaceId`.
- Changes are restricted to an existing Platform Owner, require MFA, and are audited.
- Protect the final active Platform Owner from removal or suspension.

### Workspace and branch tables

`Workspace`

- `id`, unique immutable slug, display name, type (`agency`, `landlord`, `platform_internal`), status, timestamps.
- No public self-registration in this slice.
- Do not infer that a `platform_internal` member has customer access.

`Branch`

- `id`, `workspaceId`, name, status, timestamps.
- Workspace-aware unique and foreign-key constraints.
- Create at least one branch for an agency workspace only if approved as required; do not invent branch details.

### Membership and role tables

`Membership`

- `id`, `workspaceId`, `userIdentityId`.
- Status (`active`, `suspended`, `ended`; invitation lifecycle may add `invited` after the invitation design is approved).
- Explicit scope mode (`workspace` or `named_branches`). Never use “no branch rows means all access”.
- Start/end timestamps and audit timestamps.
- Unique current membership per `(workspaceId, userIdentityId)` unless a documented rejoin/history design requires otherwise.

`MembershipRole`

- `workspaceId`, `membershipId`, fixed role code, timestamps, assigning actor.
- Unique `(membershipId, roleCode)`.
- Workspace-aware foreign key back to membership.
- Enforce approved incompatibilities in application/domain code and, where practical, database constraints.

`MembershipBranchAccess`

- `workspaceId`, `membershipId`, `branchId`, timestamps, assigning actor.
- Workspace-aware foreign keys prevent cross-workspace grants.
- Used only when membership scope mode is `named_branches`.

### Audit table

`AuditEvent`

- `id`, `workspaceId`, actor identity/membership when present, action, outcome, target type/ID, request ID, timestamp, and safe structured metadata.
- Record membership creation, role/scope changes, suspension/reactivation, denied administration attempts, workspace selection failures, and MFA-gate outcomes.
- Do not log access tokens, magic links, TOTP secrets, full evidence, or personal/financial content.

### Invitation tables

Do not add operator invitation tables until the owner approves the invitation flow and delivery method. When added, invitations must be purpose-bound, single-use, expiring, revocable, token-hashed at rest, and audited. The current local Mailpit allow-list may support development only; it is not production delivery.

## 5. Target code structure

Follow the modular-monolith layers already defined by the project:

```text
core/identity/
  domain/
  application/
  data/
core/workspace/
  domain/
  application/
  data/
core/access/
  domain/
  application/
  data/
core/audit/
  application/
  data/
app/dashboard/
  page.tsx                         # membership-aware resolver or picker
  w/[workspaceSlug]/
    layout.tsx                     # verified workspace + MFA boundary
    page.tsx
    settings/users/
      page.tsx
      actions.ts
      loading.tsx
      error.tsx
app/platform/
  layout.tsx                       # verified Platform Owner + MFA boundary
  page.tsx                         # distinct internal platform shell
```

Exact files may be adjusted to match code discovered during implementation. Preserve this direction: presentation depends on application; application coordinates domain rules and repository interfaces; data adapters implement those interfaces. Domain code never imports Prisma. Pages and Client Components must not import Prisma.

## 6. Implementation phases

### Phase 0 — re-check the baseline

- Read `AGENTS.md`, all applicable `.cursor/rules/`, ADR-019 to ADR-023, and the exact-version Next.js guides under `node_modules/next/dist/docs/` before editing.
- Run `git status --short`; preserve all existing changes.
- Run `npm run check`, `npm run test:e2e`, and `npm run build` to establish the baseline. Report any existing failure before changing files.
- Confirm the installed Prisma 7.10 RLS/migration capabilities from the installed package documentation. Do not copy Prisma 8 examples without verifying compatibility.
- Document whether a disposable PostgreSQL test database is available. Never run isolation tests against shared or production data.

**Exit:** cleanly understood baseline, test database strategy, and owner approval for Gates A–F.

### Phase 1 — add pure domain definitions

- Add branded IDs/statuses for identity, workspace, branch, and membership.
- Add fixed `SystemRole` and `Permission` unions.
- Add the approved role-to-permission map in one server-safe domain module.
- Add functions to combine roles, reject incompatible assignments, and answer permission checks with default deny.
- Add scope logic for whole-workspace and named-branch access.
- Keep future module permissions out until the relevant product slice defines them.
- Unit test every system role, unknown/empty roles, multi-role union, inactive membership, incompatible `read_only`, and branch scope.

**Exit:** permission and scope decisions are deterministic and fully unit-tested without a database or UI.

### Phase 2 — add the approved schema and migration

- After Gate E approval, add only the tables listed in section 4.
- Add workspace-aware composite unique constraints/foreign keys wherever Prisma 7.10 can express them reliably.
- Index workspace IDs, identity links, membership lookup fields, status, role assignments, and branch grants.
- Generate a named Prisma migration; review its SQL before applying it anywhere.
- Add manual SQL to the migration only where Prisma cannot express RLS/policies or necessary constraints. Explain every manual statement.
- Do not seed fictional businesses or users without owner approval. If development fixtures are approved, make them clearly fictional and idempotent.

**Exit:** generated client succeeds, migration SQL has been reviewed, and no shared database migration has run without explicit approval.

### Phase 3 — build request-scoped database isolation

- Create one server-only database boundary that receives the verified Supabase subject, active workspace candidate, and request ID.
- Resolve the provider link and active membership on the server; never accept identity, role, or membership claims from a form or URL.
- Run workspace-owned data operations in a request-scoped transaction/context that sets the database identity/workspace values using parameterised statements.
- Enable and force RLS for workspace-owned tables using policies that default deny when context is absent or invalid.
- Ensure the application database role does not have `BYPASSRLS`.
- Do not use the Supabase service-role key or browser Data API for CRM access.
- Keep explicit `workspaceId` predicates in repositories even with RLS.
- Add integration tests proving:
  - no database context returns no tenant rows/fails safely;
  - workspace A cannot read or modify workspace B;
  - a forged workspace slug/ID does not establish access;
  - cross-workspace role and branch links fail;
  - direct repository calls cannot accidentally omit scope;
  - suspended/ended memberships cannot enter the workspace.

**Exit:** application scoping and RLS independently block cross-workspace access.

### Phase 4 — resolve identity and active workspace

- Extend the current `requireUser()` flow with a separate application service that maps the verified Supabase subject to `UserIdentity`.
- Do not create identities or memberships merely because an arbitrary authenticated email appears. Provisioning must come from the controlled onboarding/invitation path.
- Change `/dashboard` into a safe resolver:
  - no active memberships → explain that access has not been granted and offer sign-out;
  - one active membership → redirect to its explicit workspace route;
  - several active memberships → show an accessible workspace picker;
  - suspended/ended memberships → never show as selectable.
- Add `requireWorkspaceContext(workspaceSlug)` returning only a verified server-side context (identity, membership, workspace, roles, permissions, scope, MFA state).
- Avoid putting the whole context in a client-readable cookie. A display-only recent-workspace hint may be considered later, but it cannot authorise access.
- Ensure `/dashboard` and current login redirects do not loop.

Add a post-login destination resolver that evaluates platform access and customer workspace memberships independently:

- Platform Owner only → `/platform`.
- One active customer workspace only → its verified workspace dashboard.
- Several customer workspaces → workspace picker.
- Both platform and customer access → explicit context chooser; never guess based on whichever record is returned first.
- Neither → access-not-granted screen with sign-out.

Direct navigation must remain protected: an Account Owner is denied from `/platform`, and a Platform Owner with no customer membership is denied from customer workspace routes.

**Exit:** every workspace dashboard route starts from a verified identity and active membership.

### Phase 4A — build the Platform Owner boundary and shell

- Add a server-only `requirePlatformPermission()` path that is separate from workspace authorisation.
- Require an active `platform_owner` assignment and `aal2` for `/platform` and every platform mutation.
- Create a visually distinct but brand-consistent responsive platform shell so the user can always tell they are administering Zayto rather than a customer workspace.
- Start with a safe overview showing only platform-operational metadata needed by the implemented slice. Do not expose customer CRM records or provide impersonation.
- Provide an explicit context switch back to the chooser for a person who separately holds customer memberships.
- Audit successful and denied platform entry and every platform-role change.

**Exit:** Platform Owner access is independent of customer membership, clearly identified, MFA protected, and does not create customer-data access.

### Phase 5 — enforce staff MFA

- Add authenticator-app TOTP enrollment and challenge screens using the installed Supabase Auth client, following current official Supabase guidance.
- Check the server-side Authenticator Assurance Level for every workspace entry and protected mutation.
- Redirect `aal1` staff to enrollment/challenge as appropriate; do not render workspace content first.
- Require `aal2` for viewing workspace data and for all role/membership administration.
- Treat missing/error/stale assurance information as denied and show a safe recovery message.
- Do not add SMS until the owner approves a provider, cost, and data-location implications.
- Add tests for no factor, enrolled-but-not-challenged, valid `aal2`, stale session, and sign-out.

**Exit:** an authenticated magic-link session alone cannot access a business workspace.

### Phase 6 — create central authorisation services

- Implement server-only application helpers such as:
  - `requireWorkspacePermission(context, permission)`;
  - `requireBranchAccess(context, branchId)`;
  - `canManageMembership(actorContext, targetMembership, proposedChange)`;
  - entitlement adapter that keeps the entitlement decision separate and defaults to core-only access.
- Make membership administration resistant to privilege escalation:
  - an actor cannot grant a role they are forbidden to grant;
  - only an existing owner can add/remove another owner;
  - never allow removal/suspension of the last active owner;
  - users cannot increase their own privilege unless explicitly approved;
  - branch-scoped actors cannot target another branch;
  - inactive targets cannot silently regain access through a role edit.
- Return safe typed errors; do not leak whether another workspace, user, or membership exists.
- Write an audit event for successful and denied sensitive actions.

**Exit:** all role and membership rules live in application/domain services, not React components or raw actions.

### Phase 7 — build the workspace shell and selector

- Move the existing dashboard content under the verified workspace route while preserving the sandbox warning until real CRM controls exist.
- Display the current workspace and membership context in desktop and mobile navigation.
- Add a workspace switcher only for verified active memberships.
- Build navigation from explicit definitions with optional permission/entitlement visibility; keep server enforcement independent.
- Support keyboard navigation, meaningful focus, screen readers, small mobile widths, tablet and desktop, and all three theme settings.
- Do not show future modules as usable merely because their role exists.

**Exit:** users can only navigate within verified workspaces and can clearly tell which workspace is active.

### Phase 8 — build staff and role administration

- Add a server-rendered staff list at the proposed settings route.
- Show staff name/email only where policy allows, membership status, assigned roles, and workspace/branch scope.
- Add small Client Components only for interactive forms/dialogs.
- Add Server Actions for the approved operations. Every action must:
  1. verify the current Supabase user;
  2. verify `aal2`;
  3. re-resolve workspace membership from the route context;
  4. require the relevant permission;
  5. validate all input as untrusted;
  6. check target membership and scope belong to the same workspace;
  7. enforce anti-escalation and last-owner invariants;
  8. write the mutation and audit event in one transaction;
  9. revalidate affected routes;
  10. return a safe typed result.
- Start with role/scope changes for already-provisioned fictional sandbox identities if operator invitations are not yet approved.
- Never display a control the actor cannot use, but still test direct action calls are denied.

**Exit:** approved administrators can safely manage the first role slice; other roles cannot bypass it.

### Phase 9 — invitations (separate approval and implementation slice)

- Confirm operator inviter roles, invitation expiry, resend/revoke behaviour, and email delivery before implementation.
- Add an invitation record with a hashed single-use token, purpose, target workspace, proposed roles/scope, expiry, inviter, claim/revocation timestamps, and audit history.
- Validate approved roles/scope again at claim time, not only creation time.
- An existing Supabase identity claims the membership; a new user creates one identity. Never merge accounts based on similar names or emails.
- Production delivery requires a separately approved provider. Local Mailpit remains development-only.

**Exit:** invitation behaviour is approved, auditable, expiring, revocable, and tested; otherwise this phase remains deferred.

### Phase 10 — verification and documentation

- Unit tests: role bundles, multi-role handling, `read_only`, permission denial, scope, and anti-escalation invariants.
- Integration tests against a disposable database: identity resolution, membership lifecycle, transactions, RLS, cross-workspace denial, cross-branch denial, and audit atomicity.
- E2E tests:
  - authenticated user with no membership;
  - one/multiple workspace memberships;
  - workspace switching;
  - AAL1 blocked and AAL2 admitted;
  - owner role edit succeeds;
  - unauthorised role edit fails even when the action is called directly;
  - last owner cannot be removed;
  - forged workspace URL is denied without leaking existence;
  - Account Owner is denied from the platform shell;
  - Platform Owner without customer membership is denied from customer workspace shells;
  - an identity with both kinds of access receives a context chooser and can switch explicitly;
  - responsive staff screen and keyboard operation.
- Run `npm run check`, `npm run test:e2e`, and `npm run build`.
- Update `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/PERMISSIONS.md`, `docs/ROADMAP.md`, and `docs/adr/README.md` so implemented/proposed/unresolved labels reflect reality.
- Update `.env.example` only if new non-secret settings are actually introduced.
- Report separately what is done, tested, and still unverified. Report Git state and never push or deploy without owner approval.

**Exit:** checks pass, denial paths are covered, documentation matches the code, and nothing is described as working without evidence.

## 7. Acceptance criteria

- [ ] An authenticated identity with no active membership cannot enter any business workspace.
- [ ] `platform_owner` is stored and authorised separately from customer memberships.
- [ ] An Account Owner cannot enter the platform shell without a separate active Platform Owner assignment.
- [ ] A Platform Owner cannot enter a customer workspace without a separate active membership.
- [ ] A person with both access types receives an explicit context chooser instead of an assumed destination.
- [ ] A user with memberships in several workspaces chooses an explicit active workspace.
- [ ] A URL, cookie, form field, Supabase metadata value, or object ID alone cannot grant workspace access.
- [ ] Staff access requires an active membership and `aal2`.
- [ ] Every protected action separately evaluates entitlement, permission, and resource/scope access.
- [ ] Every workspace-owned repository operation includes verified `workspaceId` scoping.
- [ ] RLS denies missing and cross-workspace context even if an application filter is accidentally omitted.
- [ ] Branch-scoped membership cannot access or administer another branch.
- [ ] Fixed role bundles are centralised and default deny.
- [ ] `read_only` follows the owner-approved combination rule.
- [ ] Only an existing owner can grant/remove owner; the last active owner is protected.
- [ ] Role/scope/status changes and denied sensitive actions are audited without sensitive data.
- [ ] Participant access is not modelled as staff membership.
- [ ] No future product module becomes available from a role without its separate entitlement and resource checks.
- [ ] All new screens work on mobile, tablet, desktop, light, dark, and system themes.
- [ ] `npm run check`, `npm run test:e2e`, and `npm run build` pass.

## 8. Security review checklist

- [ ] No secrets or `.env.local` changes are committed.
- [ ] No Supabase service-role/secret key reaches client code.
- [ ] Supabase metadata is not the source of customer roles.
- [ ] Every server action re-authenticates and re-authorises.
- [ ] Database test users and fixtures are fictional.
- [ ] Shared/production database migrations required explicit owner approval.
- [ ] The application database role has no `BYPASSRLS`; RLS is forced where appropriate.
- [ ] RLS session context cannot leak between pooled connections.
- [ ] All user-controlled values are validated and parameterised.
- [ ] Error responses do not reveal other workspaces or memberships.
- [ ] Audit logs contain identifiers and outcomes, not tokens or sensitive content.
- [ ] No real customer data is stored before isolation, MFA, backups, recovery, and audit controls are verified.

## 9. Reference material Cursor must use

Project sources of truth:

- `AGENTS.md`
- `.cursor/rules/communication.mdc`
- `.cursor/rules/architecture.mdc`
- `.cursor/rules/database.mdc`
- `.cursor/rules/security.mdc`
- `.cursor/rules/nextjs-react.mdc`
- `.cursor/rules/testing.mdc`
- `docs/PERMISSIONS.md`
- `docs/DATA-MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/adr/README.md` (ADR-019 to ADR-023)
- `docs/ROADMAP.md` (Phase 1)
- exact installed Next.js docs under `node_modules/next/dist/docs/`

Current official external guidance to re-check at implementation time:

- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase Authenticator Assurance Level: https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase with Prisma: https://supabase.com/docs/guides/database/prisma
- Prisma transactions: https://www.prisma.io/docs/orm/prisma-client/queries/transactions

Do not replace the project decisions with a generic Supabase custom-claims RBAC example: Zayto roles are workspace-specific and must remain in Zayto's database, not global JWT metadata.

## 10. Recommended first build slice

After owner approval, implement Phases 0–4 first: domain rules, minimal schema, isolation, and verified workspace selection. Review the result before adding MFA UI and role-management screens. This keeps each change small and makes the security boundary testable before administrative features depend on it.

## 11. Fictional sandbox login personas

These are development/test identities only. The feature-flagged local selector creates a normal Supabase session from a server-generated one-time token; disabling it restores the Mailpit magic-link flow. Quick sign-in is hard-disabled in production. Do not add shared passwords or a production authentication bypass.

| Persona            | Proposed sandbox email       | Access                                                            | Expected destination                                  |
| ------------------ | ---------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Account Owner      | `owner@zayto.local`          | `workspace_owner` membership in one fictional agency workspace    | That workspace's `/dashboard/w/[workspaceSlug]` shell |
| Branch Manager     | `branch.manager@zayto.local` | `branch_manager` membership for Oakfield's Main Branch only       | That workspace's `/dashboard/w/[workspaceSlug]` shell |
| Platform Owner     | `platform.owner@zayto.local` | Active `platform_owner`; no customer membership                   | `/platform` shell                                     |
| Dual-context owner | `dual.owner@zayto.local`     | Active `platform_owner` plus an Account Owner membership          | Explicit platform-or-workspace chooser                |
| No-access user     | `no.access@zayto.local`      | Authenticated identity with no platform role or active membership | Access-not-granted screen                             |

Implementation requirements:

- Add the approved addresses to the local `SANDBOX_AUTH_EMAILS` configuration, never hard-code them as a production allow-list.
- Create idempotent fictional development fixtures only after the owner approves the schema/migration and fixture approach.
- Use an obviously fictional agency name and workspace slug.
- Give each persona its own Supabase Auth identity; never switch effective roles through a client-side test toggle.
- Browser tests may prepare authenticated sessions through a test fixture, but must exercise the same server authorisation and routing as a real login. Do not add an authentication bypass endpoint.
- Test direct URL access in addition to the normal redirects, back/forward navigation, sign-out, and returning through a fresh quick sign-in or magic link.
- Keep test identities and their role assignments out of production data.
