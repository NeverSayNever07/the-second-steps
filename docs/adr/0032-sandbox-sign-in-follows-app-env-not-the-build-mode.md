# ADR-032: Sandbox sign-in follows APP_ENV, not the build mode

- **Status:** Accepted (owner decision, 2026-10-16)
- **Context:** The hosted proof of concept must run as an optimised production build on a Raspberry Pi 4. Quick sign-in and sandbox provisioning were switched off whenever `NODE_ENV` was `production`, and production email delivery does not exist yet, so a production build could not be signed in to at all. The build mode was standing in for "is this for real customers".
- **Decision:** A separate `APP_ENV` setting says who a deployment is for: `local`, `demo` or `production`. Sandbox personas, quick sign-in (still also requiring `SANDBOX_QUICK_SIGN_IN="true"`), sandbox provisioning and Mailpit work only when `APP_ENV` is `local` or `demo`. Any other value, including `production`, turns them off. When `APP_ENV` is unset, a development or test run counts as local and a production build counts as production, so a forgotten setting fails closed. The release check requires `APP_ENV="production"`. The Docker image is a production build and its example settings use `APP_ENV="demo"`.
- **Rules out:** Running the demo in development mode (slow, memory-hungry, compiles pages on request; not viable on a Pi). Allowing quick sign-in in every production build behind a single flag (one mistaken setting would expose sign-in to real customer data).
- **Trade-offs:** Anyone who can reach a demo can sign in as any sandbox persona, including the Account Owner, so a hosted demo must sit behind an access gate such as Cloudflare Access and hold fictional data only.
- **Supersedes:** the "quick sign-in is hard-disabled in production" part of [ADR-019](0019-authentication-provider-supabase-auth.md).
- **Date:** 2026-10-16
