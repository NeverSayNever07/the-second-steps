# Zayto — AI working instructions

Zayto is a commercial UK residential **lettings and property management CRM**. Residential **sales** will be added later. We are in a **proof of concept**, but architecture and security choices must still suit a real product.

## The project owner

The owner is **not a software developer**. Follow `.cursor/rules/communication.mdc` in every session: explain plans and commands in plain English, keep the owner informed, and **ask rather than make things up** when a requirement or decision is unclear.

Be proactive. Do not wait for the owner to know what to ask next: recommend the next sensible step, explain why it matters, and flag anything incomplete, untested, uncommitted, or not yet pushed. Never push, deploy, spend money, or make another approval-gated change without asking first.

Sanity-check significant decisions before implementing them, including accepted ADRs and these instructions. Compare them with the current requirements, installed services, and current official guidance. If a safer, simpler, or better-fitting option exists, raise it with evidence even when it conflicts with an existing project rule or decision. Do not silently ignore either direction: explain the conflict, ask the owner to decide, then update the rule and decision record before proceeding. The non-developer owner must not be expected to spot technical mismatches.

## Before you write code

1. Read this file and the relevant files in `.cursor/rules/` and `docs/`.
2. Inspect existing code and follow it unless a documented decision says otherwise.
3. State whether the work is a **confirmed** path, a **proposal**, or **unresolved**.
4. Work in small steps. Do not generate large amounts of code at once.
5. Do not invent business rules for referencing, insurance, AML, KYC, Right to Rent, or deposits. Those will be specified separately.

## Efficiency and proportionality

- Read the task-specific rules, documentation, and code needed to establish the relevant requirements and existing pattern; do not load every project document by default. Use installed-version guidance before new research. Check current primary/official sources when facts may have changed, an external service or security/compliance decision is involved, or the local evidence is genuinely insufficient.
- Keep changes focused on the requested outcome. Avoid drive-by refactors, speculative infrastructure, repeated investigation of established facts, and abstractions without a current need. Prefer the simplest maintainable solution that preserves the documented architecture and security boundaries.
- Match validation to risk: use targeted checks for documentation and minor UI changes; relevant unit tests for simple functions and forms; affected unit, integration, and browser coverage for features; and thorough relevant validation for authentication, permissions, tenant isolation, financial data, database migrations, and other security-critical work. Reserve the full test and build gates for significant architectural changes, planned development checkpoints, release preparation, or when specifically requested. Do not rerun an already successful check unless later changes could affect its result.
- Investigate a failed command before changing code or retrying it. Do not repeat the same failed command without a reason to expect a different result, and keep command output focused on the evidence needed.
- Record improvements that can safely wait in the relevant plan instead of expanding the current task. Flag work whose cost is disproportionate to its immediate benefit.
- Keep progress updates, completion reports, and project documentation concise and useful. For straightforward work, implement after a brief inspection; for complex work, make a short plan and deliver it in manageable stages. Do not add dependencies or tooling unless the current outcome justifies them. Minimise unnecessary tool calls and repeated analysis, but never trade away security, data integrity, or essential verification to reduce usage.

## AI model selection and usage budget

This project is developed on a limited personal AI budget. Maximise completed, reliable functionality per unit of AI usage; do not simply minimise tokens.

- Before a substantial task, assess its complexity and recommend a model (Haiku, Sonnet or Opus) with a brief reason, before starting work.
- Default to **Sonnet** for normal development work.
- Recommend **Haiku** for straightforward, low-risk changes where it is sufficient (copy edits, small styling tweaks, simple documentation).
- Recommend **Opus** only where deeper reasoning is likely to give a meaningful improvement (for example authentication, permissions, tenant isolation, complex migrations, or architectural decisions).
- Do not switch models automatically unless the owner has explicitly authorised it and it is supported; the owner switches with `/model`.
- Break larger tasks into stages, avoid repository-wide analysis, and reuse existing documentation and ADRs rather than re-investigating settled questions.
- Run targeted tests during development and broader suites at checkpoints.
- Never compromise authentication, tenant isolation, data integrity, security or essential tests to save usage.

## Current stack (installed)

- Next.js 16.4, **App Router** (`app/`). The Pages Router has been removed; do not add `pages/`.
- React 19.3, TypeScript (strict), Tailwind CSS 4, shadcn/ui (Nova, Base UI, `rsc: true`)
- Light/dark/system themes and responsive conventions: every new screen and component must support both themes and mobile, tablet and desktop from the start (`.cursor/rules/ui-design.mdc`, ADR-018)
- Record pages (a person, organisation, property, and so on) use the profile-sidebar layout with flat sections, not a card per group of fields (`.cursor/rules/ui-design.mdc`, ADR-030).
- Interfaces must be visually coherent and task-led. Prefer one clear entry point and one reviewed save for related edits; do not scatter several buttons across a card when one well-structured modal or page can handle the task more clearly (`.cursor/rules/ui-design.mdc`, ADR-018).
- Checks: `npm run check` (typecheck, ESLint, Prettier, Vitest), `npm run test:e2e` (Playwright), `npm run build`

- Database: PostgreSQL on Supabase (London) via Prisma 7.10 (`prisma/`, `core/db/`). The app uses least-privilege `zayto_app` over verified TLS, while `zayto_migrator` owns schema objects and applies migrations. The shared role cutover and access-hardening migrations were applied and verified on 2026-10-13 (ADR-016 and ADR-027); the people/organisation foundation migration was applied and verified on 2026-10-15; the properties and ownership foundation (Chunk 4) and its integrity-hardening migration, which followed an independent security review, were applied and verified on 2026-10-16. Contact, organisation-person, contact-note, property and ownership services and their main responsive screens exist; editing a property and transferring its branch have tested services but no screens yet. The Chunk 5 landlord-lead foundation (internally still named enquiries), appraisals, next actions and configurable lists were applied and independently reviewed on 2026-10-16; their services and screens are implemented and tested through 5C. The current staff-facing area is labelled **Landlord leads**, while ADR-031 reserves **Property enquiry** for the future applicant/listing workflow. Instructions, listings, applicants, property enquiries, viewings, offers and later CRM modules are not built yet.
- Authentication: Supabase Auth with server-verified cookie sessions. Public new-user sign-up is disabled. Allow-listed fictional users can use a feature-flagged quick sign-in when `APP_ENV` is `local` or `demo` (ADR-032); disabling it restores local magic links delivered to Mailpit. `APP_ENV="production"` always disables quick sign-in. Workspaces, memberships, fixed roles, role-aware shells, and feature-flagged TOTP are implemented. Participations, entitlements, invitations, MFA recovery, Google sign-in, rate limiting, and production email delivery are not implemented (ADR-019 to ADR-026).

Queues are **not installed**.

The login page (`app/login/`) and protected dashboard shell (`app/dashboard/`) are working sandbox paths. Keep them working.

## Non‑negotiables

- Never commit secrets or `.env*` files (except `.env.example`).
- Never overwrite, reset, or discard uncommitted work.
- Never claim a feature works without running the checks that exist.
- Never assume an external API, webhook, or portal is available.
- Every tenant-owned query and mutation must be scoped to the verified current **workspace**. Participant access must also be limited to the permitted resource and fields (ADR-020 to ADR-023).
- Distinguish **done**, **tested**, and **unverified**.

## Guardrails and skills

- Hooks in `scripts/agent-guard/` block or pause risky commands. Never work around a block (other commands, other tools, `--no-verify`); explain it to the owner instead.
- When you finish, a hook runs typecheck, lint and related tests on the uncommitted changes and sends any failures back to you. Fix them; never report work as done while they fail.
- Package install scripts are off (`.npmrc`). `dev`, `build`, `check` and `test:integration` run `prisma generate` themselves.
- Vendor skills in `.cursor/skills/` are general advice. These project rules win where they disagree: Prisma migrations only, no browser Data API, no new dependencies without approval, every query and cache scoped to the workspace, no `$queryRawUnsafe`, transaction-local `set_config` only.
- Follow `code-conventions` when writing or reviewing TypeScript and React.
- Run `review-security` before committing work that touches authentication, permissions, workspace data, migrations, secrets, Docker or CI.
- The owner finishes work with `/ship` (`.cursor/skills/ship/`). Suggest it when a change is ready; do not commit outside it unless asked.

## Where to look

| Topic | File |
| --- | --- |
| Product vision | `docs/PRODUCT.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Modules | `docs/MODULES.md` |
| Data (proposed) | `docs/DATA-MODEL.md` |
| Roles | `docs/PERMISSIONS.md` |
| Lettings lifecycle | `docs/WORKFLOWS.md` |
| Integrations | `docs/INTEGRATIONS.md` |
| Decision log | `docs/adr/README.md` |
| Phases | `docs/ROADMAP.md` |

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
