# ADR-029: Human names use first-name and last-name fields

- **Status:** Accepted; first implementation is the user identity/profile (owner decision, 2026-10-14)
- **Decision:** Human records use separate `firstName` and `lastName` fields as the consistent CRM baseline for user identities and later applicants, landlords, tenants, guarantors, staff, and other people. The UI labels are **First name** and **Last name**. Either field may contain spaces, hyphens, apostrophes, diacritics, and multiple name parts; Zayto must not assume one token per field or invent a middle-name split. A normal display label is derived from the stored parts rather than stored as a competing full-name value.
- **Boundaries:** Organisations and other non-human parties use their organisation/trading/legal names, not person-name fields. Titles, preferred names, former names, mononyms, and legal-name history may be added when a real workflow requires them; they are not invented in this slice.
- **Migration:** Existing fictional sandbox names may be mapped explicitly. Imported or unknown full names must not be split heuristically; they require source mapping, user review, or a reported exception under ADR-028.
- **Date:** 2026-10-14
