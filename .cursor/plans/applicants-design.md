# Applicants, property enquiries and viewings: design note (A0)

**Status:** Designed and **approved by the owner 2026-10-22**, including the role defaults. **A0 and A1 are done** (A1: the lifecycle rules, requirement validation, matching and the five permissions, as tested code in `core/applicants/domain/` and `core/access/domain/`; no database). **A2 (the migration) is built and tested locally** (`20261023100000_applicants_and_property_enquiries`; independently reviewed (Amber, fixes applied); **applied to shared development Supabase on 2026-10-22** by the owner and verified read-only as `zayto_app`: row-level security forced on all seven tables, no delete or truncate, updates limited to the intended columns, the archive guard and the member lock live, nothing visible without a context). A3 (services) is next. Decision records: [ADR-036](../../docs/adr/0036-an-applicant-is-a-household-led-by-one-contact-and-matching-only-filters.md) and [ADR-037](../../docs/adr/0037-property-enquiries-and-viewings-need-a-ready-to-advertise-listing.md). Fictional data only. Nothing is ever published, and no referencing, Right to Rent, AML, affordability, deposit or holding-deposit rule is invented.

## Why

Listings reach an internal Ready to advertise and ADR-035 settled how a property is let again over time. The next step is the demand side: people looking to rent, what they want, which homes they are interested in, and viewings. ADR-031 fixed the names and boundaries but did not approve a schema; this note answers the open Gates 2 and 3 of `enquiry-workflows-and-fluidity.md` for applicants, property enquiries and viewings.

## Owner decisions (2026-10-22)

1. **Scope:** applicants, requirements, property enquiries and suggested matches (Stage A), then viewings in the staff calendar (Stage B). **Offers later**, after a legal check of the rental-bidding and advertised-rent rules (Zayto must never encourage an offer above the advertised rent).
2. **Household:** one applicant record per household, led by one person (an existing contact). Other adults are linked contacts with name and contact details only. Requirements sit on the applicant.
3. **Enquiries only on Ready to advertise listings.** An applicant asking about a home that is not ready is still captured through requirements, and that home appears in their suggested matches once it is ready.

**Defaults (confirmed by the owner 2026-10-22):** Property Manager and Read Only can view applicants and viewings but not change them; Accounts sees none; reopening a closed applicant is for managers and above; viewing feedback is internal only; closure reasons are an agency-editable list.

## Records

New database objects are named `applicant_*`, `property_enquir*` and `viewing*`, never `enquiry_*`, which belongs to landlord leads.

| Record                                              | What it holds                                                                                                                                                                             | Rules                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Applicant** (`applicants`)                        | One household: reference, lead contact, responsible branch, owner, optional source (the existing lead-source list), status                                                                | One active applicant per lead contact. A contact with an open applicant cannot be archived (a counter kept by the database, like landlord leads).                                                                                      |
| **Household member** (`applicant_members`)          | Another adult: a link to a contact                                                                                                                                                        | Ended, never deleted. The lead is not also a member. Screens show only a member's name, email and phone.                                                                                                                               |
| **Requirements** (`applicant_requirement_versions`) | Areas (towns or postcode districts, up to 10), rent range and period, bedrooms range, property types, furnished preference, move from / by, household size, pets (yes or no), short notes | Append-only versions; the newest is current. **No** income, employment, immigration, identity, benefits or children fields; the notes box warns against them and is never used for matching.                                           |
| **Property enquiry** (`property_enquiries`)         | One applicant's interest in one listing: stage, assignee, source, closure reason                                                                                                          | Only on a **Ready to advertise** listing (the database refuses otherwise). One open enquiry per applicant and listing. Belongs to the listing's branch; the lead contact is shared with that branch. History of stages is append-only. |
| **Closure reasons** (`lettings_outcome_reasons`)    | Agency list for closing applicants and enquiries and cancelling viewings                                                                                                                  | A protected system reason, "Home no longer available". Managed in Settings.                                                                                                                                                            |
| **Next actions** (existing `actions`)               | New optional links to an applicant and a property enquiry                                                                                                                                 | Reuses the actions list and the calendar. No new tasks table.                                                                                                                                                                          |
| **Viewing** (`viewings`, Stage B)                   | From a property enquiry: start and end time (entered by staff, no default length), assignee, status, outcome, internal feedback                                                           | Append-only status history. An overlap shows a warning, not a block.                                                                                                                                                                   |

## Stages

| Record           | Stages                                           | Rules                                                                                                        |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Applicant        | Active, On hold, Closed                          | Closing needs a reason; reopen for managers and above                                                        |
| Property enquiry | New, Contacted, Viewing arranged, Viewed, Closed | Forward or back one step; closing needs a reason; reopening is refused if the listing is withdrawn           |
| Viewing          | Scheduled, Completed, Cancelled, No-show         | Completing needs an outcome: Interested, Wants another viewing, Not interested, Undecided. No offer wording. |

Booking a viewing moves the enquiry to Viewing arranged; completing it moves it to Viewed, in the same transaction.

## When the listing changes

- **Withdrawn** (including when its instruction ends): open enquiries close and scheduled viewings are cancelled with "Home no longer available", by a database trigger that writes history. Nothing is deleted. The enquiry list flags "Applicant to be told".
- **Back to Draft:** enquiries and viewings stay open and show "Home not ready". New enquiries and viewings wait until it is Ready to advertise again.

## Who sees what

Staff see an applicant when they can see its branch or the branch of any of its enquiries (one reviewed database helper, with dedicated leak tests). Enquiries and viewings follow the listing's branch. Joint applicants' privacy rests on what staff screens show until a participant portal exists; any portal needs its own review first.

| Permission                           | Account Owner, Agency Admin, Branch Manager | Negotiator | Property Manager, Read Only | Accounts |
| ------------------------------------ | ------------------------------------------- | ---------- | --------------------------- | -------- |
| `applicant.read`, `viewing.read`     | yes                                         | yes        | yes                         | no       |
| `applicant.manage`, `viewing.manage` | yes                                         | yes        | no                          | no       |
| `applicant.reopen`                   | yes                                         | no         | no                          | no       |

## Matching: a filter, never a ranking

For an applicant, the Ready to advertise homes that fit their requirements; for a listing, the active applicants whose requirements fit. **Hard filters only:** area, rent range (weekly and monthly converted), bedrooms, property type, furnished, and available-from by the move-by date. Pets and household size are shown for information and never exclude anyone. No score, no "best match", no AI. Neutral order: available date for homes, registered date for applicants. A test pins the allowed filters so nothing else can creep in.

## Screens

Light, dark and phone from the start. "Ready to advertise (inside Zayto only)"; never live, published, advertised or portal.

- Applicants list under Pipeline and Contacts, with status, branch, owner and "No next action" filters.
- Applicant record: profile sidebar (lead, household, owner) and tabs Overview, Requirements (with history), Property enquiries, Suggested homes, Viewings (Stage B), History.
- New applicant: contact search with duplicate review, household members, source (manual channels only), branch, owner, optional requirements, first next action, optional "Interested in" picker showing only Ready to advertise homes.
- Listing page Enquiries tab: its enquiries and "Applicants whose requirements fit"; registering only when Ready to advertise.
- Pipeline, Property enquiries: board and list.
- Stage B: Book viewing, a phone-first outcome form that asks for the follow-up, and viewings in the staff calendar.
- Dashboard Marketing & applicants tab: active applicants, open enquiries, viewings this week, records with no next action. Workspace search: an Applicants group.

## Chunks

| Chunk      | Content                                                                     | Gate                                                                                      | Model  |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| A0         | This note, ADR-036, ADR-037, doc updates                                    | Owner approves                                                                            | Sonnet |
| A1         | Domain rules, matching, permissions, wording                                | Unit tests, `npm run check`                                                               | Sonnet |
| A2         | Stage A migration                                                           | Database security tests, independent review, owner approval; the owner runs the migration | Opus   |
| A3         | Stage A services                                                            | Application tests                                                                         | Sonnet |
| A4         | Stage A screens                                                             | Browser tests, light/dark/phone, build                                                    | Sonnet |
| B1         | Viewings migration                                                          | As A2                                                                                     | Opus   |
| B2         | Viewing services and calendar source                                        | Application and calendar tests                                                            | Sonnet |
| B3         | Viewing screens                                                             | Browser tests                                                                             | Sonnet |
| Checkpoint | Full suites, independent review of A3 to B3, demo data, go/no-go for offers | Owner                                                                                     | Opus   |

## A2 as built (2026-10-22)

Built as designed, with these implementation choices:

- **"Home no longer available" is a flag, not a reason row.** An enquiry closed by a withdrawn listing has `closed_by_listing` set, the note "Home no longer available" and a history row of kind `listing_withdrawn`; staff closures need an agency reason. This needs no seeded system reason per agency. Only a real withdrawal can set the flag, and only through a withdrawal record.
- **Current requirements are the highest version**, read with an index; no pointer column on the applicant.
- **Who can change what:** an applicant, its household and requirements are changed by people who work with applicants in the applicant's branch; an enquiry by those in the listing's branch. Recording an enquiry needs both (a member who can see the applicant and the listing). Seeing an applicant through an enquiry in another branch does not let you change it.
- **A Property Manager who ends an instruction** closes its listing's open enquiries through the cascade, and can do nothing else to them.
- **Independent `review-security` (2026-10-22): Amber, nothing blocking.** Fixed and tested before applying: a contact leading or in an open applicant can no longer be archived (database check, like the other counts); ending a household member locks the applicant first, so a simultaneous close cannot miscount; a closed enquiry reopens only for an open applicant on a Ready to advertise listing; a closure reason or note cannot be rewritten after closing.
- **Owner decision (2026-10-22), from the review:** recording an enquiry needs someone who can work in both the applicant's branch and the listing's branch (a manager, or staff covering both); branch-only staff do not look up other branches' applicants. The services in A3 must explain who to ask when this blocks someone, and must add the lead contact's branch link for the listing's branch.
- **Notes kept:** the withdrawal cascade can only close enquiries the person can see, which today is always all of them (an instruction's branch is fixed); seeing an applicant through an enquiry lasts after the enquiry closes, as designed.
- Tests: 21 database security tests (`tests/integration/applicant-security.test.ts`); the full integration suite passes (464) with no schema drift.

## Open questions (not decided)

Retention and anonymisation of applicant data; marketing consent before any sending of matched homes; portal or website enquiry intake (no provider access); offer rules (legal check); holding deposits, referencing, Right to Rent, AML and affordability stay out of scope; whether landlords ever see viewing feedback.

## Risks

Cross-branch leaks through the applicant visibility helper; the cascade trigger's agency-wide scope (it must touch only listed columns); sensitive data typed into free text; household privacy resting on screens until a portal exists; the calendar's new end time touching existing entries.
