# ADR-016: Database host: Supabase (London)

- **Status:** Accepted (owner decision, 2026-10-11); project created and connected (London, PostgreSQL 17)
- **Decision:** Host PostgreSQL on **Supabase** in the London region. Use Prisma from our server for CRM data and Supabase Auth for identity and sessions (ADR-019). Do **not** expose CRM data through the browser-facing Supabase Data API.
- **Database roles (updated by ADR-027):** the app connects through the Session pooler as DML-only `zayto_app`, never `postgres`. A separate `zayto_migrator` owns and changes Zayto database objects and migration history. The earlier proof-of-concept permission for `zayto_app` to own tables and create databases was withdrawn in the verified shared Supabase cutover on 2026-10-13.
- **Encryption:** connections must use TLS and verify Supabase's certificate authority, stored at `certs/supabase-ca.crt` (public, safe to commit). The file is Supabase's published "Supabase Root 2021 CA" (valid to April 2031), checked against the root the database actually presents (SHA-256 fingerprints match). The app passes it to `pg`; Prisma's CLI receives it as the `sslcert` URL parameter (Prisma's name for the root certificate, not libpq's `sslrootcert`). "Enforce SSL" is on and the app connection was retested successfully on 2026-10-11. Data API: turned off by the owner.
- **Storage lean:** Supabase Storage (same London project, private buckets) for documents, to be confirmed under ADR-008.
- **Constraints:** Free tier is for the proof of concept only (no real tenant/landlord data). Move to a paid plan with backups before real data; ask the owner before any paid upgrade.
- **Date:** 2026-10-11
