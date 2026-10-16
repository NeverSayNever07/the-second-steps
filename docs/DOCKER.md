# Running Zayto in Docker (proof of concept)

This packages the app as a production build that runs as a **demo**, on any computer with Docker, including a Raspberry Pi 4. It is for the proof of concept only, with fictional data.

## What it is, and one thing to know

The container runs an optimised production build (`node server.js`, about 160 MB of memory). `APP_ENV="demo"` in `.env.docker` turns on the sandbox users and quick sign-in, because production email delivery does not exist yet (ADR-032). Quick sign-in lets anyone who can open the address sign in as a fictional demo user, including the Account Owner. With `APP_ENV="production"` the same image keeps sandbox sign-in off whatever else is set.

The container connects to the shared **development Supabase database**, which holds only fictional demo data. Because of this:

- The app is only reachable from the computer running it (`127.0.0.1`). Other people on the same Wi-Fi or office network cannot open it. Do not widen this, or put the container on the internet, without something in front of it (for example a password-protecting proxy, or a private network or VPN).
- Never reuse this setup with real customer data.

## Secrets

Nothing secret is built into the image (`.dockerignore` excludes every `.env*` file). The host supplies them at run time in a file called `.env.docker`, which is ignored by git. The project owner shares the values separately (not by email, chat or the repository):

| Setting                                    | Notes                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | The app's runtime database login. Never give the container the migration login. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Supabase details, server-only.                                                  |
| `SUPABASE_SECRET_KEY`                      | Server-only key. Treat as a password.                                           |
| `APP_URL`                                  | The address people will open, for example `http://localhost:3000`.              |
| `APP_ENV`                                  | `demo` for this container. `production` turns sandbox sign-in off.              |

## Running it

1. Install Docker.
2. Copy `.env.docker.example` to `.env.docker` and fill in the values.
3. From the project folder: `docker compose -f compose.app.yaml up --build`
4. Open `http://localhost:3000` and choose a sandbox user (for example Olivia Hart, the Account Owner).

Stop it with `Ctrl+C`, or run in the background with `docker compose -f compose.app.yaml up -d --build` and stop it with `docker compose -f compose.app.yaml down`.

## Sharing the image instead of the code

On the owner's computer: `docker build -t zayto-app:poc .` then `docker save zayto-app:poc -o zayto-app.tar`. On the other computer: `docker load -i zayto-app.tar`, then `docker run -d -p 127.0.0.1:3000:3000 --env-file .env.docker zayto-app:poc`. When using `docker run`, write the values in `.env.docker` **without quotes** (unlike compose, `docker run` keeps quotation marks as part of the value).

## Limits

- Session cookies are marked `Secure` in a production build, so open the app over HTTPS or at `http://localhost`; a plain-HTTP address on another machine will not stay signed in.
- Images are served without resizing, to save memory and CPU on small machines (`next.config.ts`).
- The database is shared, so changes made through the container appear for everyone using the same Supabase project.
- The container cannot apply database migrations (it has no migration login), by design.

## Publishing to the home lab

The home lab runs the image at `https://zayto.debens.app`, behind a Cloudflare Access login that lets in only listed email addresses.
`scripts/publish-image.mjs` builds the image from the last commit and pushes it to the private registry at `ghcr.io/debens/zayto`.
Uncommitted work and untracked files, such as `.env.docker`, are left out.
Commit first, then publish with a GitHub token that has `write:packages`, kept in 1Password:

```bash
GHCR_TOKEN=op://<vault>/<item>/credential op run -- node scripts/publish-image.mjs
```

It prints the new image's tag. The home lab runs a new tag once its own config is pointed at it.
