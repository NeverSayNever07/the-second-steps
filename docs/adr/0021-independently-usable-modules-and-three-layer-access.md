# ADR-021: Independently usable modules and three-layer access

- **Status:** Accepted (owner decision, 2026-10-12)
- **Decision:** Keep one modular monolith, but make CRM, pre-tenancy, property management, accounting, referencing, AML, Right to Rent, and future modules independently entitled and usable. Standalone services must not require an unrelated CRM subscription or depend on another optional module's internals.
- **Access:** Every protected operation checks three separate questions on the server: (1) workspace entitlement or allowance, (2) the user's permission, and (3) access to the specific resource and fields. Navigation visibility is not enforcement.
- **Commercial model:** Plans, prices, free allowances, trials, add-ons, usage limits, and pay-per-use terms remain unresolved. They will be represented through versioned catalogue and entitlement concepts rather than hard-coded plan names.
- **Native checks:** Referencing and AML are Zayto-owned products and workflows. External specialists may supply data and verification services through adapters. Zayto will not invent legal, compliance, or underwriting rules.
- **Date:** 2026-10-12
