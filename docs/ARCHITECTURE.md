# Architecture

## What we have today (confirmed, inspected)

| Piece                                      | Status                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Next.js 16.4 + React 19.3                  | Installed; **App Router** (`app/layout.tsx`, `app/login/`)                              |
| TypeScript, `strict: true`, `@/` imports   | Installed; `npm run typecheck`                                                          |
| Tailwind CSS 4 + `styles/globals.css`      | Installed; Inter; brand tokens (ADR-017)                                                |
| Light / dark / system themes               | Installed (`components/theme/`, ADR-018)                                                |
| shadcn/ui (Nova, Base UI), `components/ui` | Installed; `rsc: true`                                                                  |
| PostgreSQL (Supabase London) / Prisma 7.10 | Access foundation and least-privilege role split applied and verified                   |
| Auth                                       | Supabase Auth, sandbox quick sign-in/Mailpit links (local and demo only), and TOTP gate |
| Feature flags                              | Global, Zayto-user, and workspace rollout controls                                      |
| Platform administration                    | Read-only user/customer directories and customer feature controls                       |
| ESLint, Prettier, Vitest, Playwright       | Installed (ADR-013); `npm run check`, `npm run test:e2e`                                |
| Job queue                                  | **Not installed**                                                                       |

## Security posture today

- Supabase Auth proves identity and maintains server-verified sessions. The local quick-sign-in selector still creates and verifies a Supabase one-time token, is restricted to the sandbox allow-list, and works only when `APP_ENV` is `local` or `demo` (ADR-032); `SANDBOX_QUICK_SIGN_IN=false` restores the Mailpit link flow. Staff access requires an active platform role or workspace membership. TOTP AAL2 is implemented behind the `staff_mfa` flag, currently disabled for development and protected by a release-only force-on setting. Participations, entitlements, rate limiting, recovery operations, and production email delivery are not implemented. Do not put real personal or financial data in the database.
- **The browser never talks to Supabase.** Every Supabase Auth call (sign-in, session refresh in `proxy.ts`, sign-out, and TOTP set-up and verification in `app/mfa/actions.ts`) runs on the server. This lets the session cookies be `HttpOnly`, so a script injected into a page cannot read the tokens and take over a session; they are also `Secure` in production and `SameSite=Lax` (`core/auth/session-cookies.ts`). The Content Security Policy does not allow the browser to connect to Supabase. The Supabase URL, publishable key and app address are server-only settings (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_URL`), so none of them is built into the browser bundle. Do not add a browser Supabase client or a `NEXT_PUBLIC_` Supabase setting; add a Server Action instead. `core/auth/session-cookies.test.ts` fails if a client component imports `@supabase/`.
- The app talks to Postgres from the server as least-privilege `zayto_app` over verified TLS. The separate `zayto_migrator` role owns Zayto schema objects and migration history. The shared ownership/role cutover was applied and verified on 2026-10-13. The browser Data API is off. RLS is enabled and forced on every access-foundation table; application checks remain mandatory.
- RLS protects against missing application filters, not a fully compromised website process: PostgreSQL custom request settings are asserted by the same runtime connection. Removing DDL/object ownership from `zayto_app`, explicit application authorisation, parameterised queries, and server-only boundaries remain essential.
- Secrets stay in `.env.local` (gitignored). The public certificate is `certs/supabase-ca.crt`.
- "Enforce SSL" is confirmed on. Free-tier backups are not enough for real data (ADR-016).

## Tenant and account model (foundation implemented; wider model proposed)

`Workspace` is the hard boundary for customer data, subscriptions, entitlements, usage, and business permissions (ADR-020). An agency, an independent landlord, and Zayto's internal operation use different workspace types. An `Organisation` represents a legal or commercial body and may own a workspace; an individual landlord may own a workspace without being modelled as a company.

One Supabase identity may have several kinds of access:

- `Membership` — operates a business workspace as an owner, administrator, or staff member.
- `Participation` — acts in a particular application, tenancy, guarantee, referencing case, or explicitly shared landlord relationship.
- `ResourceGrant` — limits a participant to named resources, actions, and fields.

The internal Platform Owner shell may read limited account and customer administration metadata, including user names/emails, workspace details, branches, memberships, and feature-flag settings. This does not grant access to customer CRM records. The current audited mutations cover feature-flag overrides, user names, and customer/contact details; authorised customer roles may edit the same ordinary customer/contact details through their verified workspace context.

Within a customer workspace, staff-directory identity fields are readable only for memberships already visible through the actor's `membership.read` permission and branch scope. PostgreSQL RLS mirrors that boundary for co-member names and sign-in emails; provider identities remain separate and hidden.

Applicants, tenants, guarantors, and invited landlords are first-class users with a personal portal, but they are not broad members of an agency workspace. A small user-controlled personal profile may be reused with explicit confirmation; each workspace retains its own operational person records and history. Sensitive submissions remain case-scoped and private by default.

Every protected operation checks, on the server:

1. Workspace entitlement or allowance.
2. User permission in the current membership or participation.
3. Access to the specific resource and fields.

Application queries scope by the verified `workspaceId`. PostgreSQL RLS is enabled on the access-foundation records as defence in depth (ADR-023); the same pattern is required for every future tenant-owned repository.

## Style: modular monolith (confirmed)

One application, one PostgreSQL database. Code is split into **modules** so lettings, future sales, and shared core do not become a tangle.

We are **not** starting with microservices. That would add operational cost before we have product-market fit.

```
┌─────────────────────────────────────────────┐
│                 Presentation                 │  app/ + shadcn/ui + domain components
│         shadcn/ui + domain components        │
├─────────────────────────────────────────────┤
│     Application (use-cases + authz)          │
├──────────────┬──────────────────────────────┤
│   Lettings   │  Sales (later, no imports    │
│   module     │  from lettings internals)    │
├──────────────┴──────────────────────────────┤
│  Core: workspace, identity, people,          │
│  property, documents, audit, jobs            │
├─────────────────────────────────────────────┤
│  Data access (Prisma) → PostgreSQL           │
└─────────────────────────────────────────────┘
```

Presentation depends on application use-cases. Application code depends on domain rules and repository interfaces. Prisma adapters implement those interfaces; domain code never imports the data layer. Core must not import lettings or sales.

## Customer migration and portability (confirmed requirement; deferred)

Core people, property, tenancy, document, and relationship models must accommodate externally sourced records, meaningful source identifiers, historical/inactive states, and past associations without becoming coupled to a particular CRM. Source facts, source timestamps, import metadata, and later Zayto-authored activity must remain distinguishable.

Future file or API adapters will translate source data at the application boundary and call the same owning-module contracts as other authorised use-cases. Imperfect legacy data belongs in an isolated validation/staging process; it must not weaken canonical record validation or bypass workspace, permission, privacy, audit, and RLS controls. Zayto must also support documented, usable customer exports rather than relying on proprietary database access. The deferred workflow and open decisions are in `.cursor/plans/customer-data-migration-and-onboarding.md` (ADR-028).

## Target folder shape (proposed)

Partly created. `core/feature-flags/` now contains fixed keys, precedence, server evaluation, administration, and database access. Expand the remaining areas as feature work starts:

- `core/db/` — Prisma client and connection (exists). Later: workspace, membership, participation, entitlement, audit, files, jobs
- `modules/lettings/` — applications, tenancies, rent, maintenance, compliance (not created)
- `modules/sales/` — empty until needed
- `components/ui/` — shadcn (exists)
- `components/theme/` — light/dark/system (exists)
- `app/` — routes, layouts, and Server Actions (exists)

Exact paths may sit under `src/` later. **Unresolved** whether to introduce `src/`.

## Next.js routing (confirmed)

App Router is in use (`app/`). Do not add `pages/`. New screens use Server Components by default, with small Client Components for interactivity (see `app/login/`). The URL holds navigation state only: record ids, tabs, filters, sort, search and paging live in the path or search params, so any screen can be shared as a link and Back works. URLs never carry personal data, and a shared link grants nothing; the server checks every viewer (`.cursor/skills/code-conventions/SKILL.md`, section 8).

## Hosting and jobs

Vercel is confirmed for the first production release. Dynamic execution must be pinned to an approved UK region and Vercel's data processing, logs, analytics, caching, and subprocessors must be checked before real personal data is used. Static assets may use Vercel's global network, but tenant data must never be placed in publicly cached output. Deployment remains unapproved and no Vercel project configuration has been applied.

**Proposed** for jobs: persist a `Job` row and process it with a later worker (for example [Inngest](https://www.inngest.com/) or a Postgres-backed worker). For the first PoC slice, short internal writes may stay in-request **with timeouts**; anything that calls a third party should still be a job.

## Caching (proposed)

CRM data is private. Default to **no public static cache**. Revalidate after mutations. Do not put tenant PII in a CDN-cached HTML page.

## Observability (proposed)

Structured server and audit records must use `workspaceId`, `actorUserId`, `requestId`, and the relevant participation or resource where applicable. Error reporting (e.g. Sentry) is later. Do not put PII, sensitive evidence, tokens, or document contents in logs or the client console.

## Commercial modules (confirmed design; not implemented)

CRM, pre-tenancy, property management, accounting, referencing, AML, Right to Rent, and later modules are independently entitled. They may share narrow core capabilities, but an optional module must not require another optional module's subscription or import its internal data access.

Plans, free allowances, trials, paid add-ons, usage limits, and pay-per-use services are represented through a versioned product catalogue, entitlements, service orders, and append-only usage events. Specific prices and tiers remain unresolved.

Referencing and AML are native Zayto products: Zayto owns the case workflow, consent, audit, customer experience, and provider orchestration. Specialist data and verification services remain external adapters. Detailed legal and decision rules require written specifications.
