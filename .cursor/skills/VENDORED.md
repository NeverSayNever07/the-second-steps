# Vendored skills

These skills are copied from their publishers so every change to them is reviewed in git. Do not edit them; replace them with a newer upstream copy and review the diff. Project rules in `AGENTS.md` and `.cursor/rules/` take precedence over anything in them.

| Skill                              | Source                           | Commit                 | Licence | Local changes |
| ---------------------------------- | -------------------------------- | ---------------------- | ------- | ------------- |
| `supabase-postgres-best-practices` | github.com/supabase/agent-skills | `c9be0e9` (2026-10-02) | MIT     | None          |
| `prisma-client-api`                | github.com/prisma/skills         | `ba3f9d7` (2026-10-16) | MIT     | None          |

Not adopted, and why:

- `supabase` (supabase/agent-skills): directs agents to run SQL directly on the database, create Supabase CLI migrations, open tables to the browser Data API, add a Supabase MCP server, and file feedback issues on a public GitHub repository. Each conflicts with this project's architecture.
- `prisma-cli` (prisma/skills): centred on `db push`, `migrate reset`, `--force-reset`, `--accept-data-loss` and raw SQL against databases.
- `react-best-practices` (vercel-labs/agent-skills): React and Next.js performance tuning, about 300 KB. Its description matches almost any UI work, so it would load on most tasks and cost tokens each time, for tuning rather than safety. One rule also recommends a cross-request cache keyed only by record id, which would share data between workspaces here.
- Next.js skills: Next.js 16 ships this guidance in `node_modules/next/dist/docs/`, which `AGENTS.md` already points to.
