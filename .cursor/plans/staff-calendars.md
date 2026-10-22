# Staff calendars

**Status:** Product direction confirmed by the owner on 2026-10-22. CAL-0 through CAL-3 are implemented and tested: the production dashboard has the authorised My/Branch calendar, URL-driven day/week/month views, condensed/full-day controls, timed-action creation from a slot, confirmed appraisal/action moves, responsive layouts and icon-led tabs. A branch calendar visually distinguishes the signed-in person's appointments. Unit tests, both focused database suites, two production browser tests, the full project check (33 files / 353 tests) and the production build pass. A fresh-chat security review remains a sensible independent follow-up before this reaches production.

## Outcome

Give staff one calendar for their own CRM work and, where permitted, the work across their branch. Keep the compact personal **Today's schedule** on Dashboard Home and add a full **Calendar** tab to the dashboard for day, week and month planning.

The calendar is an authorised view over the records that own each appointment. It must not become a second copy of appraisals, actions, future viewings, inspections or maintenance visits.

## Confirmed product decisions

- Dashboard Home keeps the signed-in person's compact schedule for today.
- The dashboard gains a dedicated **Calendar** tab for the full diary.
- The Calendar opens on **My calendar**. Staff may switch to **Branch calendar** for branches and records they are already permitted to see.
- Branch calendar is available to all staff with access to the underlying branch records, not only managers. It grants no new record access.
- The first release contains CRM work only: scheduled appraisals and actions with a planned time. Staff-created meetings, leave, unavailable time and private appointments wait for a later decision and data model.
- Day view defaults to the condensed 07:00–21:00 working window. A clear control expands it to the full 24 hours, and any appointments outside the condensed window are counted so they are never hidden silently. Staff can start the appropriate CRM appointment workflow from a time slot.
- On desktop, a permitted appointment can be dragged to another time, but Zayto shows a confirmation modal and makes no change until confirmed. A button-based Move appointment flow provides the accessible and phone alternative.
- Future CRM modules add their own entries, starting with viewings and later inspections and maintenance appointments. Each source remains authoritative for its own entry.
- Outlook/Microsoft 365 and Google Calendar synchronisation are deferred until the internal calendar works well. Provider choice, credentials, queues, retry/reconciliation and commercial terms are not assumed.

## Current foundation

- `getTodaysSchedule` already combines the signed-in person's scheduled appraisals and planned actions for one UK calendar day.
- Appraisals have a stored instant and assignee. Actions and landlord-lead tasks have an optional planned instant and assignee.
- Workspace isolation, branch scope, module permissions and database row-level security already protect the source records.
- The current schedule is deliberately personal and limited to today; it is not yet a range-based calendar service.
- Appraisals currently have a start time but no duration. Until a source record stores an approved duration or end time, the calendar will show it as a timed marker and will not invent a length.

## First usable milestone

### Navigation and views

- Add `Calendar` to the dashboard's top tabs, with URL-held state so shared links and Back/Forward work.
- Support Day, Week and Month views. Week is the default on desktop; Day/agenda is the default on small screens.
- Provide Today, previous and next controls, a clear displayed date range, and a date picker or equivalent direct jump.
- Keep filters in the URL: view, date, My/Branch scope, permitted branch and permitted colleague. Do not put names, addresses or other personal data in the URL.
- On mobile, use a chronological agenda/day presentation rather than squeezing a seven-column grid onto the screen.
- Month view prioritises legibility: show concise entries or daily counts and open a selected day, rather than overflowing cells.
- Day view provides a scrollable 07:00–21:00 timeline by default, with an explicit full-day expansion for early or late appointments. Empty slots and the page header provide clear entry points to add an appointment through its owning CRM workflow.

### Entries

- Scheduled appraisals show their time, type, assigned colleague and only the minimum client/property context the viewer is authorised to see.
- Open actions and landlord-lead next actions appear when they have a current planned time.
- Finished, cancelled or stale planned work does not appear as a live calendar entry.
- Each entry has a stable source reference and links to its owning record. Creation and rescheduling reuse the owning appraisal or action workflow rather than writing through a generic calendar mutation.
- Use a discriminated calendar-entry contract so later sources can be added deliberately, without copying their rows into a generic calendar table.

### Creating and moving appointments

- **Add appointment** first asks which supported CRM workflow owns the entry, such as a landlord appraisal or timed action, then collects or selects that workflow's required record details.
- Selecting an empty Day slot pre-fills its date and time; the header action remains available when the user is in another view.
- Desktop drag-and-drop proposes a new date/time for an existing entry. It never saves immediately: a modal shows the original and proposed time and requires confirmation.
- Selecting an entry exposes a **Move appointment** action using the same confirmation flow, for keyboard and touch users.
- Only entries the viewer may change are draggable or movable. Read-only entries remain visible without change controls.
- The production interaction waits for the owning service to succeed before moving the entry on screen, and shows a clear refusal if the record changed or access was lost.

### My and Branch calendars

- **My calendar** includes entries assigned to the current membership.
- **Branch calendar** includes entries from permitted branches and underlying modules, with optional colleague and branch filters.
- A branch-scoped membership can never select or infer another branch. A workspace-scoped membership may select one permitted branch or all branches.
- A source entry is absent when the viewer lacks its source permission, even if they can see the colleague or another entry at the same time.
- Colleague filters contain only memberships visible under the existing workspace/branch identity rules.
- The service derives the workspace and membership from the verified session. Browser-supplied workspace, branch, colleague and record identifiers are untrusted filters, never authority.

## Technical shape for milestone one

- Introduce a range-based calendar read service rather than stretching `getTodaysSchedule` into unrelated UI logic.
- Accept a checked date range and scope, with a bounded maximum range suitable for a six-week month view.
- Query independent authorised sources together, map them into the shared read contract, then order consistently by instant and stable id.
- Keep timestamps in UTC and derive day boundaries and labels in `Europe/London`, including daylight-saving transitions.
- Continue to use each source table, permission and RLS policy as the security boundary. No calendar table or migration is needed for the first milestone.
- Do not add a calendar UI dependency without inspecting the installed stack, prototyping the responsive interaction, and obtaining approval if a new package is justified.

## Later decisions

### Further calendar interactions

- Show scheduling clashes as useful warnings. Do not block double-booking without an explicit owner decision because agencies may intentionally overlap work or assign several attendees later.
- Decide and model duration/end time per source before rendering appointments as occupied blocks.

### Internal diary and availability

This requires a separate product decision and database/security design. Possible entries include meetings, training, leave and unavailable time. Before implementation decide:

- which roles may create or edit another person's entry;
- whether approval is needed for leave;
- which entries are private and whether branch viewers see only `Busy`;
- recurrence, attendees, reminders, audit history and retention;
- whether internal availability affects appointment booking or only informs it.

Do not place internal diary rows in `actions`; an action is work to complete, not a period of availability.

### External synchronisation

Run a provider discovery only after the internal diary is proven. Compare Microsoft 365/Outlook and Google using current official documentation and a real pilot need. Start with the smallest supportable direction, likely read-only subscription/export or one-way publishing, before considering two-way sync.

Two-way sync is not approved. It would need secure per-user consent/token storage, stable external identifiers, idempotency, webhook renewal, durable retries, deletion/conflict rules, visible sync health, reconciliation and protection against exposing private external event details to branch viewers. Queues are not currently installed.

## Delivery stages

1. **CAL-0 — interaction design (built):** the focused design-lab mock-up uses fictional data for desktop day/week/month and mobile agenda, with My/Branch, branch and colleague filters.
2. **CAL-1 — authorised read service (built and database-tested):** a bounded UK-time range parser aggregates scheduled appraisals and current planned actions while retaining source permissions, workspace scope, branch RLS and stable source links.
3. **CAL-2 — dashboard Calendar tab (built and browser-tested):** URL-driven views and filters, responsive desktop/mobile layouts, themes, source links, slot-based timed-action creation, the 07:00–21:00/full-day switch, tab icons, and a clear personal colour in Branch calendar are implemented.
4. **CAL-3 — confirmed rescheduling and checkpoint (built and tested):** appraisal and action moves use their owning services, keep a confirmation step, and provide a button alternative to drag-and-drop. The same-chat review found no access leak and prompted an explicit wrong-workspace denial test. Both focused database suites, browser coverage, `npm run check` and `npm run build` pass; run an independent `/review-security` before shipping.
5. **CAL-4 — internal diary, if approved (Opus design):** decide privacy and authority first, then review the new database model, RLS and audit design before migration approval.
6. **CAL-5 — external-calendar discovery, later:** verify a provider and a real customer requirement before choosing an integration architecture or spending money.

## Validation and security gate

- Unit tests: range parsing, UK labels/day boundaries, ordering, daylight-saving transitions and stale planned actions.
- Database integration tests: cross-workspace denial, cross-branch denial, My versus Branch scope, hidden source modules, hidden colleagues, suspended memberships and Read Only behaviour.
- Browser tests: day/week/month navigation, URL restoration, My/Branch filters, source links, keyboard use, loading/empty/error states, mobile agenda, no horizontal page overflow, and light/dark themes.
- Run targeted checks during CAL-1 and CAL-2. At CAL-3 run the affected unit and integration suites, browser coverage, `npm run check` and `npm run build`.
- Run `review-security` before the checkpoint because this introduces a new branch-wide aggregation path over customer and appointment data.

## Deliberate exclusions from the first milestone

- Standalone calendar events, recurring events, leave, working hours and availability rules.
- Email, SMS, push or calendar reminders.
- External calendars, `.ics` feeds, imports or sync.
- Automatic travel time, routing and appointment optimisation.
- Invented appointment durations, universal event editing, or a generic event table that duplicates source records.
- Applicant viewings until the applicant/property-enquiry/viewing module exists.

## Next decision gate

Run an independent security review, then ship CAL-0 through CAL-3 together. No migration, new dependency, provider connection or external spend was needed.
