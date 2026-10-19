---
name: ship
description: Finish a piece of work safely. Runs every check, gets a security review when risky files changed, keeps the docs true, explains the change in plain English, and commits it locally. Use only when the owner types /ship.
disable-model-invocation: true
---

# Ship

The owner is not a developer. They type `/ship` when they are happy with what they have seen. Your job is to make sure it is really finished, then save it as one commit they can undo. Never push; pushing is the owner's decision.

## 1. See what is being shipped

Run `git status --short` and `git diff --stat HEAD`. If nothing has changed, say so in one line and stop.

If the changes mix unrelated work (for example a new screen and an unrelated fix), say so and ask whether to ship them together or separately.

## 2. Run every check

Run `npm run check`. If it fails, fix the cause and run it again. If it still fails after two attempts, stop and explain what is failing in plain English; do not commit.

If the change touched sign-in, permissions, workspace data, migrations, or anything under `tests/integration/`, also run the database tests (`npm run test:integration`, a throwaway database in Docker). Run the whole suite when migrations, RLS or `core/access/` changed; otherwise run only the affected files (`npm run test:integration -- tests/integration/<file>.test.ts`). If Docker is not running, say so instead of skipping silently. Run the browser specs for the screens that changed; the full browser suite belongs to checkpoints.

Do not re-run a check that already passed in this session on the same files; say when it ran instead. (Owner decision 2026-10-19: keep testing proportionate to save AI usage.)

## 3. Security review for risky changes

Hand the review to a subagent with the `review-security` skill (if you cannot, ask the owner to open a new chat and type `/review-security`, then `/ship` again) when:

- the change alters the database's security: anything under `prisma/` (migrations, RLS, grants, triggers), `core/access/`, `core/auth/`, `proxy.ts`, `next.config.ts`, Docker, CI, `.cursor/hooks.json`, `scripts/agent-guard/`, `.npmrc` or `package.json`; or
- it adds or changes a Server Action (`actions.ts`) or Route Handler (`route.ts`) **outside** a planned chunk.

Server Actions and services built as part of a planned chunk are reviewed together once, at that chunk's checkpoint, before anything is shown outside the project. Say so in the ship summary so the review is not forgotten. (Owner decision 2026-10-19.)

- **Red**: do not commit. Explain each blocking finding in plain English and offer to fix it.
- **Amber**: explain the findings and ask whether to fix them first or ship now.
- **Green**: carry on.

## 4. Keep the docs true

Docs change in the same commit as the work. Search for what the change makes untrue (`grep -rn '<old name or value>' docs AGENTS.md .cursor/rules`); do not read whole documents to check.

| The change                                                                            | Update                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A choice a later reader could question, an exception to a rule, or a changed decision | an ADR, with the `write-an-adr` skill                            |
| A job that will be done again                                                         | a guide, with the `write-a-guide` skill                          |
| Tables, columns or relationships                                                      | `docs/DATA-MODEL.md`                                             |
| Roles or permissions                                                                  | `docs/PERMISSIONS.md`                                            |
| How the parts connect, or the security posture                                        | `docs/ARCHITECTURE.md`                                           |
| Progress on planned work                                                              | its plan in `.cursor/plans/` and the status in `docs/ROADMAP.md` |

`AGENTS.md` and `.cursor/rules/` change only when a rule changes, never to record progress: they are read in every chat.

## 5. Explain it to the owner

In a few short lines:

- what changed, in the owner's words (screens, records, rules), not file names
- what was checked and passed, and what could not be checked (for example sign-in against the real Supabase project)
- anything they should try themselves in the browser

## 6. Commit locally

- Stage the files with `git add -A`. The git hook refuses `.env` files; if it fails, explain why and do not work around it.
- Write the message as one or two sentences on why the change was made (`.cursor/rules/git-workflow.mdc`).
- Commit, then tell the owner it is saved on this computer only, and ask whether they want it pushed to GitHub.
