# C3 design — manual property compliance foundation

**Status (2026-10-21):** **owner approved (2026-10-21)**. **Migration built and tested locally:** `20261021100000_property_compliance` and `tests/integration/property-compliance-security.test.ts` (25 tests); the full integration suite passes (352 before the three review tests were added) with no schema drift. **Changed during the build:** history rows take the clock time rather than the transaction time, so rows added in one save keep their order; the database checks the compliance permission before its other checks, so a member without it gets a plain refusal. **Independent `review-security` of the migration: Green (2026-10-21)**, with no blocking or should-fix findings. Its suggested tests (suspended members on the histories, write access after a branch move, evidence and status on an archived property) are added. Its other notes are under "Review notes" below. **Services built and tested locally (2026-10-21):** `core/compliance/domain/compliance.ts` (rules and derived states, 17 unit tests) and `core/compliance/application/property-compliance.ts` (record applicability, evidence with or without a file, evidence status, and a read of all five areas), with 13 integration tests in `property-compliance-application.test.ts`. `npm run check` (298 unit tests) and the full integration suite (368 passed, 1 skipped as before) pass. The services are reviewed at the C5 checkpoint. **Applied to shared development Supabase on 2026-10-21** (run by the owner, because the tool's safety check blocked Claude from running `migrate deploy`). Verified read-only as `zayto_app`: all five tables have row-level security enabled and forced with policies; the app can read and add on the four tenant tables, can only read the requirements list, and has no update, delete or truncate anywhere; the five requirement rows are present (file required except smoke and CO alarms); and no items are visible without a workspace context. **Not yet:** the C4 screens and upload route wiring.

## Review notes (2026-10-21)

- **Status racing Does not apply:** a Reviewed status saved at the same moment as Does not apply can both succeed. This is cosmetic, because the screen treats a Does-not-apply area as needing no evidence. Services may take a short per-item lock in both save paths if strict ordering is wanted.
- **Requirement versions:** an item keeps the version it was created with, including whether a file is required. Decide how existing items move when the first version 2 is written.
- **For the services:**
  - Creating an item uses raw SQL, as C2 does, and the database chooses the version. If a parallel first save causes a duplicate (23505), re-read the existing item and continue.
  - Evidence with a file is created through the C1 `attach` hook by the uploader.
  - The screen needs a **File removed** state, and a plain message when a file has already been relied on.
  - "Current" means ordered by `recorded_at DESC, id DESC`.
  - Map 42501, 23514 and 23505 to plain-English errors.
  - Audit entries carry ids only. Implements C3 of `property-compliance-and-landlord-agreements.md` for fictional data only, on top of C1 (`c0-design-private-documents.md`). Database and services only; the screens and attention windows are C4. Not legal advice; independent legal review remains a real-data gate.

## What already exists (inspected 2026-10-21)

- C1 `documents` already accepts `compliance_evidence` files (PDF, JPEG, PNG, 10 MB) linked to a property. Upload and download check `property.compliance.manage` / `property.read` and the property's current branch. C1's `attach` hook lets C3 create its evidence record in the same transaction that marks the file stored, as C2 does.
- `property.compliance.manage` and the database helper `property_compliance_member_can_work` exist (Account Owner, Agency Admin, Branch Manager, Negotiator, Property Manager). Accounts and Read Only can only view.
- Tenant tables use forced RLS and the migrator has no RLS bypass, so **the migration cannot create rows for existing properties**. Compliance items are created the first time staff record something; until then an area shows as **Not assessed**.

## Records

**`compliance_requirements`** is a global, read-only list of system definitions, seeded by the migration. It holds one row per area and version: area, label, jurisdiction (`england`), effective from, source link, review-by date, and the evidence fields that area uses. The app can only read it. The five initial areas are `epc_mees`, `gas_safety`, `electrical_safety`, `smoke_co_alarms` and `licensing`. A later rule change adds a new version and never edits an old one.

**`property_compliance_items`** holds one row per property and area: workspace, property, area, and the requirement version current when it was created. It is unique per property and area, immutable, and never deleted by the app. It is the anchor for everything below.

**`property_compliance_assessments`** is the applicability history, append-only: item, applicability (`applies`, `does_not_apply`, `needs_specialist_review`), reason (required for the last two), optional source note, who and when (set by the database). The current applicability is the latest row. No rows means **Not assessed**.

**`property_compliance_evidence`** holds one immutable row per piece of evidence: item, optional C1 document (unique, same property, `compliance_evidence` kind), and the staff-entered facts:

| Field                   | Rule                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `reference`, `provider` | Optional text: certificate or licence reference, engineer, company or council.                                           |
| `event_on`              | The inspection, issue or test date shown on the evidence. Required, and not in the future (London date).                 |
| `expires_on`            | Expiry or next-due date as written on the evidence. Optional, and on or after `event_on`. **Zayto never calculates it.** |
| `epc_rating`            | `A`–`G`, EPC area only.                                                                                                  |
| `notes`                 | Optional.                                                                                                                |
| who and when            | Set by the database.                                                                                                     |

**`property_compliance_status_events`** is the evidence-status history, append-only: item, status (`awaiting_evidence`, `reviewed`, `action_required`), the evidence relied on (required for `reviewed` and `action_required`; it must belong to the same item and its file must still be stored), an optional note (required for `action_required`), and who and when. The current status is the latest row.

The remaining plan states are **derived, not stored**, so they can never drift:

- **Not requested**: no status events yet.
- **Expired**: the relied-on evidence's `expires_on` has passed. C4 shows this; nothing changes in the database.
- **Superseded**: evidence that was relied on before but is not the current relied-on evidence.

There is deliberately no single Compliant / Non-compliant field.

## Rules

- **Status needs applicability.** Evidence status can be recorded only while the current applicability is **Applies**. Evidence can be uploaded at any time. If applicability later becomes Does not apply, the history stays and the screen shows that evidence is not needed.
- **Removing a wrong file.** A compliance file can be removed, with a reason, only while no status event has ever relied on it. This extends C1's document trigger. Its evidence row stays and shows **File removed**. Once relied on, a file is permanent and is replaced by newer evidence.
- **Branch moves.** Items, history and files follow the property's current branch (C0 decision).
- **Archived properties.** Existing records stay readable. New records are refused while the property is archived.
- **No inferred law.** No deadline calculation, no postcode or council licensing detection, and no certificate-outcome interpretation. Dates and outcomes are what staff typed from the evidence.

## Access

- **See:** every staff role with `property.read`, within the property's branch scope, through policies modelled on C1's compliance-document policies.
- **Record:** `property_compliance_member_can_work` on the property's branch, writing only as yourself.
- **Grants:** the app role gets SELECT and INSERT only on all four tenant tables (no UPDATE or DELETE), and SELECT only on `compliance_requirements`.
- **Audit:** `compliance.applicability_record`, `compliance.evidence_add` and `compliance.status_record` (success and refused), with ids only and never notes or file names. File removal reuses `document.remove`.

## Migration (one file)

1. Enums and the five tables, with workspace-aware foreign keys and indexes for "latest row per item".
2. Seed the five requirement definitions (England, fictional-data wording, source links from the main plan).
3. RLS enabled and forced, policies and grants.
4. Triggers: database-set actor and time, the required-reason and date rules, the same-item and stored-file checks for relied-on evidence, Applies-only status, the archived-property refusal, and the C1 document-removal guard.
5. No data change.

## Services (core/compliance/)

- `getPropertyCompliance(propertyId)` returns all five areas with current applicability, current status, the relied-on evidence, and the history. Areas with no item show as Not assessed.
- `recordApplicability`, `recordEvidenceStatus`, and evidence creation through the C1 upload `attach` hook. Facts-only alarm evidence uses a plain save (decision 1).
- Zod validation and plain-English errors, following the existing instruction services.

## Tests

- **Unit:** derived states (Not assessed, Not requested, Expired, Superseded), date and reason validation.
- **Integration (security):** cross-workspace and cross-branch reads and writes; Accounts and Read Only refused writes; no update or delete of history; relied-on evidence must be from the same item with a stored file; Applies-only status; removal refused after reliance; archived-property refusal; requirement definitions read-only; full integration suite (migration and RLS change).
- **Integration (application):** assess, then upload, then review, then upload replacement evidence, then review again (the old evidence shows Superseded); Does not apply with a reason; branch transfer keeps the history with the property.

## Owner decisions (2026-10-21)

1. **Evidence without a file:** EPC, gas safety, EICR and licensing evidence must have an uploaded file. Smoke and CO alarm evidence may be facts only, with an optional file. The database enforces this per area.
2. **Who may mark evidence Reviewed:** any of the five permitted roles, including the person who uploaded it. A second-person check is a possible real-use control, recorded for later.

## Order and gates

1. Owner approves this design.
2. Migration and database tests, then `review-security` of the migration. Applying it to shared Supabase needs a separate owner approval.
3. Services and their tests.
4. C3 checkpoint: `npm run check` and the full integration suite. The service review happens at the C5 checkpoint, per the 2026-10-19 owner decision.
