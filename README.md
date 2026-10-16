# Zayto

Zayto is a UK residential lettings and property management CRM for letting agencies. Residential sales will be added later.

**Status:** proof of concept. Local Supabase magic-link authentication, workspace and Platform Owner shells, fixed staff roles, RLS, audited role changes, feature flags, and a staged TOTP gate exist. MFA is deliberately off during development and mandatory for release. There are no CRM tables, entitlements, participants, production email, recovery controls, or product modules. Do not use real customer data. See `docs/ROADMAP.md` and `docs/SECURITY-RELEASE-CHECKLIST.md`.

## Running it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000/login.

## Checks

| Command                    | What it does                                                                 |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run check`            | Runs the secret check, typecheck, lint, format check and unit tests together |
| `npm run check:local-env`  | Warns if `.env.local` holds secrets as plain text instead of references      |
| `npm run typecheck`        | Checks TypeScript types                                                      |
| `npm run lint`             | Looks for likely bugs and bad patterns (ESLint)                              |
| `npm run format`           | Rewrites files into the standard format (Prettier)                           |
| `npm run test`             | Runs unit tests (Vitest)                                                     |
| `npm run test:integration` | Creates a disposable Docker PostgreSQL database and runs isolation tests     |
| `npm run test:e2e`         | Runs browser tests (Playwright)                                              |
| `npm run check:release`    | Checks release-only MFA, TLS, database-role, HTTPS, and invite-only settings |
| `npm run db:migrate`       | Creates and applies a database structure change (Prisma)                     |

## Secrets

Secrets live only in `.env.local` (and `.env.docker` for Docker), which git ignores. The `*.example` files list every setting with placeholder values. A git hook, CI and the AI guardrails all refuse to commit or read the real files.

Safer still, keep only **references** in `.env.local`, so the file holds no secrets at all:

```bash
SUPABASE_SECRET_KEY="op://Zayto/Supabase/secret-key"
```

Then start commands through the 1Password CLI, which swaps each reference for the real value while the program runs: `op run --env-file=.env.local -- npm run dev`. Use the same prefix for `npm run db:migrate` and `npm run test:e2e`.

## Working with the AI

1. Describe what you want in plain words.
2. Let it build. When it finishes, checks run automatically and it fixes anything they catch before saying it is done.
3. Try the result in the browser.
4. Type `/ship`. It runs every check, gets a security review when risky files changed, explains the change, and saves it as one commit on this computer. Nothing goes to GitHub until you say so.

If you paste a password or key into the chat, the message is stopped before it is sent.

## AI guardrails

- `.cursor/hooks.json` runs `scripts/agent-guard/` before every Cursor agent command, file read, write and delete. It blocks reading or writing `.env` files, `prisma db push`, data-deleting resets and force-pushes. It asks the owner before migrations, pushes, new dependencies and new skills, and refuses agent edits to the guardrails, git hooks, CI and `package.json` so the owner makes those changes knowingly. After each edit the file is formatted; when the agent finishes, typecheck, lint and related tests run on the changes and failures go back to the agent. Messages containing secrets are not sent. The rules and their tests are in `scripts/agent-guard/`.
- Package install scripts are switched off in `.npmrc`, so installing a compromised package cannot run code on this computer. `npm run dev`, `build`, `check` and `test:integration` generate the Prisma client themselves.
- `.cursor/skills/` holds vendor skills from Supabase and Prisma (see `.cursor/skills/VENDORED.md`) plus project skills: `code-conventions` (how to shape TypeScript and React here), `review-security`, `ship`, `write-an-adr` (one file per decision in `docs/adr/`) and `write-a-guide` (step-by-step guides in `docs/so-you-want-to/`). Run `/review-security` before committing changes to sign-in, permissions, workspace data, migrations, secrets, Docker or CI.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma 7, PostgreSQL (Supabase, London).

## Documentation

Product, architecture and decisions live in `docs/`. Instructions for AI assistants are in `AGENTS.md` and `.cursor/rules/`.
