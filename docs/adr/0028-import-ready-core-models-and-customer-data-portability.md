# ADR-028: Import-ready core models and customer data portability

- **Status:** Accepted as an architectural requirement; migration functionality remains deferred (owner requirement, 2026-10-14)
- **Decision:** Core CRM models must support meaningful workspace-scoped external source identifiers, provenance, historical/inactive records, and time-aware relationships so established letting agents can later migrate properties, landlords, tenants, tenancies, documents, notes, and relevant history without redesigning the domain. Imported source facts and timestamps remain distinguishable from actions and audit events created within Zayto.
- **Validation:** Imperfect legacy data must be staged, mapped, validated, previewed, and either corrected or reported; it must not weaken validation for records created in Zayto. Eventual imports require duplicate detection, error reporting, idempotent safe retries, reconciliation, and workspace isolation.
- **Portability:** CSV and Excel are baseline future inputs. Source-specific APIs are optional adapters and cannot be assumed. Zayto data must remain exportable in documented, usable formats without dependence on proprietary database access or one CRM vendor.
- **Scope:** No import implementation, schema, provider, or infrastructure is approved by this decision. Detailed workflow and deferred choices are recorded in `.cursor/plans/customer-data-migration-and-onboarding.md`.
- **Date:** 2026-10-14
