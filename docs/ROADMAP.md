# Zayto product roadmap

This roadmap is the main source of truth for product direction, priority, sequencing, and current delivery status. Detailed architecture, permissions, data concepts, and workflows remain in their focused documents and must not be duplicated here.

Dates are not delivery promises. Phases express dependencies and useful outcomes. Status key: **Implemented**, **Partial**, **Next**, **Planned**, **Discovery**, **Deferred**, **Blocked**, **Unresolved**.

Priority key: **P0** security/integrity foundation or immediate blocker; **P1** essential to the chosen commercial MVP; **P2** important operational/commercial capability; **P3** later enhancement. Relative complexity is **Small**, **Medium**, **Large**, **Very large**, or **Unknown**; these labels compare scope and risk rather than estimating hours.

## Product direction

Zayto is intended to become a connected, cloud-based CRM for UK residential letting agents and property-management businesses. England is the first supported jurisdiction. The initial target is independent agencies with approximately one to three branches and straightforward residential lettings, including let-only, rent-collection, and fully-managed portfolios. Larger groups, specialist housing, devolved jurisdictions, commercial property, and residential sales remain later expansion areas.

The long-term journey is:

```text
Landlord lead → valuation → instruction → property onboarding → listing
  → applicant + property enquiry → viewing → offer → application → pre-tenancy → tenancy
  → rent / compliance / maintenance → ending → remarketing
```

People, organisations, properties, landlord leads, instructions, listings, applicants, property enquiries, viewings, offers, applications, and tenancies remain distinct connected records. Information should progress through the lifecycle without creating disconnected duplicates, while preserving history and access boundaries. ADR-031 defines the terminology: the current landlord workflow is not a generic applicant enquiry.

### Recommended first commercial proposition

The first paid proposition should be a **lettings pipeline and tenancy-progression product for selected small English agencies**, not yet a full replacement property-management CRM. It should take an agency from landlord/property onboarding through marketing, offer, application, and tenancy creation, with clear limitations.

This route can reach useful value earlier, but it is commercially credible only when it includes practical onboarding/import, useful communications, document handling, and a realistic publishing approach. Zayto must not claim to replace an agency's existing CRM until it can migrate required data, publish properties, support essential daily operations, export customer data, and meet production safeguards.

## Current position — 19 October 2026

### Implemented and verified

- Next.js App Router application with responsive light, dark, and system themes.
- Supabase Auth cookie sessions, development-only fictional quick sign-in, local Mailpit magic links, and a feature-flagged TOTP gate.
- Explicit workspace context, fixed staff roles, role-aware customer and Platform Owner shells.
- PostgreSQL/Prisma access foundation with verified TLS, least-privilege runtime/migration roles, forced RLS, workspace-aware constraints, and disposable-database security tests.
- Workspace, branch, membership, role, and branch-scope administration, including atomic combined role/scope changes and protected Account Owner rules.
- Customer details, Platform Owner customer/user directories, feature flags, and audited administration mutations.
- TypeScript, linting, formatting, unit tests, Playwright, production builds, and CI checks for code, build, and disposable-database integration.
- Import-ready modelling and data-portability principles recorded in ADR-028.

### Partial foundations

- MFA works but production enforcement, recovery, lost-device, and support procedures remain release work.
- Audit events exist for foundation mutations, but customer-facing audit-history screens and broader business-event coverage do not.
- Local email delivery exists; approved production email, durable delivery, templates, retries, and rate limits do not.
- CI does not yet run browser tests or a scheduled dependency audit.
- Customer users can be managed after they exist; invitation, claim, suspension/reactivation, and production notification flows remain incomplete.

### Partially implemented

- The people/organisation database and security foundation is applied. The branch-scoped application layer supports contact create, view, list/search, routine update, manager-only organisation identity changes, archive/reactivate, explainable duplicate candidates, and audit writing. A first responsive Contacts list, create form, record page, edit flow, duplicate warning, and archive/reactivate UI is implemented locally and passes static/build checks; its authenticated responsive/light-dark browser review was completed on 15 October 2026. Organisation-person linking (Chunk 3A) is implemented. Contact notes (Chunk 3B) are implemented, security-reviewed, and their migration was applied to shared development Supabase on 15 October 2026; automatic activity events are not yet implemented. Merge execution is designed but deferred (`.cursor/plans/contact-merge.md`); it should be revisited before CSV import or pilot onboarding.
- Properties and ownership (Chunk 4, `.cursor/plans/properties-and-ownership.md`) was built on 16 October 2026: the database foundation and an integrity-hardening migration (both applied to shared development Supabase after an independent security review), the services (create, update, archive, search, duplicate-address warnings, owners, lead landlord, branch transfers, notes), the Properties list, record and new-property screens, a Properties section on contact records, and a Manage owners dialog. The Edit property screen was added on 2026-10-21; the Transfer branch screen is still deferred (its service is built and tested). The Landlords area waits for Chunk 8. Fictional demo properties exist in the Oakfield sandbox workspace.
- The Chunk 5 landlord-lead foundation (originally labelled Enquiries) is implemented through 5C and now labelled **Landlord leads** for staff: secure database records, application services, quick capture, editable lead details, list/record workflows, appraisals, next actions, Overview attention panels, and settings lists. Its database migration is applied to shared development Supabase; unit, disposable-database, build, and non-mutating browser checks pass. The independent Chunk 5 checkpoint review ran on 2026-10-16 and its fixes (including a colleague-names database rule) are applied and tested; demo data exists; the handover is in `.cursor/plans/enquiries-appraisals-tasks.md`. Only the optional browser-write fixture decision remains.
- Chunk 6 landlord instructions and the connected onboarding journey are implemented and applied to shared development Supabase: atomic lead-to-instruction handover, versioned terms, landlords/main contact, agreement and ownership-check history, Ready-to-market checklist, manager exceptions, ending, and connected lead/property/instruction screens. The 6D security and milestone checkpoint passed on 2026-10-19. Chunk 7 was then closed as absorbed into this delivered record-based journey; Chunk 8 lists, search and connected-record work is next.
- Property compliance and landlord agreements (`.cursor/plans/property-compliance-and-landlord-agreements.md`, fictional data only): C1 private documents, C2 signed landlord agreements and C3 manual property compliance (applicability, evidence, status history for five areas) are applied to shared development Supabase. C4a adds a Compliance section with an Update dialog and evidence upload/download to the property. After the owner's workflow review on 2026-10-21 (`.cursor/plans/workflow-review-2026-10.md`, ADR-030 amended), the instruction and property pages use top tabs; the instruction shows the property's compliance (for information, updatable from there) and a next-step banner with Mark ready. C4b (dashboard compliance panel and attention flags) and the C5 combined checkpoint are next. The new Server Action and upload route change are reviewed at C5.

### Not implemented

- Listings, applicants, applicant requirements, property enquiries, viewings, offers, applications, tenancies, maintenance, compliance, or accounting records.
- Participant access, personal portal, resource grants, product entitlements, subscriptions, billing, or usage metering.
- Private document storage in use (the C1 foundation for uploading and downloading private files is built, tested, and set up on shared development Supabase with its private bucket on 2026-10-20, but not yet used by any screen), job processing, production monitoring, suitable backups/recovery, data-retention operations, or real customer migration.
- Live provider integrations or confirmed access to property portal APIs and testing facilities.

No real landlord, applicant, tenant, guarantor, banking, or financial data may be used until the relevant release controls in `SECURITY-RELEASE-CHECKLIST.md` are complete.

## Commercial milestones

| Stage                                    | Meaningful exit condition                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Technical proof of concept — current** | The secure multi-tenant foundation and fictional staff administration work; no real customer data or paid use.                                                                                        |
| **Private alpha**                        | Internal users can complete landlord/property/instruction onboarding and the connected records are usable on desktop and mobile with fictional data.                                                  |
| **Controlled pilot**                     | Selected agencies can use a defined instruction-to-tenancy-progression workflow with approved security, support, migration, publishing, communications, documents, backup, and recovery arrangements. |
| **Commercial MVP**                       | The lettings pipeline and tenancy-progression proposition is stable, supportable, exportable, billable, and honest about excluded property-management/accounting functions.                           |
| **Full-service CRM**                     | Zayto can replace an established lettings and property-management CRM for its supported customer segment, including essential operational management and proven migration.                            |

## Delivery principles

- Deliver usable end-to-end milestones rather than many unfinished modules.
- Use the modular monolith and existing access patterns; do not introduce microservices, a generic workflow engine, or speculative integration infrastructure.
- Build the smallest maintainable capability needed by the current journey, with targeted testing proportionate to risk.
- Every workspace-owned repository and mutation must enforce verified workspace scope in application code and RLS, with cross-workspace tests. Branch and participant restrictions require their own denial tests.
- Preserve history, source provenance, and meaningful external identifiers from the first CRM tables. Add import functionality only after each destination model is stable.
- Do not invent legal, referencing, AML, Right to Rent, insurance, deposit, notice, or accounting rules. Verify current official requirements immediately before building the affected feature.
- Do not describe an external integration as available until access, commercial terms, implementation, failure handling, and reconciliation are verified.
- Keep financial record-keeping separate from a future client-money ledger. Do not handle real client funds through an unproven system.

## Development phases

### Phase 0 — Foundation checkpoint

**Status:** substantially implemented for fictional proof-of-concept data.

Do not extend this into another infrastructure programme. Invitations, production email, recovery, rate limiting, backups, monitoring, support access, browser CI, and readable audit history should be delivered when they become dependencies or pilot-readiness gates. They do not block starting an internal staff-only CRM slice with fictional data.

**Exit for product development:** achieved. **Exit for real customer data:** not achieved.

### Phase 1 — Landlords, properties, ownership, and instructions

**Status:** Core records and the connected journey through Ready to market are implemented and checkpointed. Chunk 8A Instructions and 8B Landlords worklists and 8C connected history (contact and property lead/instruction history, server-backed landlord-picker search) are built and tested. List completion (8D: paged Contacts, Properties and Landlord leads lists) is built and tested. The top-bar workspace search (8E) is built and tested; the dashboard onboarding panel (8F) is built, and the 8G checkpoint and independent review passed with fixes on 2026-10-20. Chunk 9 hardening (including query plans at realistic volumes and search rate limiting) precedes the Phase 1 hardening gate.

Since C2 (2026-10-20, fictional data) the proof of concept stores an uploaded, externally signed agreement PDF linked to the terms version, material terms and landlords current at upload, and Ready to market needs one that still matches; the manager agreement exception is removed. Before real instructions, the landlord-agreement and compliance discovery in `.cursor/plans/property-compliance-and-landlord-agreements.md` must validate the signed-agreement boundary, remove or narrow the generic manager exception, and link any real signature to the exact commercial terms agreed.

**Owner decision (2026-10-20):** the proof of concept and initial MVP use fictional data only. Provisional compliance and agreement workflows may therefore be built for owner product review, with no legal-compliance claim, production provider or real operational data. Independent England lettings legal/compliance validation remains a release gate before any real agency relies on these workflows.

The fictional agency is modelled as holding client money so the proof of concept exercises CMP membership, certificate and disclosure states. This does not bring actual receipt, banking, reconciliation, deposit handling or client accounting into scope.

For fictional landlord agreements, every named landlord party must sign unless another signer has explicitly recorded authority to bind that party. The main day-to-day contact does not gain signing authority from that role alone.

The first agreement slice will preserve an externally signed uploaded agreement. The owner's preferred later direction is Zayto-owned electronic signing through the landlord portal; that is not yet an approved architecture and requires a separate security/evidential comparison with specialist providers before implementation.

Completed agreement PDFs and their exact terms snapshots are immutable. Corrections and material changes create linked replacements or variations without overwriting the original evidence.

A later change to service, fees, VAT treatment, landlord parties or allocated responsibilities automatically marks **Agreement update required** and returns a Ready-to-market instruction to Onboarding until the linked replacement or variation is completed.

When the evidence-backed agreement workflow replaces the proof-of-concept milestones, remove the manager override for a missing or outdated signed agreement. The ownership-check exception remains a separate decision.

ADR-008 now approves private Supabase Storage in the existing London project for controlled fictional PDFs. Downloads pass through Zayto so access is rechecked and audited without exposing a Supabase URL to the browser. Malware-scanning infrastructure is deferred for the fictional MVP, so arbitrary, untrusted and real uploads remain blocked until scanning/quarantine is implemented and reviewed. The narrow fictional upload still requires the documented storage layout, access, cleanup and security-test decisions.

Controlled fictional test PDFs are disposable and re-uploadable; the MVP adds no separate file backup/restore system. Real documents remain gated on an approved paid service level, backup/recovery and reconciliation design, and a successful recovery test.

The first fictional compliance register covers EPC/MEES, Gas safety record (CP12), electrical safety/EICR, smoke and carbon-monoxide alarms, and property licensing. It is explicitly an initial evidence set rather than an exhaustive compliance checklist.

Each area keeps applicability separate from evidence status. **Does not apply** cannot be used as a missing-document state, and uploading evidence does not make an item satisfactory when remedial action remains open.

**Does not apply** and **Needs specialist review** require a written reason, actor and date, with optional supporting evidence; later changes preserve the assessment history.

Routine compliance administration is not manager-only: Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may update applicability and evidence within scope, including **Does not apply**. Accounts and Read Only cannot make changes.

All active staff who can read the property within scope may view its compliance statuses and supporting documents, including Accounts and Read Only. External participants receive no access by default.

Fictional compliance evidence accepts validated PDF, JPEG and PNG files up to 10 MB each; agreement files remain PDF-only. HEIC and other formats wait, and arbitrary/untrusted files remain blocked until scanning/quarantine is implemented.

A compliance item may hold several immutable evidence files/events—for example an EICR and remedial confirmation—while identifying the evidence currently relied upon and preserving older or superseded evidence as history.

Staff enter inspection, expiry and next-review dates shown by the evidence. Zayto may calculate operational reminders from those dates but does not calculate or present an unvalidated statutory deadline.

The fictional MVP shows in-app attention 60, 30 and 7 days before the entered date and then overdue. It sends no email/SMS, and completing an attention item never changes evidence or proves the underlying work occurred.

Overdue CP12, EICR or applicable licence evidence becomes a prominent red **critical compliance issue** across the property, active tenancy and staff worklists. It remains visible until valid replacement evidence is recorded and cannot be cleared by completing or dismissing a reminder.

Named responsibility and assignment of property-management tasks are deferred. In the current slice, expiring compliance remains visible through the property record and shared compliance worklist within existing workspace/branch scope; individual assignment belongs to later property-management workflow design.

CP12, EICR and alarm gaps remain visible warnings during listing/content preparation and do not by themselves block **Content ready**. Where applicable, CP12 and EICR evidence/action becomes non-overridable at **Ready for occupation**. The tenancy-specific alarm check is expected at move-in, but Zayto still allows staff to record that occupation actually occurred, subject to independent validation before real use.

The fictional workflow blocks **Ready to advertise** while the EPC position is **Not assessed** or required evidence is missing. The gate requires reviewed EPC evidence, a recorded commissioned/awaiting state, or a reasoned **Does not apply** assessment; independent review must validate the exact legal rule before real use.

An EPC rated **F or G** also blocks **Ready to advertise** until valid exemption evidence is reviewed or specialist review is resolved. No staff role may override this fictional gate, and independent review must validate the exact restriction before real use.

An unassessed property-licensing position does not universally block **Ready to advertise**. Licensing may remain visible as attention, but the workflow must not force agencies outside relevant licensing areas to complete a repetitive assessment for every property.

Licensing remains a warning during advertising. Once staff record that it **Applies**, missing or unresolved licence evidence becomes a non-overridable **Ready for occupation** blocker; pending applications and scheme-specific exceptions require specialist review rather than an automatic pass.

Authorised staff record licensing applicability manually in the fictional MVP. Postcode or council-scheme automation is deferred until reliable official data, scheme rules and update responsibilities have been reviewed and a separate implementation is approved.

Alarm installation evidence and the tenancy-specific operational check are separate records. A property may show **Ready for occupation** beforehand. **Confirm move-in** remains available as a factual event even when the dated check evidence is missing or records a failure.

Missing or failed start-day alarm evidence creates an urgent, non-dismissible remedial issue with a staff-entered operational target date. Zayto does not label that date as a statutory deadline and keeps the property/tenancy visibly flagged until successful repair or re-check evidence is recorded.

The alarm exception does not weaken the other move-in gates. Staff cannot **Confirm move-in** without applicable current CP12 evidence, satisfactory EICR/remedial evidence, and resolved licence evidence where licensing **Applies**. Those items are hard blocks with no staff override.

Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may upload that alarm-check evidence and **Confirm move-in** within verified scope. Accounts and Read Only may view permitted records but cannot perform either action. The future implementation must use a narrow tenancy/move-in permission rather than an unrelated broad permission.

**Approved fictional-data build order (2026-10-20):** complete the design/security preflight; build the reusable private-document foundation; add externally signed landlord-terms evidence to the existing instruction journey; add the manual five-area property compliance foundation; add the property compliance screens, shared worklist and 60/30/7/overdue attention; then run one combined security and quality checkpoint. Listings, tenancy/move-in gates, active-tenancy screens, individual property-management task assignment, portal/native e-signing, provider automation and real-data controls are explicitly deferred. The detailed handoff and gates are in `.cursor/plans/property-compliance-and-landlord-agreements.md`.

An authorised agency user can create and manage an individual or organisation landlord, add a property, record time-aware ownership, create an agency instruction, record the selected service and agreed commercial summary, and navigate/search the connected history.

Minimum scope:

- Individual and organisation contact records with practical contact details and reusable role relationships.
- Landlord capacity expressed through relationships, not a duplicated global person type.
- UK property record, address, core characteristics, status, and responsible branch.
- Multiple owners and historical/effective ownership relationships.
- Agency instruction separate from legal ownership and separate from a future listing.
- Let-only, rent-collection, and fully-managed service selection, instruction status, key dates, and versioned agreed fee summary without creating accounting entries.
- Basic notes/activity history and useful contact/property search.
- Source provenance and external identifiers needed for later migration.
- Narrow permissions, audit, workspace/branch scoping, and cross-tenant tests.
- A document register; private file upload joins the milestone only after the storage decision and safeguards are approved.

Deliberately excluded:

- Lead/valuation automation beyond the minimum instruction history.
- Listings, portals, applicants, viewings, offers, tenancies, rent, accounting, participant portals, custom workflows, and regulated AML outcomes.
- A full data-import tool; only migration-ready destination models are required now.

Acceptance criteria:

- A fictional agency can complete the connected landlord → ownership → property → instruction journey without re-entering the same party or property.
- Joint and organisation ownership are supported without conflating the legal owner with the instructing contact.
- Records can be found, viewed, edited, archived where appropriate, and followed through related-record links.
- Another workspace and an out-of-scope branch cannot read or mutate the records by changing identifiers.
- Important mutations are audited and concurrent updates do not silently overwrite protected state.
- Relevant unit, disposable-database isolation/invariant, browser, and production-build checks pass at the milestone checkpoint.

### Phase 2 — Marketing, applicants, viewings, and offers

**Status:** Planned. **First marketing build designed and owner-approved on 2026-10-21** (`.cursor/plans/marketing-m0-design.md`, ADR-034): a listing from Draft through Content ready to an **internal** Ready to advertise with photos and floorplans, chunks M1 to M6, nothing published; AI copy, EPC lookup, a website feed and portals follow separately. M1 to M5 are built and tested (2026-10-22): listings, content versions and history, photos and floorplans, applied to shared development Supabase; M6 adds the Media tab and the Ready to advertise button, so staff can take a listing to an internal Ready to advertise on screen; the combined M3 to M6 checkpoint review passed Amber with its fixes applied (2026-10-22). Gallery image cost (thumbnails or caching) is recorded for later.

Add listings that are separate from properties/instructions, ordered media, asking rent and availability, internal publication states, applicants/households, property enquiries, matching, an internal appointment calendar, viewings/feedback, offers, and landlord decisions.

The milestone is an instructed property progressing from listing preparation to an accepted offer. Website-feed and property-portal feasibility discovery must be complete before promising external publishing. Marketing and offer behaviour must reflect current England rental-bidding, advertised-rent, fees, and rent-in-advance rules.

Before the listing foundation migration, approve the separate lifecycle meanings for **Content ready**, **Ready to advertise**, **Ready for tenancy agreement** and **Ready for occupation**. Listings may display CP12, EICR, licensing, MEES and other evidence attention states but do not own reusable compliance evidence or imply that a marketed property is ready for occupation. Manual evidence and official-source links come before provider automation.

Basic CSV import/export for stable Phase 1 records should begin during this phase so pilot agencies are not forced to recreate core data manually.

### Phase 3 — Applications, pre-tenancy, and tenancy creation

**Status:** Planned.

Add application households, applicant/guarantor/occupant relationships, purpose-bound invitations and participations, private submissions, task/checklist progression, provider-neutral referencing/identity/Right to Rent status placeholders, documents, agreement/signature integration, deposit-arrangement records, move-in tasks, and tenancy activation.

The milestone is an accepted offer becoming an active tenancy without recreating people or property data. Sensitive information remains private to the relevant participant by default. Detailed regulated decisions require separate approved specifications.

This phase introduces the future **Ready for tenancy agreement**, **Ready for occupation** and **Confirm move-in** stages. Current gas-safety evidence, electrical evidence/remedial work, applicable licensing/MEES position, document delivery and applicant-private checks belong at their validated pre-move-in stages. CP12, satisfactory EICR/remedial evidence and applicable resolved licensing remain hard **Confirm move-in** prerequisites. The dated start-day alarm check belongs to move-in, but a missing or failed result creates urgent unresolved work instead of blocking that factual event. These are not listing blockers.

### Phase 4 — Core property management

**Status:** Planned.

Add active tenancy operations, rent schedules and recorded-payment views, compliance records/reminders, inspections, maintenance, contractors, rent-review workflows, tenancy changes, notices/endings, check-out, keys, and remarketing. Introduce limited tenant and landlord portal capabilities where they complete a real workflow.

The milestone is reliable day-to-day management of an active tenancy. Basic rent administration must name its authoritative source and must not be represented as full client accounting.

Recurring CP12 checks, EICR next-inspection dates, licence/exemption/certificate expiry, reported alarm failures, repairs and risk reviews become evidence-backed management work. Completing a reminder never counts as proof that the underlying check or remedial work happened.

### Phase 5 — Controlled pilot and commercial readiness

**Status:** Planned checkpoint; prerequisites are delivered throughout earlier phases.

Complete approved production email, invitations, MFA enforcement/recovery, rate limiting, private UK document storage, backups and restore rehearsal, monitoring, support processes, retention/export/erasure operations, customer onboarding, proven import/reconciliation, operational reporting, browser/dependency CI, billing/entitlements appropriate to the proposition, and user/support documentation.

The milestone is a supported, narrowly defined pilot using real agency data under agreed operational and security safeguards.

### Phase 6 — Expanded commercial capability

**Status:** Deferred until pilot evidence.

Potential work includes broader portal publishing, richer landlord/tenant portals, communications, shared inbox, automation, reporting, migration adapters, calendar integrations, advanced maintenance, contractor access, multi-branch controls, and accounting/payment integrations. Prioritise demonstrated customer demand rather than competitor feature parity.

### Phase 7 — Full client accounting and advanced management

**Status:** Deferred and separately approval-gated.

Assess integration before deciding to build a native ledger. A native solution would require independently validated double-entry design, reconciliation, corrections, opening balances, accounting periods, landlord/contractor payments and statements, financial audit controls, client-money protection requirements, and operational assurance. Zayto must not hold or move real client funds before this boundary is approved and proven.

## Product module register

Each identifier is stable for roadmap discussions; it is not a database or ticket identifier.

### Core records and lettings CRM

| ID        | Module and business purpose                                                                                         | First useful milestone / acceptance                                                                                                                                                     | Later capability                                                                                                   | Phase / status / priority / complexity           | Dependencies and principal risks                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `CRM-01`  | **Landlord leads and instructions** — win and onboard landlord business.                                            | Capture and progress a landlord lead through appraisal, then create a distinct instruction with service, branch, dates, terms, parties/property, and history.                           | Signed terms-of-business snapshots/evidence, variations, richer negotiations, reporting and onboarding automation. | Phase 1 / Built, evidence discovery / P1 / Large | Core journey is built; real agreements depend on legal validation and private documents.        |
| `CORE-01` | **People, organisations, and contacts** — one workspace-specific contact foundation for several roles.              | Create/search/edit individuals and organisations; hold multiple practical contacts and historical relationships without cross-workspace leakage.                                        | Duplicate resolution, richer preferences, representatives, custom fields, identity links.                          | Phase 1 / Built / P1 / Large                     | Merge is deferred; landlord worklist and connected summaries are Chunk 8.                       |
| `CORE-02` | **Property and ownership** — preserve the physical property independently of instructions, listings, and tenancies. | Manage a UK property, responsible branch, status, characteristics, multiple owners, a lead landlord contact, and effective ownership history; ownership percentages are not required.   | Keys, meters, amenities, condition history, richer licensing and portfolio structures.                             | Phase 1 / Built / P1 / Large                     | Edit/transfer screens and list completion remain; services are built and tested.                |
| `CRM-02`  | **Marketing and advertising** — prepare and publish accurate rental listings.                                       | Create a listing from an instruction, manage rent, availability, description, ordered media, approval and internal publication status; never claim an unconfirmed external publication. | Website feeds, portals, retries, per-channel IDs/status/history, brochures.                                        | Phase 2 / Discovery / P1 / Large                 | Lifecycle/compliance boundary, documents/media, legal review, provider access and durable jobs. |
| `CRM-03`  | **Applicants and property enquiries** — manage demand without duplicating people.                                   | One applicant/household can hold reusable requirements and create distinct property enquiries across several listings, with source, progress, ownership, and communication history.     | Saved searches, richer matching, self-service enquiry and marketing preferences.                                   | Phase 2 / Planned / P1 / Large                   | People, listings, communications, household privacy; collect only necessary sensitive data.     |
| `CRM-04`  | **Viewings and internal calendar** — coordinate appointments and follow-up.                                         | Staff can schedule/reschedule/cancel viewings and valuations, record attendance/feedback, and see authorised team calendars.                                                            | Self-booking, block viewings, reminders, Google/Microsoft two-way sync.                                            | Phase 2 / Planned / P1 / Medium                  | Listings, applicants, tasks, communications; time zones, concurrency, external sync.            |
| `CRM-05`  | **Offers and negotiation** — reach a documented landlord decision.                                                  | Record conditions, proposed rent/date, household, recommendation and accepted/rejected/withdrawn history; accepted offer remains distinct from tenancy.                                 | Comparisons, portal decisions, richer notifications and analytics.                                                 | Phase 2 / Planned / P1 / Medium                  | Applicants, listings, landlord access; current rental-bidding and advertised-rent rules.        |
| `PRE-01`  | **Application and pre-tenancy** — progress an accepted offer safely into occupation.                                | Build a household application, invite each party, track private tasks/documents/statuses, prepare agreement/deposit/move-in records, and activate a tenancy without duplicate people.   | Configurable workflows and approved referencing, identity, e-sign, deposit and inventory integrations.             | Phase 3 / Planned / P1 / Very large              | Participants/grants, documents, communications, providers, written regulated rules.             |

### Property management and money

| ID       | Module and business purpose                                                                            | First useful milestone / acceptance                                                                                                                                 | Later capability                                                                                  | Phase / status / priority / complexity | Dependencies and principal risks                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `PM-01`  | **Active tenancy management** — preserve the tenancy, parties, terms, changes and operational history. | View and manage active/historic tenancies, parties, rent terms, permitted documents, status and audited changes under the applicable tenancy regime.                | Variations, tenant changes, specialised tenancy types and richer workflow.                        | Phase 4 / Planned / P2 / Very large    | Pre-tenancy, people/property, legal verification, documents; avoid fixed-term assumptions.        |
| `FIN-01` | **Basic rent administration** — show expected and recorded payments without pretending to be a ledger. | Produce rent schedules, record/import payments, show balances/arrears and identify the authoritative source.                                                        | Automated reminders, payment provider feeds and reconciliation hand-off.                          | Phase 4 / Planned / P2 / Large         | Tenancy, communications, financial accuracy; must remain clearly separate from client accounting. |
| `FIN-02` | **Full client accounting** — account for money held and owed to clients.                               | No MVP commitment. Proceed only after a separately approved build-versus-integrate decision and validated financial design.                                         | Ledger, allocation, bank reconciliation, fees, invoices, statements, disbursements and reporting. | Phase 7 / Deferred / P3 / Very large   | Client-money rules, banking, specialists, reconciliation, security and operational controls.      |
| `PM-02`  | **Maintenance and contractors** — manage property issues to completion.                                | Log a tenant/staff issue, assess urgency, obtain approval, assign a contractor, track appointment/work/completion and keep property/tenancy history.                | Quotes, approval limits, recurring work, invoices, performance reporting and contractor portal.   | Phase 4 / Planned / P2 / Large         | Portals, communications, files, tasks; emergency wording and financial approval rules.            |
| `PM-03`  | **Compliance and inspections** — track evidence, dates, responsibility and follow-up.                  | Record versioned requirement types, applicability, evidence, dates, responsibility, remedial actions and reminders without claiming legal compliance automatically. | Pre-tenancy/move-in gates, dashboards, provider data, mobile inspections and jurisdiction packs.  | Phase 2–4 / Discovery / P1 / Large     | Legal validation, property/tasks/files, current official/local rules; law versus agency policy.   |
| `PM-04`  | **Notices, endings, and remarketing** — close tenancies without losing history.                        | Record the applicable ending route, dates/documents, check-out, keys, final operational tasks and return the property to a remarketing-ready state.                 | Deposit dispute and possession-case integrations, richer final accounting.                        | Phase 4 / Planned / P2 / Large         | Tenancy, compliance, maintenance, finance; current legislation and prescribed forms.              |

### External experiences

| ID          | Module and business purpose                                                      | First useful milestone / acceptance                                                                                | Later capability                                                             | Phase / status / priority / complexity | Dependencies and principal risks                                                  |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `PORTAL-01` | **Landlord portal** — give owners only explicitly permitted information/actions. | A named landlord can securely view selected property/offer/document information and complete one approval journey. | Portfolio, statements, maintenance, inspections, messages and notifications. | Phase 3–4 / Planned / P2 / Large       | Participations/grants, identity, documents; joint-owner field-level permissions.  |
| `PORTAL-02` | **Tenant portal** — provide a mobile-first tenancy service channel.              | A tenant can securely view their tenancy/documents and submit/track a maintenance request.                         | Rent/payment views, appointments, messages, notices and move-out.            | Phase 4 / Planned / P2 / Large         | Participations, tenancy, maintenance, documents; continuing access and retention. |
| `PORTAL-03` | **Contractor access** — let contractors service only assigned work.              | A contractor can view an assigned work order and submit status, appointment and completion evidence.               | Quotes, invoices, performance history and richer scheduling.                 | Phase 6 / Deferred / P3 / Medium       | Maintenance, invitations, files; least-privilege and commercially sensitive data. |

## Shared capability register

| ID          | Capability                    | First useful milestone / acceptance                                                                                                                                                                         | Phase / status / priority / complexity       | Notes and risks                                                                                                                                                              |
| ----------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHARED-01` | Tasks and activity            | Assign basic dated tasks and retain record activity history in Phase 1.                                                                                                                                     | Phase 1 / Next / P1 / Medium                 | No visual automation builder; add recurrence/escalation only when needed.                                                                                                    |
| `SHARED-02` | Communications                | Send approved transactional messages and retain safe communication history before pilot.                                                                                                                    | Phase 2–5 / Planned / P1 / Large             | Production provider, consent/preferences, delivery/retry and data residency remain blockers.                                                                                 |
| `SHARED-03` | Documents and signatures      | Private, classified, authorised upload/download with record links and audit; first preserve externally signed landlord terms, then assess Zayto-owned landlord-portal signing against specialist providers. | Phase 1–3 / C1 foundation built / P1 / Large | Fictional-data foundation built 2026-10-20 (not yet on shared Supabase); malware scanning, retention, identity, execution evidence and short-lived delivery must be decided. |
| `SHARED-04` | Search and navigation         | Search contacts/properties/instructions with useful filters and connected navigation in Phase 1.                                                                                                            | Phase 1 / Next / P1 / Medium                 | Begin with indexed database search; do not add search infrastructure prematurely.                                                                                            |
| `SHARED-05` | Reporting                     | Provide simple operational counts/pipelines for delivered modules.                                                                                                                                          | Phase 2 onward / Planned / P2 / Medium       | Reports inherit the same workspace/branch/field access as source records.                                                                                                    |
| `SHARED-06` | Agency configuration          | Manage account, branches, users/access, service offerings and essential preferences.                                                                                                                        | Phase 1–5 / Partial / P1 / Medium            | Access foundation exists; invitations, lifecycle and module preferences remain.                                                                                              |
| `SHARED-07` | SaaS billing and entitlements | Manually grant modules for alpha; add supportable subscriptions/limits before commercial MVP.                                                                                                               | Phase 3–5 / Planned / P1 / Large             | Prices/provider unresolved; roles never substitute for entitlements.                                                                                                         |
| `SHARED-08` | Security and operations       | Meet the release checklist appropriate to each milestone.                                                                                                                                                   | Continuous / Partial / P0 / Large            | MFA/recovery, rate limits, backups, monitoring, privacy operations and incident response.                                                                                    |
| `SHARED-09` | Migration and export          | Import stable core records from mapped CSV with preview/errors/reconciliation and export usable customer data before pilot dependency demands it.                                                           | Phase 2–5 / Planned / P1 / Very large        | Customer authority, duplicate handling, provenance, documents and source quality.                                                                                            |
| `SHARED-10` | Integrations and durable jobs | Implement one approved capability adapter with idempotent attempts, visible failures and safe retry when the first real integration requires it.                                                            | Phase 2 onward / Discovery / P1 / Large      | Queue choice remains unresolved; avoid a generic framework without a provider.                                                                                               |

## Parallel discovery workstreams

These are short investigations producing a recorded recommendation, dependency list, and next action. They do not authorise implementation or provider spending.

1. **Property portals:** confirm Rightmove, Zoopla, and OnTheMarket access, specifications, certification/testing, commercial terms, and whether early customers can supply credentials.
2. **Agency website publishing:** define a secure, documented listing feed/API so Zayto need not build a website CMS.
3. **Private files and signing:** the Supabase London/private-bucket direction is approved for controlled fictional PDFs; finish retention, authorised delivery, backup and access testing before that narrow upload, and scanning/quarantine before arbitrary or real uploads; then assess Zayto-owned portal signing against e-sign providers.
4. **Data migration:** collect representative authorised export samples and define the minimum CSV templates, identifiers, relationship mapping, preview, correction, and reconciliation needed for the target segment.
5. **Referencing and compliance providers:** record provider-neutral data/status needs and commercial blockers without designing pass/fail rules.
6. **Payments and accounting:** decide whether the initial product records external payment facts, integrates a provider, or later builds a ledger; keep client money outside Zayto until approved.
7. **Landlord agreements and property compliance:** validate the terms-of-business/signature boundary and the staged England evidence matrix (marketing, tenancy agreement, occupation and in-tenancy), starting with manual evidence rather than provider automation.

## England regulatory guardrails

The roadmap records dependencies, not legal advice. Before implementing a regulated workflow, verify legislation and current official guidance and record what is law, guidance, announced future change, or optional agency policy.

The current planning baseline is:

- Phase 1 of the Renters' Rights Act 2025 came into force on 1 May 2026, including the assured-periodic tenancy framework, abolition of Section 21 for the relevant private rented sector, possession-ground reforms, rental-bidding restrictions, and related enforcement changes. Later phases remain staged. See the [official implementation roadmap](https://www.gov.uk/government/publications/renters-rights-act-2025-implementation-roadmap/implementing-the-renters-rights-act-2025-our-roadmap-for-reforming-the-private-rented-sector).
- Current official guidance also affects written tenancy information, advertised rent/rental bidding, and when/how much rent in advance may be requested. These rules must be verified when listings, offers, applications, agreements, rent, and notices are designed.
- An English letting/property-management agent that holds client money must belong to an approved client-money protection scheme. This is one reason full accounting remains separately gated. See [GOV.UK client money protection guidance](https://www.gov.uk/client-money-protection-scheme-property-agents).
- Tenant Fees Act, Right to Rent, deposit protection, housing safety, licensing, data protection, AML where applicable, advertising, redress, and local-authority requirements each need focused verification at the relevant feature.

Do not hard-code one tenancy regime for every historic record or UK jurisdiction. Store applicable jurisdiction, dates, status, and rule/version references where the approved workflow requires them.

## Important unresolved decisions

| Decision                            | Recommended default until decided                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial paying customer             | Small English letting agencies, initially one to three branches, with conventional residential lettings.                                                     |
| First paid proposition              | A clearly bounded lettings pipeline and tenancy-progression product; do not market it as a full replacement CRM.                                             |
| Exact Phase 1 people model          | Separate human and organisation records behind narrow shared contact contracts; roles come from relationships. Approve before migration.                     |
| Instruction services and fee fields | Support let-only and managed services with a small agreed summary; do not design accounting or every fee variation yet.                                      |
| Property portal route               | Investigate provider access now; retain internal listing management and a website feed as useful outcomes even if direct portals are blocked.                |
| Private file storage                | Prefer the existing London Supabase project if its storage controls meet the approved requirements; confirm through a separate decision.                     |
| Workflow customisation              | Fixed, well-designed workflows with limited configuration first; no general workflow builder.                                                                |
| Basic rent authority                | Treat Zayto as a recorder/display unless and until an approved payment/accounting integration or ledger becomes authoritative.                               |
| Accounting approach                 | Integrate before building unless customer evidence and specialist review justify a native ledger.                                                            |
| Initial specialist exclusions       | Defer student/HMO/build-to-rent/commercial and devolved-jurisdiction workflows unless a pilot explicitly requires one.                                       |
| Pilot release threshold             | Complete the relevant security checklist, support boundary, migration/reconciliation, publishing position, backups/recovery, and honest product limitations. |

## Immediate next development milestone

**Outcome:** a usable landlord, property, ownership, and agency-instruction workflow for authorised staff using fictional data.

The confirmed detailed requirements, proposed data relationships, reviewed delivery chunks, and remaining approval gates are maintained in `.cursor/plans/landlord-property-onboarding.md`.

### First implementation tasks, ordered by dependency and value

1. Confirm the Phase 1 user journey, terminology, minimum fields, instruction statuses, service choices, and deliberate exclusions with the owner; record only decisions needed now.
2. Approve the narrow ownership boundaries for individual contacts, organisations, properties, ownership relationships, instructions, notes/activity, and external-source references.
3. Add Phase 1 permissions and design the workspace/branch access matrix before exposing any screens.
4. Add the first migration for contacts/organisations with workspace-aware keys, RLS, provenance, lifecycle states, and focused cross-workspace tests.
5. Build contact/organisation create, view, edit, archive, and search paths using existing UI/application patterns.
6. Add property and historical ownership models with workspace-aware relationships, RLS, validation, and isolation tests.
7. Build property and ownership create/view/edit flows with connected landlord/property navigation.
8. **Complete:** instructions and service selection are separate from ownership and future listings; their schema, security, services and screens passed the Chunk 6 checkpoint.
9. **In progress — Chunk 8:** the Instructions and Landlords worklists (8A–8B) are pushed. Connected history and landlord-picker search (8C1–8C3) are built and tested; the independent review of 8A–8C reads and the picker search action is due before anything is shown outside the project. The Contacts, Properties and Landlord leads lists are now paged (8D). The top-bar workspace search (8E) is built. The dashboard Instruction onboarding panel (8F) is built and the 8G checkpoint passed with fixes. The dashboard was reorganised on 2026-10-20 into Home plus area tabs (Landlords & instructions, then placeholders for Marketing, Pre-tenancy and Management; see `.cursor/plans/dashboard-and-actions.md`). Chunk 9 hardening is under way: 9A (query speed at realistic volume, JIT off) and 9B (failure screens, audit-trail check, keyboard and screen-reader basics) are built; 9C (migrations rebuild cleanly, with a schema drift guard) and 9D are done: the private alpha is ready for internal staff with fictional data on local and demo environments; hosted behaviour, the alpha's deployment and pilot-readiness items remain (see the Chunk 9 section of `.cursor/plans/landlord-property-onboarding.md`). Contacts is now an expandable menu group (All contacts, Landlords); applicants and tenants join it when built. Contacts remains the shared record foundation, but its top-level navigation entry is temporary: remove it when 8E search can reliably find authorised contacts without landlord relationships.
10. Complete ADR-008's remaining upload-security decisions, then add the approved fictional upload/register slice or explicitly carry it as the next dependency; run one milestone verification checkpoint.

Each item should be a focused Codex task. Database migrations, shared-environment changes, paid services, provider connections, deployment, and pushing remain their normal approval gates.

## Explicit blockers and non-goals

- No real customer data before the applicable security, privacy, backup, recovery, support, and operational controls are evidenced.
- No claim of portal publication, provider verification, signature, payment, deposit registration, legal compliance, or message delivery without a real verified action.
- No invented rules for referencing, AML/KYC, Right to Rent, insurance, deposits, notices, accounting, or retention.
- No assumption of Blinc or another supplier's software, data, API, documents, credentials, or commercial relationship.
- No microservices, universal workflow engine, full agency website CMS, speculative queue, or generic integration framework without a current product need.
- No full client accounting or handling of real client funds without separate approval and appropriate independent validation.
