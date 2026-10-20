# Customer data migration and onboarding

**Status:** Confirmed future commercial requirement; implementation deferred. This plan records constraints for current CRM model design without authorising import code, schema, storage, or provider work.

## Outcome

Allow an authorised customer to move appropriate data from an existing lettings CRM into one Zayto workspace, preserving useful history and relationships while producing valid Zayto records. The same portability principles must support usable customer exports from Zayto.

No source CRM API is assumed. Structured file onboarding, including CSV and Excel, is the baseline; approved API adapters may be added where a supplier actually provides suitable access.

## Design guardrails for work completed before imports exist

- Core records must support workspace-scoped external source identifiers and provenance where useful. Source identity must not become a global identifier or grant access.
- Landlord, property, tenant, tenancy, party, document, note, and other relationships must be explicit enough to reconstruct historical as well as current associations, including effective dates or statuses where the domain needs them.
- Models must represent inactive, ended, archived, and historical records without treating them as current or deleting useful history.
- Original source timestamps and facts must remain distinguishable from when Zayto imported, corrected, or acted on a record. Imported source history must not be presented as a Zayto audit event.
- Canonical Zayto records keep their normal validation. Incomplete, inconsistent, or differently structured legacy rows are staged, reported, mapped, corrected, or explicitly excluded; imports do not make ordinary CRM fields broadly nullable or bypass domain rules.
- Documents, notes, source-specific fields, and relevant historical records need an eventual mapped destination, classified attachment, or clearly labelled retained-source representation. Do not scatter one supplier's fields through the core model.
- Import and export use module application contracts. They must not reach across module internals or make the domain model depend on a source vendor.

Exact tables and field shapes will be designed only alongside the first CRM entities that need them.

**Readiness check (2026-10-20, Chunk 9C):** contacts, properties, ownerships, landlord leads and instructions meet the history, inactive-state and source-date guardrails above. None has an external source identifier or provenance yet; design that (for example one workspace-scoped `external_references` table: record type, record id, source system, source id, unique per workspace) before the first CSV import, so re-runs and reconciliation can match records without trusting names.

## Eventual onboarding process

1. Confirm the customer's authority to supply the data, its workspace destination, scope, source, data categories, retention needs, and available export formats.
2. Receive files through private, access-controlled, UK-hosted handling. Inventory structured data and associated documents before transforming anything.
3. Create a versioned field mapping for the source dataset. Preserve original identifiers needed to reconnect related rows and files.
4. Validate types, required relationships, dates, statuses, classifications, and workspace ownership. Report blocking errors separately from reviewable warnings.
5. Detect likely duplicates within the destination workspace using explainable matching signals. Never merge people, properties, or tenancies solely because a name, email, or address looks similar.
6. Present a preview with proposed creates, links, updates, exclusions, warnings, errors, and record counts. Require an authorised confirmation before applying customer data.
7. Apply an auditable import batch with idempotent record handling, checkpoints, and stable source references so a safe retry does not create duplicates.
8. Reconcile totals and relationships, provide an outcome/error report, and retain or delete staging data under an approved policy.

An import must never silently overwrite newer Zayto data. Update, merge, rollback, and conflict policies remain unresolved and require explicit design before implementation.

## Possible delivery approaches

- **Baseline:** reusable CSV/Excel templates and customer-specific field mappings feeding one common validation and preview pipeline.
- **Assisted onboarding:** Zayto staff helps map and review customer exports through the same controlled process; this must not grant standing access to customer data.
- **Source adapters:** reusable file profiles or API connectors only when a named CRM's documented export/API and customer authority are confirmed.
- **Exceptional conversion:** a reviewed one-off transformation may prepare a supported import package, but must not write directly to production tables or bypass the common controls.

## Security, privacy, and operational requirements

- Every staged row, batch, report, document, and resulting record is scoped to the verified workspace, protected by application authorisation and RLS where stored in the database.
- Import permissions, approval roles, support access, audit visibility, and any step-up authentication require explicit design.
- Files need size/type limits, malware controls where applicable, spreadsheet-formula safety, encrypted transfer/storage, retention, and secure deletion.
- Logs and error reports must avoid unnecessary personal data and must not expose one customer's values to another.
- Tests must cover cross-workspace denial, duplicate/retry behaviour, partial failure, relationship integrity, malicious files, and cancellation or recovery at safe boundaries.
- Real customer data cannot be migrated until the production security, backup, recovery, privacy, and document-storage release gates are satisfied.

## Export and portability

Future exports should use documented, commonly usable structured formats and a clear document package where authorised. They should preserve stable Zayto identifiers, relevant external references, relationships, statuses, timestamps, and provenance needed to understand the data without proprietary database access. Export authorisation, redaction, participant privacy, retention, and audit must be designed before release.

## Decisions deferred until implementation planning

- Supported file variants, size limits, templates, and spreadsheet tooling
- First source systems or reusable mapping profiles
- Import permissions, customer approval, and Zayto support-access model
- Duplicate thresholds, merge/conflict behaviour, rollback boundaries, and reconciliation sign-off
- Treatment of unmapped custom fields, notes, attachments, and unsupported record types
- Staging location, encryption, retention, deletion, and recovery periods
- Export scope, packaging, redaction, and service levels
- Whether large imports require a dedicated worker after the job-runner decision is made
