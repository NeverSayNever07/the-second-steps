# Zayto proof-of-concept container: a production build, small enough for a
# Raspberry Pi 4. It runs as a demo when started with APP_ENV="demo" (see
# docs/DOCKER.md and ADR-032). No settings or secrets are built in; all of
# them are read when the container starts.

# Same Node.js version as CI. The digest pins the exact image so a rebuild
# cannot silently pick up a different one.
FROM node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854 AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Dependencies first, so rebuilds reuse the cache when only code changes.
# Install scripts stay off: nothing a package ships runs during the build.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# Building imports server modules that check these exist; the real values are
# supplied at run time, and these placeholders never reach the final image.
RUN npx prisma generate \
  && DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
     SUPABASE_URL="https://build.invalid" \
     SUPABASE_PUBLISHABLE_KEY="build-placeholder" \
     SUPABASE_SECRET_KEY="build-placeholder" \
     npx next build

FROM node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854 AS run

# The heap cap makes Node free memory before a small machine starts
# swapping; the app settles at about 160 MB.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=384 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Only the traced server and its assets; no source, no dev dependencies.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/certs ./certs

# The image's unprivileged user, so a compromised app cannot change the
# container itself.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
