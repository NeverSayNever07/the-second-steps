---
name: review-security
description: Independent security review of changes. Use before committing or pushing anything that touches sign-in, roles, permissions, workspace data, Server Actions, Route Handlers, the database schema or migrations, files, secrets, or Docker and CI; or when the owner asks for a security review. Reviews only; never edits.
---

# Security review

You are reviewing code you did not write. Assume nothing is safe until you have read it. Do not edit files, run migrations, push, or read any `.env*` file other than the `*.example` ones.

**Keep the review independent.** If this chat wrote the changes, say so, and suggest the owner runs `/review-security` in a new chat so the reviewer has not seen the author's reasoning. If you can hand the review to a subagent, do. Either way, judge the code, not what the author says it does.

Recommend the strongest available model (for example Claude Opus) if a lighter one is selected. Security is where it is worth the cost.

## 1. Find the change

Review what the owner names. If they name nothing, review everything not yet on `main`:

- `git status --short` for uncommitted files
- `git diff main...HEAD` and `git diff HEAD` for the changes
- read each changed file in full, not only the diff, where the diff touches access, data, or configuration

Read only the parts of `AGENTS.md`, `.cursor/rules/security.mdc`, `.cursor/rules/database.mdc` and `docs/PERMISSIONS.md` that the change touches.

## 2. Check each item that applies

**Who is asking (authentication)**

- Every Server Action, Route Handler and server page that reads or changes data verifies the session on the server (for example `requireMfaUser`) before doing anything else.
- No new route is reachable without signing in unless the owner approved it and it is documented.
- Supabase: authorisation never uses `user_metadata`, which users can edit. `getUser()` or verified claims are used on the server, not an unverified `getSession()`.

**What they may touch (authorisation and workspace isolation)**

- The workspace comes from the verified server-side access context (`getWorkspaceAccessContext`), never from the URL, a form field, a cookie, or the request body.
- Every Prisma query and mutation on a tenant-owned table filters by that `workspaceId`, including lookups by id, updates, deletes, counts, and nested `include`s.
- Database work runs inside a transaction that sets the workspace context (`setWorkspaceDatabaseContext`, which uses `set_config(..., true)`, local to the transaction). Never use a session-level `SET`; pooled connections would leak it to the next request.
- Role and permission checks happen in the service, not only by hiding a button.
- Changing an id in the URL cannot reach another workspace's record, or a record the role may not see. A cross-workspace test exists in `tests/integration/*-security.test.ts` for every new data path.
- Caches (`cache`, LRU, `unstable_cache`, module-level maps) include the workspace in the key, or are not shared between requests.

**The database**

- New tenant-owned tables have `workspaceId`, indexes, workspace-aware foreign keys, and RLS enabled and forced, with policies, in the migration.
- The migration only adds what this slice needs, does not drop or rewrite data without the owner's approval, and does not grant the runtime database role more than it needs.
- No `$queryRawUnsafe` or `$executeRawUnsafe`, and no SQL built by joining strings. Tagged `$queryRaw` templates only.
- No query logging that would write personal data to logs.

**Data that leaves the server**

- `select` returns only the fields the screen needs. No password hashes, tokens, internal ids of other workspaces, or private notes go to the browser.
- Error messages are generic. No stack traces, SQL, or other users' names or emails.
- Logs record actor, workspace, action, outcome and record id, never secrets, tokens, bank details or document contents.
- No private key or secret uses the `NEXT_PUBLIC_` prefix or is imported into a client component.

**Input and output**

- Form and JSON input is validated on the server for type, length and allowed values before use.
- No `dangerouslySetInnerHTML` with user content, no user-controlled redirect targets, no fetches to user-supplied URLs.
- Files, when they exist: private storage, type and size checks, short-lived signed URLs.

**Secrets, configuration and supply chain**

- No real secrets in committed files. Example env files use placeholders such as `REPLACE_ME`.
- New dependencies or skills were approved by the owner.
- Docker: no secrets in the image, runs as a non-root user, base image pinned. CI: actions pinned to a commit, read-only permissions.
- Development-only shortcuts (sandbox quick sign-in, sandbox provisioning) cannot switch on in production.
- A secret that was ever committed is still in git history after it is deleted. It must be rotated, not just removed.

**Money, deposits and records that must not silently change**

- Amounts are integer pence end to end, including form parsing and JSON. No floating-point pounds.
- Changes to money, ownership, tenancy, or role records run in one transaction and write an audit entry: who, which workspace, what changed, when.
- Corrections are new entries or recorded edits, not silent overwrites of history (ADR-028).

**The AI setup itself** (`AGENTS.md`, `.cursor/rules/`, `.cursor/skills/`, `.cursor/hooks.json`, `scripts/agent-guard/`, `package.json` scripts, CI)

- Written rules match what the tools allow. A rule that says "never run X" while the agent can still run X through another command, an `npm run` script, or a build step is not a control. Check the hook policy covers it.
- No change weakens a guardrail: hooks removed or loosened, the git hooks path changed, ignore files widened, CI checks dropped.
- New skills, MCP servers or integrations: who published them, what they can read, and whether they can send data out (web requests, email, issues, messages). An agent that can read private data **and** take in untrusted text **and** send data out is the dangerous combination. Flag any change that adds the third leg.
- No secrets, internal addresses, or real customer details written into agent instruction files.

## 3. Verify before you report

For each possible finding, open the file at the line and confirm it is live code on a reachable path. A match in a comment, test, fixture, or document is not a finding unless that is the point. If you cannot confirm it, report it as **Unverified** with what stopped you. Never pad the report.

## 4. Report

Help the owner ship safely; don't gatekeep. They are not a developer, so every finding needs one sentence a non-developer can act on.

Start with a rating and one line:

- **Red**: any Blocking finding. Do not commit or push until it is fixed.
- **Amber**: no Blocking findings, but at least one Should fix.
- **Green**: nothing to fix. Say so in one line.

Then list each finding, most severe first:

- **Severity**: Blocking (data from one workspace or role reachable by another, a secret exposed, unauthenticated access, data loss) / Should fix / Note / Unverified
- **Where**: `path:line`
- **What could happen**: one plain-English sentence
- **Evidence**: the code or the request that shows it
- **Fix**: the smallest safe change, and a rough effort (minutes, an hour, a day)

End with one short line on what you checked and found fine, and what you could not check (for example, behaviour against the real Supabase project).
