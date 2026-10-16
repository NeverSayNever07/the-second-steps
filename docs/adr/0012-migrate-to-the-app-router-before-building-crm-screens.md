# ADR-012: Migrate to the App Router before building CRM screens

- **Status:** Accepted and done (2026-10-11). Supersedes ADR-002's "migrate later". Login is now `app/login/page.tsx` (server) rendering `login-form.tsx` (client); `pages/` removed.
- **Context:** The app has only two Pages Router files (`_app.tsx`, `login.tsx`). Every new screen built in `pages/` would need moving later.
- **Decision:** After the Next.js 16 upgrade, move to `app/` (`app/layout.tsx`, `app/login/page.tsx`), set shadcn `rsc: true`, then remove `pages/`. Verify login in the browser at each step.
- **Date:** 2026-10-11
