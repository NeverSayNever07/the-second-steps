# ADR-036: An applicant is a household led by one contact, and matching only filters

- **Status:** Accepted (owner decision, 2026-10-22, including the role defaults). The rules, matching and permissions are built as tested code (chunk A1); no database yet.
- **Context:** ADR-031 named Applicant and Property enquiry but did not approve a schema. Before the applicant build, the record shape, the household, what requirements may hold, and how homes are matched to applicants had to be decided, without collecting sensitive data or ranking people. Design: `.cursor/plans/applicants-design.md`.
- **Decision:**
  - **One applicant record per household**, led by one existing contact (`applicants.lead_contact_id`). Other adults are linked contacts (`applicant_members`), shown with name and contact details only, ended rather than deleted. One active applicant per lead contact. Roles stay derived: a contact is an applicant because an applicant record points to it, never because of a role column.
  - **Requirements are append-only versions** (`applicant_requirement_versions`): areas, rent range and period, bedrooms range, property types, furnished preference, move from and by dates, household size, pets (yes or no) and short notes. **No** income, employment, immigration, identity, benefits or children fields; the notes box warns against them.
  - **Matching is a filter, never a ranking.** Only these criteria may exclude a home or an applicant: area, rent range, bedrooms, property type, furnished preference, and available-from by the move-by date. Pets and household size are information only. Notes are never used. There is no score, no "best match" label and no automated decision; results are in a neutral order. A test pins the allowed criteria.
  - **Joint applicants' privacy** rests on what staff screens show until a participant portal exists. A portal needs its own privacy review before it is built.
  - **Permissions:** `applicant.read` for every staff role except Accounts; `applicant.manage` for Account Owner, Agency Admin, Branch Manager and Negotiator; `applicant.reopen` for Account Owner, Agency Admin and Branch Manager. The database enforces the same with its own helper.
- **Rules out:**
  - A separate applicant record for every adult: doubles capture and needs privacy rules between joint applicants first.
  - Requirements as editable columns: loses history.
  - Scoring or ranking applicants: risks discrimination and automated decisions about people.
- **Trade-offs:** A household's requirements are shared by all its members; a member with different needs becomes a separate applicant. Privacy between joint applicants is a screen rule, not a database rule, for now.
- **Open:** retention and anonymisation of applicant data; marketing consent before any sending of matched homes.
- **Date:** 2026-10-22
