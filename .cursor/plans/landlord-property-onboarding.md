# Landlord and property onboarding

**Status:** Chunks 1 to 6 are built and checkpointed; the Chunk 6D review and four minor follow-ups were pushed on 2026-10-19. The owner approved closing Chunk 7 as absorbed and the revised Chunk 8 boundary and slices. Chunks 8A and 8B were committed and pushed in `828ebc8` and `5741ba6`; Chunk 8C is committed (`685f2a2`, `904480c`); 8D (Contacts, Properties and Landlord leads lists) is built and tested locally, not committed. This document does not by itself authorise a shared database change, document storage, integration, deployment, or push.

## Outcome and first release boundary

Build the first connected lettings workflow for independent English agencies with approximately one to three branches. Staff can capture a landlord lead quickly, develop it through appraisal, create reusable landlord and property records, record ownership and commercial instruction terms, and prepare the property for marketing without duplicating people or properties.

This milestone ends at **Ready to market**. Marketing content, photographs, floor plans, publishing, applicants, offers, pre-tenancy, active tenancies, management, and client accounting remain later slices. The first commercial proposition extends through tenancy creation, but it will be delivered over several reviewed milestones.

## Confirmed working conventions

- Deliver this as a multi-session, multi-day build in small reviewable chunks.
- End each chunk with a concise record of what is done, tested, unverified, and next.
- Use targeted checks while iterating; run broader relevant checks at security/data checkpoints and milestone completion.
- Do not start a new chunk when the remaining session capacity is unlikely to support implementation, checking, and a clean handover.
- Update this plan when owner feedback changes the workflow; do not silently preserve superseded requirements.
- Use fictional data until the security and release gates permit real customer data.

## Confirmed product decisions

### Records and history

- One workspace-specific person record can hold several roles over time, including landlord, applicant, tenant, guarantor, contractor, or staff relationship. Role-specific data and permissions remain separate.
- Organisations support limited companies, LLPs, partnerships, trusts, charities, and an `other` category.
- A person has structured title, first name, middle names, and surname. First name and surname are initially required; the other fields are optional. Preferred name is not collected in this slice.
- An organisation has a legal name, optional trading name, applicable registration number, and optional VAT number. Registration details are required only where applicable to its type.
- Organisations can link several people, with an optional primary contact. A person may be linked to several organisations.
- People and organisations can hold several telephone numbers and email addresses, with preferred entries, a preferred communication channel, and channel-specific do-not-use restrictions. Marketing consent is separate.
- An individual landlord has one address. An organisation has a registered address and an optional different correspondence address.
- A completed individual landlord requires first name, surname, and at least one telephone number or email address. A completed organisation landlord requires its legal name plus either its own telephone/email or a linked primary person with contact details. Draft landlord leads may remain temporarily incomplete but cannot progress past appraisal completion without these details.
- Do not collect date of birth, identity documents, bank details, tax information, or other sensitive data until an approved workflow requires it.
- Notes are separate dated and attributed timeline entries. Only Branch Manager or higher may edit or void them; the original, replacement, author, timestamp, and reason remain auditable. A voided note is hidden from the ordinary timeline, not erased.
- Lost, postponed, withdrawn, former, and archived history remains searchable and can be reactivated where valid. Ordinary users do not permanently delete core records.
- Records with an active landlord lead, instruction, ownership relationship, property relationship, or tenancy cannot be archived until the relationship is resolved or transferred.
- Key records receive immutable, human-readable system references. Custom reference formats are deferred.

### Landlords and branches

- The same landlord is one shared workspace record even when properties are handled by different branches.
- Core contact information is shared. Properties, instructions, notes, tasks, and activities remain limited to authorised branches unless explicitly classified as agency-wide.
- Staff with access to a branch may view that branch's CRM records even if they are not the lead staff member.
- Authorised ordinary staff may update routine shared contact details; all changes are audited. Identity, ownership, organisation registration, merges, branch transfers, note corrections, and overrides require Branch Manager or higher.
- A landlord page shows **Properties with us**: the count of properties with any current let-only, rent-collection, or fully-managed instruction. Zayto will not attempt to maintain the landlord's wider portfolio.
- Duplicate checks use explainable signals. Exact email, telephone, organisation registration number, or full property-address matches are strong warnings; similar names and matching postcodes are weaker possible matches. Warnings do not merge automatically or prevent a justified creation.
- Branch Manager or higher can merge confirmed duplicates only after reviewing the records side by side and selecting which conflicting contact values survive. All non-conflicting relationships, notes, and history are preserved; the superseded record remains traceable as merged, and the action is audited.

### Properties and ownership

- Staff may begin with either the landlord or property and connect them during one guided onboarding process. Existing records can be selected and drafts can be resumed.
- A property is a permanent record. Repeat periods of agency service create separate instructions rather than replacing previous history.
- A property supports several individual or organisation owners. No ownership percentages are required.
- One current owner may be marked as the lead landlord contact for routine communication.
- Ownership relationships preserve known start and end dates. Former owners remain historical and are not presented as current.
- Structured manual addresses initially capture building/flat, street, locality, town/city, county, and postcode. Address lookup and UPRN capture are later integration work.
- Initial property characteristics include type; bedrooms, bathrooms, and reception rooms; optional floor area and unit; furnished status; parking/garage; outdoor space; selectable features; council-tax band when known; and general notes.
- Initial property types are detached, semi-detached, terraced, bungalow, flat/apartment, maisonette, room, and other. They are system-defined initially.
- Furnished status is Furnished, Part furnished, Unfurnished, or Flexible.
- Parking and outdoor-space details use standard selectable features plus free text for unusual details.
- Photographs and floor plans belong to the later marketing slice.

### Landlord leads, appraisals, and work

- Quick landlord-lead capture requires landlord name, at least one contact method, property address or postcode, lead source, and responsible branch.
- Lead source uses a configurable workspace list. It is optional at first quick save and required before appraisal completion.
- The initial visible pipeline is **New lead → Appraisal booked → Appraisal completed → Instruction won / Lost / Postponed**. ADR-031 reserves **Property enquiry** for an applicant's interest in a listing.
- Lost and postponed outcomes record a reason; postponed work may include a future follow-up date. Both remain searchable and reopenable.
- An appraisal records date/time, assigned staff member, appointment status, expected monthly rent, recommended service type, proposed fee, notes, and outcome.
- Every open landlord lead needs an owned next action and due date. A quick lead may be saved before this is supplied, but Zayto immediately flags it as incomplete.
- Follow-up reminders are initially in-app dashboard items. Email, SMS, and other outbound notifications wait for approved job and delivery infrastructure.

### Instructions and commercial terms

- **Approved Chunk 6 handover (2026-10-16):** choosing **Start instruction** from an appraisal-completed landlord lead opens a review page pre-filled from the linked landlord, property, branch, lead staff member and appraisal. Nothing changes if the user leaves before confirming. One confirmed operation marks the lead **Instruction won**, closes its open work, creates a distinct instruction, and opens that instruction's onboarding checklist; the whole operation succeeds or fails together so a won lead cannot be stranded without its instruction.
- The new instruction is linked to the originating lead, property, landlord parties, responsible branch, and lead staff member. The lead and appraisal remain as history rather than being converted into or overwritten by the instruction.
- **Approved Chunk 6 lifecycle (2026-10-16):** the initial instruction has no separately editable status. It records an instruction date and, when the relationship finishes, an ended date and required reason. The interface derives **Current** when no ended date exists and **Ended** when one does. Agreement progress and the property's onboarding/readiness journey remain separate. An ended instruction is preserved and a later appointment creates a new instruction rather than reopening it.
- **Approved Chunk 6 uniqueness (2026-10-16):** a property may have only one current instruction in a workspace, enforced by the database. It may have any number of ended instructions. Starting another instruction opens the current one instead of creating a duplicate; the existing instruction must be ended before a later appointment is created.
- **Approved Chunk 6 ending flow (2026-10-16):** authorised operational staff within branch scope may choose the secondary **End instruction** action; manager approval is not required. A confirmation modal requires an ended date (today by default, or a valid earlier date no earlier than the instruction date) and reason, and explains the consequences. Ending preserves all history, prevents further routine edits, removes the instruction from current counts, and moves an Onboarding/Ready-to-market property to **Withdrawn** using the same audited reason. A later appointment creates a new instruction.
- **Approved Chunk 6 parties (2026-10-16):** each instruction covers exactly one property and one or more individual or organisation landlords, with one landlord identified as the main day-to-day contact. The review suggests the property's current owners but staff confirm the instruction parties. Instruction parties and property ownership remain separate records: changing one never silently changes the other, and appearing on an instruction does not represent verified legal ownership. More complex representative capacities wait for their own approved rules.
- The responsible branch is required. The lead staff member may be absent during initial capture but is required before Ready to market.
- **Approved Chunk 6 service choice (2026-10-16):** an instruction has exactly one current core service: Let only, Rent collection, or Fully managed. The appraisal recommendation is suggested during the review but may be changed before confirmation. A later service change keeps the same instruction and creates a new effective-dated terms version so the previous service and fees remain historical. Optional charges are not modelled as additional core services.
- **Approved Chunk 6 asking rent (2026-10-16):** terms record the **Agreed asking rent** as a pounds amount per calendar month or per week. The appraisal's expected rent is suggested during review but may be changed or cleared. It may be missing when the instruction is first created, with a visible incomplete state, but is required before **Ready to market**. Changes create dated terms history. A future tenancy's actual rent is separate and never overwrites the instruction's asking rent; reporting conversions are calculated rather than stored as duplicate values.
- **Approved Chunk 6 deposit boundary (2026-10-16):** instruction terms record only the proposed tenancy-deposit offering (standard deposit, deposit-replacement alternative, or both), proposed tenancy-deposit amount, and separate optional proposed holding-deposit amount. A standard-deposit amount is required before **Ready to market** when standard deposit or both is offered. The workspace may default the usual offering, but makes no assumption when none is configured; instruction changes remain in terms history.
- The instruction does not ask for a protection scheme or provider. The later pre-tenancy workflow owns the actual deposit, protection provider, custodial/insured choice, registration reference and date, and deposit certificate. A customer-account setting will supply that workflow's preferred-provider default, and eventual provider integrations attach there. Detailed protection, eligibility, statutory limit, prescribed-information, deadline, release, and dispute rules remain outside this chunk.
- **Approved Chunk 6 fees (2026-10-16):** terms record one primary agency fee, either a percentage of rent or a fixed amount. A fixed fee also states whether it is one-off, weekly, or monthly. The appraisal proposal is suggested for review. Terms may also contain optional, clearly named fixed charges such as setup or tenancy fees. Every fee or charge explicitly records **VAT included**, **VAT added**, or **No VAT**; the third option supports agencies that are not VAT-registered and corrects the earlier two-option proposal. Fees may be incomplete when the instruction is created but are required before **Ready to market**. This milestone records the agreement only and does not create invoices, collect money, or post accounting entries.
- **Approved Chunk 6 terms changes (2026-10-16):** staff see the current service, asking rent, fees, VAT treatment and deposit offering together and edit them through one **Manage terms** flow with one reviewed save. A changed save requires a short reason and automatically creates a complete new current terms version with actor and time; prior versions are immutable and available under **Terms history**. Users do not manage version numbers. Changes take effect when saved in this slice; scheduled future-dated changes are deferred.
- **Approved Chunk 6 agreement progress (2026-10-16):** the instruction agreement is shown as **Not prepared**, **Prepared**, **Sent**, or **Signed**, derived from recorded milestone events rather than a freely editable status dropdown. Clear actions record each event, actor and time; **Signed** also records the signing date. Signing remains external to Zayto. Until approved private document storage exists, the screen says that no signed copy is stored; a signed copy can be attached later without rewriting the event history. Native Zayto e-signing remains a future candidate requiring a separate evidence, identity, integrity, and audit design.
- **Approved Chunk 6 readiness (2026-10-16):** the instruction page shows one checklist. **Ready to market** requires the instruction date; property; at least one landlord and a main contact; responsible branch and lead staff member; core service; agreed asking rent; primary fee and VAT treatment; deposit offering and a tenancy-deposit amount where standard deposit is available; and both a signed agreement and verified ownership. A Branch Manager or higher may record a separate reasoned, audited exception for the signed agreement or ownership check only. Missing rent, fees, parties, branch, staff or deposit information cannot be bypassed.
- A holding-deposit amount, uploaded agreement/title evidence, deposit provider/registration details, and later marketing content are not readiness requirements. When the checklist is complete, an authorised staff member deliberately chooses **Mark ready to market**; Zayto does not advance the journey silently and records the actor and time.
- **Approved Chunk 6 readiness invalidation (2026-10-16):** **Ready to market** remains valid only while the checklist is satisfied. Before saving a change that would make a ready property incomplete, Zayto warns that it will return to **Onboarding**. A confirmed change performs both updates together and records the reason in journey history. Complete replacement terms keep readiness; after an invalidating change is corrected, staff deliberately mark the property ready again.
- **Approved Chunk 6 ownership-check progress (2026-10-16):** the instruction-level check is **Not started**, **In progress**, **Verified**, or **Not verified**. Recording a result stores the staff actor, check date, short method description, optional internal notes, and a required reason for **Not verified**. Zayto records the agency's conclusion and does not decide whether evidence is legally sufficient.
- Staff manage the check in one modal. They may record an internal review and, once approved private document storage exists, optionally attach the title as classified ownership evidence; or record that an outside provider completed the check and mark it verified without requiring an upload. Before storage exists, the modal works without attachments and clearly says that Zayto holds no evidence file. Detailed evidence, provider integration, and legal verification rules remain a later approved workflow.
- **Approved Chunk 6 branch boundary (2026-10-16):** branch transfers are not included at this stage. A new instruction uses the property's responsible branch and has no separate branch-transfer control. The existing property-transfer operation must refuse a property with a current instruction so the records cannot drift apart. A later approved joined transfer can move the property and current instruction together; ended instructions will retain their historical branch.

### Property journey

The approved visible journey is:

**Onboarding → Ready to market → On market → Let agreed → Let**

`Withdrawn` is available with a reason. Authorised staff can progress the ordinary journey and record Lost, Postponed, or Withdrawn. Any authorised staff member may also move a record backwards. Outcomes and backwards movements require a reason and are fully audited; they do not require manager approval.

The first milestone implements only Onboarding and Ready to market. On market is unlocked by the marketing slice after descriptions, media, required information, agreements, ownership checks, rent, deposits, availability, and other approved checks are complete. Missing requirements are shown; they are not bypassed silently.

### Navigation, records, and dashboard

- Main navigation has separate Landlords, Instructions and Properties areas. **New landlord lead** remains the one connected landlord/property starting action; there is no second onboarding wizard.
- **Approved Chunk 6 screen flow (2026-10-16):** **Start instruction** opens a full review page from the completed appraisal, pre-filled with the linked records and proposed terms; one confirmation performs the lead handover. The dedicated instruction record uses the standard flat profile-sidebar layout: identity and linked records in the profile column, then readiness, current terms, agreement progress, ownership check, and read-only history in the working area, with one clear manage action per bounded task and a secondary **End instruction** action. The property's **Instruction** section summarises and links its current instruction and lists ended instructions as concise history. Instructions are initially reached through the lead or property; a full list, global search, and further dashboard summaries wait for the later lists/search/dashboard chunk.
- Landlord list defaults: name, individual/organisation, preferred contact, Properties with us, open landlord leads, current instructions, and authorised branches. Stage, lead staff member and next action stay on the Landlord leads and Instructions worklists because one landlord may have several simultaneous workflows.
- Property list defaults: address, landlord, branch, lead staff member, journey stage, service type, proposed rent, and next action.
- Lists use filters rather than excessive columns. Current records are the default; Include lost and Include archived are separate options.
- A landlord uses the existing contact record, with its profile summary and flat Properties, Landlord leads, Instructions and Activity sections, plus People for organisations. Documents remain deferred until private storage is approved.
- Property pages contain Overview, Ownership, Instruction, Activity, and Documents. The summary exposes the current stage, landlord, branch, lead, service, and next action.
- One prominent workspace search eventually covers all record types and labels each result type. Phase 1 searches landlords, organisations, properties, and instructions by appropriate names, contact details, references, addresses, postcodes, and registration numbers. Results respect branch and record permissions.
- Initial dashboard content includes new landlord leads awaiting action, today's appraisals, overdue/upcoming tasks, properties by journey stage, and recently updated records.
- Active-tenancy, pre-tenancy, ending, management, and other module metrics appear only after their underlying modules and permissions exist.

## Proposed data relationships for review

These are ownership boundaries, not approved Prisma table names. Every workspace-owned record carries `workspaceId`; relationships use workspace-aware foreign keys where practical; application authorisation and PostgreSQL RLS both enforce tenant and branch boundaries.

```text
Workspace
├── Person
│   ├── ContactPoint (email/telephone)
│   ├── PersonAddress (one current individual-landlord address in this slice)
│   ├── OrganisationPerson (roles and primary-contact marker)
│   └── PartyRole / module relationships
├── Organisation
│   ├── ContactPoint
│   ├── OrganisationAddress (registered/correspondence)
│   └── OrganisationPerson
├── Property
│   ├── PropertyOwnership ── Person or Organisation
│   ├── Instruction
│   └── PropertyFeature
├── LandlordOpportunity
│   ├── Appraisal
│   ├── Task / next action
│   └── OpportunityStageHistory
├── Instruction
│   ├── InstructionParty ── Person or Organisation
│   ├── InstructionTermsVersion
│   ├── OwnershipCheck
│   ├── AgreementStatusHistory
│   └── PropertyJourneyHistory
├── ActivityNote
├── ExternalSourceReference
└── AuditEvent (implemented shared facility)
```

Important boundaries:

- `Person` and `Organisation` are neutral contact records. Being a landlord is established by an opportunity, ownership, or instruction relationship, not a boolean on the contact.
- `PropertyOwnership` is distinct from `InstructionParty`: a legal owner, instructing contact, and lead communication contact are not assumed to be the same.
- `Property` is distinct from `Instruction`, and the future `Listing` remains distinct from both.
- Pipeline stage history, property journey history, term versions, ownership periods, branch transfers, merges, and sensitive corrections are append-preserving histories rather than mutable text fields alone.
- Notes and tasks have explicit branch/resource scope. Shared contact edits do not expose another branch's operational history.
- Documents use the future shared private-document capability and explicit classification; binary content is not placed in CRM tables.
- Search begins with indexed PostgreSQL fields. No separate search service is justified for this milestone.
- Import provenance attaches through stable external-source references without weakening canonical validation or tenant isolation.

## Proposed first module permissions

Roles remain bundles; server code checks named permissions plus workspace, branch, record, and field scope.

| Capability                                            | Account Owner / Agency Admin                     | Branch Manager                                                                            | Negotiator / Property Manager                                         | Read only                      |
| ----------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| View CRM records                                      | All authorised workspace records                 | Authorised branches                                                                       | Authorised branches                                                   | Authorised branches, no writes |
| Create routine records                                | Yes                                              | Yes                                                                                       | Yes                                                                   | No                             |
| Edit routine contacts and assigned workflow           | Yes                                              | Yes                                                                                       | Yes within branch scope                                               | No                             |
| Edit/void notes                                       | Yes                                              | Yes within branch scope                                                                   | No                                                                    | No                             |
| Merge duplicates                                      | Yes                                              | Yes within branch scope                                                                   | No                                                                    | No                             |
| Transfer branch                                       | Yes                                              | Yes between authorised branches                                                           | No                                                                    | No                             |
| Change sensitive identity/ownership/registration data | Yes                                              | Yes within branch scope                                                                   | No                                                                    | No                             |
| Record stage reversal/withdrawal                      | Yes                                              | Yes; ordinary assigned staff may submit a reasoned workflow change if separately approved | Assigned staff may progress forward and provide reasons where allowed | No                             |
| Record agreement/ownership-check exception            | Yes                                              | Yes within branch scope                                                                   | No                                                                    | No                             |
| Permanent erasure                                     | Separate controlled data-protection process only | No                                                                                        | No                                                                    | No                             |

Memberships with several operational roles receive the union of those roles' permissions while workspace, branch, record, and field scope continue to apply. `read_only` remains exclusive and cannot be combined with a writing role. Exact code-level permission names are an implementation detail to review with the Chunk 2 security design; they must express the approved actions above and must not change their meaning.

**Approved Chunk 6 instruction permissions (2026-10-16):** instruction access is branch-scoped. All existing staff roles may view instructions in scope. Account Owner, Agency Admin, Branch Manager, Negotiator, and Property Manager may perform ordinary instruction work: start an instruction, manage parties and the main contact, change terms, record agreement and ownership-check progress, mark ready, and end the instruction. Accounts and Read Only cannot change instructions in this slice. Only Account Owner, Agency Admin, and Branch Manager may approve agreement or ownership-check exceptions. Database and application enforcement must use narrow view, manage, and exception permissions rather than trusting interface visibility.

## Delivery chunks and approval gates

### Chunk 1 — requirements and data design (complete)

- Record confirmed workflow and field decisions.
- Review entity ownership, branch scope, histories, sensitive actions, and module boundaries.
- Resolve the product questions needed for the first implementation slice.
- **Gate passed:** the owner approved the proposed relationships, combined-role behaviour, minimum completed-contact requirements, audited staff stage corrections, ranked duplicate signals, and manager-controlled merge preview.

### Chunk 2 — people and organisations

- Approve exact schema, RLS policies, indexes, lifecycle states, audit actions, and permission names.
- The technical proposal is maintained in `.cursor/plans/people-and-organisations.md` and must pass its owner approval gate before implementation.
- **Checkpoint:** Chunk 2A database/security foundation is implemented, verified, and applied to shared development Supabase. Chunk 2B contact services are focused-tested. The first Chunk 2C contact UI is locally implemented and build-verified; authenticated browser/visual review remains before completion.
- Add people, organisations, contact points, addresses, organisation-person links, readable references, and focused migration provenance.
- Build create/view/edit/archive paths with targeted unit and database isolation tests.
- **Review:** responsive UI, light/dark themes, duplicate warnings, validation, permissions, cross-workspace and cross-branch denial.
- **UI polish completed (2026-10-15):** restored the boxed identity section in the contact form and made person, organisation, preference, and branch summary fields consistent about icons.

### Chunk 3 — landlord relationships and duplicate resolution

- Add landlord-facing summaries, branch/resource visibility, notes/activity, duplicate candidates, and controlled merge behaviour.
- Do not infer matches or merge from one similar value.
- **Owner decisions (2026-10-15):**
  - Delivery order: 3A organisation-person links (existing table, no migration) → 3B notes/activity (new migration, approval gate) → 3C merge.
  - Landlord summaries and `Properties with us` move to Chunks 4/6, when properties and instructions exist.
  - Notes default to the writer's branch; the writer may mark a note agency-wide. The 3B technical design is in `.cursor/plans/contact-notes.md`.
  - Linking a person to an organisation also gives the person a non-primary branch link to each of the organisation's branches within the actor's scope. Ending a link keeps it as history and leaves that branch visibility in place. Links are managed from the organisation record and require `contact.sensitive.manage`.
  - Merges cannot be undone in this slice. A careful side-by-side preview and confirmation step protects against mistakes; the merged record stays traceable and errors are corrected by editing. Admin undo is deferred because it requires a recorded merge manifest and split-back rules; revisit if pilot use shows a need.
  - The organisation's Link person dialog can also create a new person (name plus email or telephone) and link them in one transaction, after the standard duplicate check offers any matching existing person instead. The new person's primary branch is the organisation's branch that the actor can manage.
- **Checkpoint (2026-10-15):** 3A is implemented: link existing or new person, edit (relationship and one main contact), and end, with audit, People and Organisations cards, disposable-database tests for permission, hidden-branch denial, branch sharing, single main contact, history and atomic create-and-link, and browser checks of the link dialog and duplicate warning.
- **Checkpoint (2026-10-15):** 3B contact notes are implemented as designed in `.cursor/plans/contact-notes.md`, security-reviewed, tested against the disposable database, applied to shared development Supabase (RLS forced and grants verified), and browser-checked. 3C merge was designed in `.cursor/plans/contact-merge.md` and then deferred by the owner; duplicate warnings remain the protection until it is resumed.
- **Review:** history preservation, manager-only actions, search behaviour, and `Properties with us` semantics.

### Chunk 4 — properties and ownership

- Add structured addresses, characteristics, features, properties, current/historical ownership, lead landlord contact, and branch responsibility.
- **Review:** joint/organisation ownership, no percentage requirement, historical transitions, duplicate addresses, and isolation tests.
- The detailed Chunk 4 design and owner decisions are in `.cursor/plans/properties-and-ownership.md`.

### Chunk 5 — landlord leads, appraisals, and tasks

- Add quick landlord-lead capture, configurable lead sources, approved pipeline, appraisal details, next actions, reasons, and in-app dashboard work.
- **Review:** save-draft behaviour, overdue work, lost/postponed search, stage history, and role/branch scope.

### Chunk 6 — instructions and terms

- **Product-design gate passed (2026-10-16):** the owner approved the lead handover, derived current/ended lifecycle, one-current-instruction rule, parties, service, asking rent, fees/VAT, deposit boundary, agreement and ownership progress, readiness, permissions, screen flow, ending behaviour, and deliberate branch-transfer deferral recorded above. The exact schema and security design remain a proposal until reviewed.
- **6A — database and security:** design instruction roots and readable references; historical parties with one current main contact; immutable whole-terms versions and additional charges; agreement events; ownership-check history; manager exceptions; and instruction-scoped property-journey history. Store money as bounded integer pence and percentage fees as bounded basis points, extending VAT treatment with **No VAT**. Enforce workspace-aware relationships, exactly one current instruction per property, branch scope, app-role no-delete, narrow view/manage/exception permissions, and the existing property-transfer blocker. Add cross-workspace, cross-branch, cross-role, history, concurrency, and invalid-state database tests. Obtain an independent security review, fix findings, then ask the owner before applying the migration to shared Supabase.
- **6A design approved by the owner (2026-10-17):** as below. Owner decisions: deposit and holding-deposit amounts are recorded as entered with no legal-cap checks until the deposit workflow specifies them; manager exceptions are permanent in this slice (withdrawal can be added later). Approval covers building and testing on the disposable database only; applying to shared Supabase needs the independent review and a separate owner approval.
- **6A design (2026-10-17, Opus):**
  - **Tables** (all with `workspace_id`, workspace-aware composite foreign keys, RLS enabled and forced, `SELECT`/`INSERT` grants to `zayto_app`, `UPDATE` only where stated, never `DELETE`):
    - `instructions`: reference `INS-` plus 8 characters (same alphabet as `ENQ-`/`PRP-`); `property_id`; originating `enquiry_id` (required in this slice and unique, so a lead yields one instruction); optional `appraisal_id` (must belong to that lead); `responsible_branch_id` copied from the property and fixed; optional `lead_membership_id`; `instructed_on`; `journey_stage` (`onboarding`, `ready_to_market`, `withdrawn`) with `journey_changed_at` set by the database; `ended_on`, `ended_reason`, `ended_at`, `ended_by_membership_id` (all or none; `ended_on` between `instructed_on` and today in UK time; reason 1–500 characters); creator and timestamps. Partial unique index: one row per property with `ended_on IS NULL`. `UPDATE` allowed for lead staff member, journey stage and ending only; identity, property, lead, branch and instructed date are fixed; an ended instruction cannot change.
    - `instruction_parties`: instruction, contact (must be an active contact the actor can see when linked), `is_main_contact`, added by/at, `removed_at`/`removed_by`/`removed_reason`. Removal is an update; rows are never deleted. Partial unique index: one current main contact per instruction. Deferred check at commit: every instruction has at least one current party and exactly one current main contact.
    - `instruction_terms_versions`: whole, immutable versions (no `UPDATE` grant). `service` required; `asking_rent_pence` (1 to 10,000,000) with `rent_period` (`month`, `week`); `fee_kind` (`percentage` as basis points 1–10,000, or `fixed` as pence 1–10,000,000) with `fee_frequency` (`one_off`, `weekly`, `monthly`, only for fixed) and `fee_vat`; `deposit_offering` (`standard`, `replacement`, `both`), `deposit_pence`, `holding_deposit_pence`; `change_reason` (required for every version after the first); creator and time. The current version is the latest; one version per instruction per transaction. Rent, fee and deposit may be empty (incomplete) but are bounded when present.
    - `instruction_terms_charges`: named fixed charges belonging to one version (name 1–80 characters, pence 1–10,000,000, VAT treatment), immutable, at most 20 per version.
    - VAT: a new `fee_vat_treatment` type (`inclusive`, `exclusive`, `none`) for instruction terms; the appraisal's existing two-value type is left alone, and a suggestion from it maps across.
    - `instruction_agreement_events`: append-only; `to_status` (`prepared`, `sent`, `signed`), `signed_on` (required for and only for `signed`, not in the future), `reason` (required when moving backwards, as a correction), actor and time. Status is the latest event, or Not prepared when there is none.
    - `instruction_ownership_checks`: append-only; `status` (`in_progress`, `verified`, `not_verified`), `checked_on`, `method` (1–200 characters, required for verified and not verified), optional `notes` (up to 2,000), `reason` (required for not verified and for corrections), actor and time. Status is the latest row, or Not started.
    - `instruction_exceptions`: append-only; `kind` (`agreement`, `ownership_check`), reason (1–500), approving manager and time; one per kind per instruction; permanent in this slice.
    - `instruction_journey_history`: append-only; from/to stage, reason (required for backwards moves and withdrawal), actor and time. A journey change without a matching history row in the same transaction is refused (the lead-stage pattern).
  - **Rules the database enforces:** a lead may become Instruction won only in the same transaction that creates its instruction, and an instruction's lead must be won at commit (deferred constraint triggers both ways). Moving to Ready to market, and staying there, requires the approved checklist, checked by one database function at commit (deferred triggers on instructions, parties, terms, agreement events, ownership checks and exceptions), so no path can leave an incomplete property marked ready. Ending moves Onboarding or Ready to market to Withdrawn, with a history row carrying the ending reason. The existing property-transfer rule refuses to change a property's branch while it has a current instruction.
  - **Access:** permissions `instruction.read` (every staff role), `instruction.manage` (Account Owner, Agency Admin, Branch Manager, Negotiator, Property Manager) and `instruction.exception` (Account Owner, Agency Admin, Branch Manager). Row-level security: rows are visible to workspace-wide staff or staff whose branches include the instruction's branch, and child tables inherit this through their instruction. Writes need a database helper confirming the current member is active and holds a managing role (the `action_member_can_work` pattern); exceptions need a manager-role helper. Every write records the actor from the verified context, not from the request.
  - **Deliberately not checked:** statutory deposit or holding-deposit caps, fee legality, or ownership-evidence sufficiency (ADR-0010; to be specified separately). Amounts are stored as entered within the sanity bounds above.
  - **Tests (disposable database):** another workspace's rows are invisible and unwritable; other-branch, Read Only, Accounts and suspended members are refused; Negotiators cannot record exceptions; a second current instruction for a property is refused, including two concurrent attempts; history rows cannot be updated or deleted; an ended instruction is frozen; won-lead and instruction rules hold both ways; readiness is refused for each missing checklist item and is accepted with a manager exception only for agreement and ownership; an invalidating change while ready is refused unless the journey moves back to Onboarding in the same transaction; a branch transfer with a current instruction is refused; temporary tables cannot impersonate memberships; the RLS coverage test includes every new table.
  - **Then:** an independent security review (separate Opus agent), fixes, and the owner's approval before applying to shared Supabase.
- **6A built and tested (2026-10-17, Opus), not applied to shared Supabase, not committed:** migration `20261017120000_instructions_and_terms`, the Prisma models, the three permissions, and `tests/integration/instruction-security.test.ts` (29 tests). Disposable database suite passes (229), plus typecheck, lint, format and 230 unit tests.
  - **Independent review (separate Opus agent): Amber, now fixed.** No cross-agency or cross-branch leak, role bypass or spoofable actor. Three concurrency races were reproduced and fixed: (1) a landlord, terms or event could be added while another person ended the instruction, and (2) a removal racing an ending subtracted a landlord twice (both fixed by locking the instruction row `FOR SHARE` in the record and landlord triggers); (3) an instruction could be created in the old branch while the property was being transferred (the count update now re-checks branch and status). Also: the withdrawal history must carry the ending reason. Race tests, Property Manager and Agency Admin work, and exception refusals for Property Manager, Accounts, Read Only and another branch's manager were added; with the three fixes removed, exactly the three race tests fail.
  - Visibility triggers are named `*_check_instruction` so they run first (PostgreSQL runs triggers in name order) and an unseen instruction is always refused as access denied.
  - **Consequence for 6B:** once applied, a lead can no longer be marked Instruction won on its own (the database requires its instruction in the same transaction), so the existing Won outcome in the lead's Record outcome dialog will fail with a generic error. Apply the migration to shared Supabase together with 6B (the Start instruction handover) and remove the plain Won outcome then. Existing won demo leads are unaffected.
- **6B built and tested (2026-10-17, Sonnet), not committed:** `core/instructions/` has the pure rules (`domain/instruction.ts`: references, terms validation from pounds and percentages into pence and basis points, the Ready to market checklist, correction and date rules; 18 unit tests), the reads (`application/instruction-records.ts`: `getInstruction`, `listInstructionsForProperty`, `findInstructionForEnquiry`, and `getStartInstructionReview`, which pre-fills the Start instruction page from the lead, property owners and appraisal and writes nothing) and the changes (`application/instructions.ts`: `startInstruction` (the atomic handover), `replaceInstructionTerms`, `setInstructionLeadStaff`, `addInstructionParty`, `changeInstructionMainContact`, `removeInstructionParty`, `recordInstructionAgreement`, `recordInstructionOwnershipCheck`, `approveInstructionException`, `markInstructionReadyToMarket`, `returnInstructionToOnboarding`, `endInstruction`). 20 new database tests in `tests/integration/instruction-application.test.ts` (whole suite 249).
  - Every change locks the instruction, checks the narrow permission in the service, audits success and refusal, and refuses an ended instruction. Changes that would leave a Ready to market property incomplete are refused with `readiness_would_lapse` until the caller confirms, then the change and the return to Onboarding (with the reason in the journey history) are saved together.
  - Archiving or moving a property, and archiving a landlord, on a current instruction now give plain refusals (`has_current_instruction`, `on_instruction`) instead of a raw database error; the property's and landlord's pages still need the matching messages (6C).
  - **Still to do before the migration is applied (with 6C):** remove the plain Won outcome from the lead screens and from `closeEnquiry` (the database now refuses it); map the new error codes to messages in the server actions; the owner approval to apply the migration to shared Supabase.
  - **Not yet independently reviewed:** these services are the authorisation layer for instructions but no route calls them yet. The independent review of services and interface is the 6D checkpoint, before anything is shown to anyone else.
- **6A migration applied to shared Supabase (2026-10-19, by the owner, after the independent review and its fixes):** `prisma migrate status` reports the schema up to date. Restart any running dev server after a schema change: a server started earlier keeps the old database client and fails with "Cannot read properties of undefined (reading 'findFirst')".
- **6C stage 1 built and browser-checked (2026-10-19, Sonnet), not committed:**
  - **Start instruction:** a review page at `/enquiries/[id]/start-instruction` (landlords to confirm with one main contact, instruction date, lead staff, and the terms pre-filled from the appraisal) and one confirm button; reached from a **Start instruction** button on the lead and on pipeline cards. The old **Instruction won** outcome is gone from the dialog and `closeEnquiry` refuses it.
  - **Instruction record:** `/instructions/[id]` in the profile-sidebar layout: checklist with Mark ready to market, terms and terms history, landlords (add, make main, remove), agreement, ownership check, manager exceptions, journey history; one Manage dialog per task (`components/instructions/`), with the "return to Onboarding" confirmation when a change would lapse readiness; loading, not-found and error states. The property page has an Instruction section (current and ended). Property and landlord pages show plain messages for the new refusals.
  - **Checked:** typecheck, lint, format, 248 unit tests, 22 existing browser tests plus 4 new ones in `e2e/instructions.spec.ts` (non-mutating: Start instruction replaces Won, the review is pre-filled and cancelling changes nothing, phone and dark mode, validation, the property section); light desktop and dark phone screenshots looked at.
  - **Instruction record checked through the real screens (2026-10-19, owner approved):** a demo instruction (INS-WP32T6JU, 61 Canal Street, Ingrid Larsen's lead) was started and taken through terms with a charge, agreement (Prepared, Sent, Signed), ownership check, Mark ready to market, a change that warned before returning it to Onboarding, marking it ready again, and adding a landlord and making them the main contact; light desktop and dark phone were looked at. The instruction was left in place as demo data (Ready to market, with a second landlord, Priyanka Rao). The lead is now Won for good.
  - **Bug found by that run and fixed:** React cleared a form after every refused save, so the warning to confirm returning to Onboarding wiped what the person had typed. The dialogs and the Start form now submit without that reset; a browser test covers the Start form.
  - **Test fixture:** one fictional lead, "Test Fixture Landlord" at appraisal completed (Main Branch, ZZ1 1ZZ), was added so `e2e/instructions.spec.ts` can look at the Start instruction page and cancel. Never start an instruction on it.
  - **Independent security review of the 6B services and 6C screens/actions (2026-10-19, separate Opus agent): Green.** No route to another agency's or branch's instruction, party, contact or lead by changing an id; permissions enforced in the services; the handover and the confirm-to-return flow hold. Note 1 (an over-long tampered id made the refusal's audit row fail) is fixed centrally in `enquiryAudit` and tested. **Note 2 left open (optional):** an unexpected database refusal with SQLSTATE 42501 in a race window reaches the generic error page instead of a plain message; map it to `invalid_state` in `withEnquiryActor` if it ever shows up.
  - **Browser coverage gap:** the instruction page's dialogs are checked by the one-off run above, not by a permanent browser test, because that needs a lead that can be consumed. The services behind them are covered by the database tests. A browser-write fixture decision is still open.
  - **Known limits:** the Add landlord picker lists up to 100 recent active contacts (search arrives with Chunk 8); a landlord's Start review only offers the lead's landlord and the property's current owners.
- **6D checkpoint (2026-10-19, Opus): passed, with notes for later.**
  - **Independent review (separate Opus agent) of the new landlord-lead flow and a consistency pass over Chunk 6: Green.** No route to another workspace's or branch's records by tampering with fields; nothing half-made is left on failure; Accounts and Read Only cannot create leads; no raw errors exposed; `bookAppraisal` behaves exactly as before the refactor.
  - **Notes left for later (none blocking):** (1) choosing an existing property in the flow makes the landlord an owner without `property.ownership.manage` (the accepted booking rule, now reachable from a second screen; consider saying so in the duplicate pop-up); (2) a person with two 100-character names gets a 201-character lead name and a generic refusal (cut to 200); (3) an appraisal between 00:00 and 01:00 UK summer time shows as overdue on its own day in the lead list (compare with the UK date); (4) the picked appointment time is read in the browser's time zone (convert with Europe/London using `@date-fns/tz`); (5) a refusal after records were written leaves no refusal audit row (optional separate audit). Test gap: no flow test for another branch's existing contact or property id (covered through `bookAppraisal`).
  - **Browser click-through of the remaining dialogs on demo instruction INS-WP32T6JU:** change lead staff (and back), the Ready-to-market warning when clearing it, Return to Onboarding with a reason then Mark ready again, Remove landlord with a new main contact (Priyanka Rao is now a former landlord), and End instruction opened, validated and cancelled (not ended).
  - **Checked:** typecheck, lint, format, 248 unit tests, 264 database tests, 46 browser tests (2 skipped by design). **Not run at this checkpoint:** `npm run build` (last passed at the dashboard checkpoint); run it first next session.
  - **Next session:** run the build, then decide which of the five notes to fix (2 and 3 are minutes each), then Chunk 7 or the next owner priority.
  - **Checkpoint follow-up (2026-10-19):** notes 1 to 4 are fixed. Generated lead names are capped at 200 characters; overdue checks compare both the appointment and today as UK calendar dates; the duplicate review explains that selecting an existing property adds the landlord as a current owner; and appraisal wall-clock values are interpreted in `Europe/London` rather than the browser's timezone. The combined project check passes with 250 unit tests, the focused landlord-lead integration file passes all 14 tests, and the two affected browser files pass all 6 tests. The production build passes. Note 5 remains optional follow-up work.
- **6B — application services (original scope):** add the atomic reviewed lead-to-instruction handover; instruction record and property summaries; party/main-contact management; whole-terms replacement; agreement and ownership-check actions and corrections; manager exceptions; readiness calculation, confirmation and invalidation; and ending. Test money/date validation, duplicate-current races, immutable history, branch/role denial, readiness transitions, and rollback of every multi-record operation.
- **6C — interface:** build the full-page start review, dedicated responsive instruction record, readiness checklist, one Manage terms flow, agreement actions, ownership-check modal without file upload, manager exception flow, terms/event history, End instruction confirmation, and the property's current/historical Instruction section. Cover loading, empty, error, pending, keyboard, phone/tablet/desktop, light and dark states with targeted browser checks.
- **6D — checkpoint:** run the full relevant unit, database/RLS, permission, integration, browser, formatting, type and build checks; independently review service and interface behaviour; update the roadmap, data model, permissions and handover; and distinguish done, tested and still-unverified work.
- Private document storage remains a separate approval gate before title evidence or signed agreement copies are accepted. Native e-signing, deposit-provider integration, scheduled terms, branch transfers, detailed ownership rules, listing/portal marketing, accounting and real-money handling remain outside Chunk 6.

### Before the Chunk 6 checkpoint — one landlord-lead flow (owner request, 2026-10-19)

Brought forward from Chunk 7 and included in the 6D review. **Status:** built and tested (2026-10-19, Sonnet), not committed.

- **Built:**
  - **New landlord lead** (`/enquiries/new`, replacing quick capture; `components/enquiries/new-landlord-lead-form.tsx`, `createLandlordLeadAction`): Landlord (person or organisation, telephone or email, optional collapsed "Landlord's own address", clearly separate from the property), The property to let (full address and details), Lead details, and What happens next (book the appraisal now, set a next action, or save the lead for now). Continue checks duplicates in the background; a pop-up (`duplicate-review-dialog.tsx`, shared with the Book appraisal page) appears only when something matches; otherwise it saves straight away.
  - **One transaction** (`core/enquiries/application/landlord-lead-flow.ts`, `createLandlordLead`): landlord, property (landlord as lead owner), lead, and the booked appraisal or first next action; any refusal after the landlord and property are made rolls everything back (a test found and fixed a version that left them behind). `bookAppraisal` and `createEnquiry` were refactored to share `resolveLandlordAndProperty`, `createBookedAppraisal` and `createEnquiryInTransaction`; all earlier lead and appraisal tests still pass.
  - **Book appraisal page:** the form-reset bug that emptied town, county, bedrooms, bathrooms and notes is fixed (fields are no longer cleared after a submit); Continue replaces Review duplicates; a lead that already has its landlord and property (saved early) shows only the visit.
  - **Date and time picker** (`components/ui/date-time-picker.tsx`: `DatePicker`, `DateTimePicker`; Monday-first calendar, quarter-hour time list; keyboard and screen-reader labels): replaces every typed date and time field (appraisal, next actions, snooze, follow-up, instruction dates, ownership dates, notes). Adds `react-day-picker` 10.0.2 (approved), with `date-fns` and `@date-fns/tz` that it needs.
- **Checked:** typecheck, lint, format, 248 unit tests, 262 database tests (12 new for the one-step save: all-or-nothing, duplicates, permissions, rollback), 46 browser tests (new: `new-landlord-lead.spec.ts`, `appraisal-booking.spec.ts`); light desktop and dark phone looked at; one real lead created through the screens ("Flow Checker", ENQ-TQBTTQET, with its landlord, property and a booked appraisal, left as demo data).
- **Owner decision (2026-10-19): a scheduled appraisal counts as the lead's next action.** The lead list shows the earlier of the open action and the appraisal ("Appraisal" with its date); the lead page says the next step is the appraisal instead of warning; the dashboard's and the team's counts of leads with no next action no longer include a lead that has a scheduled appraisal. Covered by two new database tests. One time-zone note stands: the picked time is read in the browser's time zone, as before.
- **Original decisions (kept for the record):**

- **Problem:** quick capture asks only for building, street and postcode, with no town and no indication whether it is the landlord's home or the property to let; the contact and property are only created later on the separate Book appraisal page; duplicates are checked with a separate button, and that round trip empties the typed fields (the same React form reset fixed on the instruction dialogs); the appraisal time is a typed browser field.
- **Owner decisions:**
  - One **New landlord lead** flow replaces quick capture, and can still be saved early: with just the landlord and property it saves as a lead (as quick capture did) and the appraisal is booked later from the lead; or it carries on and books the appraisal in the same save.
  - Sections: **Landlord** (new or existing contact; name, telephone, email; the landlord's own address optional and collapsed, clearly labelled as theirs); **The property to let** (new or existing; full address and details: type, bedrooms, bathrooms, receptions, notes); **Lead details** (source, branch, lead staff member, summary); **What happens next** (book the appraisal now with date, time and who attends, or add a next action).
  - **Continue** runs the duplicate check in the background; matches open a modal to use the existing record or create new; with none it saves straight away. Contact, property (with the landlord as owner), lead and appraisal are saved in one transaction, all or nothing. Typed details are never cleared by a refused or reviewed save.
  - **Date and time:** add shadcn's Calendar (new dependency `react-day-picker`, approved 2026-10-19) as a pop-up calendar, plus a time list in 15-minute steps; reuse it wherever a date or time is picked.
  - The existing Book appraisal page keeps working for leads saved early, with the same background duplicate check and the form-reset fix.

### Chunk 7 — closed: absorbed into the delivered journey

**Owner decision (2026-10-19): approved.** Do not build a second onboarding wizard by default. The work brought forward into Chunks 5 and 6 now delivers the original outcome:

- **One connected start:** New landlord lead creates or links the landlord, property and ownership, then saves the lead with an appraisal, next action, or a valid early stopping point.
- **Resumable progression:** an early lead resumes from its record into appraisal booking; appraisal completion resumes into the reviewed Start instruction handover; an instruction persists its checklist and history until Ready to market.
- **No silent conversion:** the lead, reusable contacts, property, ownership, appraisal and instruction remain distinct connected records, and staff review the handover before the lead is won.
- **Clear completion:** the instruction's Ready to market checklist is the durable completion state. The record links back to its lead, property and main contact; the lead and property link to the instruction.
- **Responsive task-led screens:** the delivered lead, appraisal, Start instruction and instruction record paths already replace the proposed all-in-one wizard without requiring staff to re-enter established data.

The remaining gaps are not a new onboarding flow: there is no dedicated Landlords worklist, search/filtering outside the new Instructions worklist is incomplete, a contact does not yet summarise its leads and instructions, and a property does not yet summarise its landlord-lead history. Those belong with lists, related-record views and search in Chunk 8.

A future journey-polish change must respond to a specific observed user problem. Do not add a full wizard or new draft schema without evidence that the delivered record-based journey is failing users.

### Chunk 8 — lists, connected records, search, and dashboard

**Owner-approved product boundary, corrected landlord summary, navigation and implementation slices (2026-10-19).**

#### Approved correction to the earlier Landlords list decision

One landlord contact may legitimately have several properties, leads and instructions handled by different branches and staff members. The earlier default columns in **Navigation, records, and dashboard** give the landlord one pipeline stage, branch, lead staff member and next action; choosing one would be ambiguous and could hide other current work.

**Owner decision (2026-10-19): approved.** Keep one row per landlord contact and show name, person/organisation, preferred contact, **Properties with us**, open landlord leads, current instructions and authorised branches. Keep stage, lead staff and next action on the Landlord leads and Instructions worklists, where each row represents one workflow. `Properties with us` counts distinct properties on which the contact is a current party to a current let-only, rent-collection or fully-managed instruction, limited to properties the viewer may see. Former relationships remain searchable but do not inflate current counts.

#### Shared list and navigation rules

- A landlord remains the existing person or organisation contact; do not add a landlord table, duplicate contact record or global landlord flag. The Landlords worklist derives membership from landlord leads, ownership or instruction-party history.
- Current, authorised records are the default. Lost/postponed leads, ended instructions, former relationships, archived contacts/properties and merged contacts are separate explicit filters where relevant.
- Put non-personal filter, sort and page state in checked URL parameters. Typed search text can contain names, addresses or contact details, so keep it out of URLs and submit it privately from the worklist; a shared link preserves the safe filters and page but not the search words. Replace silent 50/100-row caps with an explicit page size and next/previous navigation; do not load all matching records into the browser. **Owner-approved privacy clarification (2026-10-19).**
- Every count, search result and related-record section must use the verified workspace and branch scope. A workspace-shared contact must not reveal a hidden branch's property, lead, instruction, count or staff member.
- **Approved navigation (owner decision 2026-10-19, refined after 8B):** **Landlords** is the primary staff-facing route for landlord work, while Contacts remains the shared person/organisation data foundation. Keep the top-level **Contacts** entry temporarily so staff can still find unlinked or accidentally created contacts. In 8E, once workspace search provides a reliable route to those records, remove Contacts from the main navigation; contact records remain reachable from Landlords, search and connected records. Keep **New landlord lead** as the connected landlord/property starting action; do not add a second onboarding wizard.
- Reuse the existing PostgreSQL/Prisma reads first. Measure representative fictional volumes and inspect query plans before adding indexes. Any justified index or search migration is a separate database approval and security-review gate.

#### 8A — Instructions worklist

**Built, tested, committed and pushed (2026-10-19, `828ebc8`):** the responsive `/instructions` worklist, navigation entry, current/ended, branch, journey-stage and lead-staff filters, private search, 25-row pagination, loading/empty/error states and links to the existing record are implemented. Search words stay out of URLs; safe filters and page remain shareable. The project check passes with 250 unit tests, the focused instruction database file passes all 24 tests, the four unchanged instruction browser scenarios passed and the corrected worklist scenario passes, and the production build passes. No schema, migration, dependency or permission changed.

- Add `/instructions` and its navigation entry, backed by a new branch-scoped `listInstructions` read using `instruction.read`; add no new permission.
- Default to current instructions. Search property address/postcode, instruction reference and current landlord name/reference. Filter by responsible branch, journey stage, lead staff member and current/ended state.
- Desktop columns: property and reference, main landlord, Onboarding/Ready to market stage, service and asking rent, branch, lead staff member and instruction date. Mobile rows show the same decision-making information without horizontal page scrolling.
- An ended instruction remains available through the ended filter and is clearly labelled; selecting a row opens the existing instruction record.
- **Slice exit:** authorised users can find and resume any visible instruction without first locating its lead or property; hidden-branch and other-workspace records never appear.

#### 8B — Landlords worklist and summary

**Built, tested, committed and pushed (2026-10-19, `5741ba6`):** the responsive `/landlords` worklist, navigation entry, person/organisation, authorised-branch, current/former and active/archived filters, private search, 25-row pagination and existing-contact links are implemented. One row represents one reusable contact and shows only visible lead, ownership and instruction relationships. The contact profile now shows **Properties with us**, counted as distinct properties on visible current instructions. The project check passes with 250 unit tests; the focused instruction/landlord database file passes all 26 tests, including branch, workspace and count isolation; the new dark-phone browser journey passes; and the production build passes. No schema, migration, dependency or permission changed. Cross-record read review remains part of the approved 8G checkpoint.

- Add `/landlords` and its navigation entry, backed by a branch-safe read over existing contacts and their lead, ownership and instruction relationships.
- Use the corrected one-row-per-contact columns proposed above. Search name, contact detail, reference and organisation registration number; filter person/organisation, authorised branch, current/former relationship and archived status.
- Link each row to the existing contact record rather than creating a second landlord record page. Add the confirmed **Properties with us** count to that record's profile summary using only visible current instructions.
- **Slice exit:** staff can find a current or former landlord without searching the complete Contacts address book, while one reusable contact remains the source of truth.

#### 8C — Connected record history and picker search

Deliver 8C as three separately tested and shipped slices:

- **8C1 — Contact history:** add flat, paged **Landlord leads** and **Instructions** sections to a landlord contact record, including current and concise historical rows. Keep the existing Properties section and organisation People section.
- **8C2 — Property lead history:** add a flat **Landlord leads** history section to the property record alongside its existing Ownership and Instruction sections.
- **8C3 — Landlord picker search:** add server-backed search to the instruction's Add landlord picker instead of loading only the 100 most recently updated contacts. Results stay workspace/branch authorised and return only the fields the picker displays.
- Do not add Documents until private storage and document classification are approved.
- **Slice exit:** each delivered record can be followed through its connected history without re-searching or exposing an inaccessible relationship.

**8C1 built, tested and committed (2026-10-19):** contact records now show separate five-row paged Landlord leads and Instructions histories, including current/former relationship and ended instruction context, while preserving independent page state. The histories use one verified service and existing database row security; focused database assertions cover pagination, a shared contact across two branches, the workspace owner and another workspace. The project check passes with 250 unit tests, the focused database file passes all 27 tests, and the updated dark-phone landlord-to-contact browser journey passes. No schema, migration, dependency or permission changed.
**8C2 built, tested and committed (2026-10-19, `904480c`):** property records now show a flat, five-row paged **Landlord leads** section (reference, enquirer, stage, branch) between Instruction and Owners, using one verified service (`core/properties/application/property-lead-history.ts`) and existing database row security. A focused database test covers pagination, a hidden branch and another workspace; the landlord-to-contact-to-property dark-phone browser journey also passes. No schema, migration, dependency or permission changed.

**8C3 built, tested and committed (2026-10-19, `904480c`):** the instruction page no longer preloads 100 contacts. Add landlord now searches active contacts on the server through `searchLandlordContactsAction` (20 results; id, name, reference and person/organisation only), marks people already on the instruction, and adding still re-checks the contact server-side. Contact and landlord searches now also match a person's full name ("Ingrid Larsen"), which previously found nothing. Covered by a unit test, a database test (full name, archived, another workspace) and a browser test that searches and chooses without saving; the related contacts, properties, instructions and landlords browser files (18 tests) pass. The new Server Action is reviewed at the 8G checkpoint.

#### 8D — Existing list completion and pagination

**8D1 Contacts built and tested locally (2026-10-20), not committed:** the Contacts list is now a 25-row paged worklist (`listContactPage`) with Type, authorised-branch and Status (active, archived, merged, all) filters in the web address, and private search that keeps typed words out of it. Covered by a new database test (paging, branch filter, hidden branch) and a browser test; the contacts browser file (8 tests) passes. No schema, migration, dependency or permission changed. The new search Server Action is reviewed at 8G.

**8D2 Properties and 8D3 Landlord leads built and tested locally (2026-10-20), not committed:** both lists are 25-row paged worklists with private search and shareable filters. Properties adds a Status filter (active, archived, all) and, for roles that may read instructions, the current instruction's stage, service, asking rent and lead staff, with Instruction (any, onboarding, ready to market, none) and Lead staff filters (`listPropertyPage`). Landlord leads keeps its stage, branch, assigned and include-lost filters. New database tests cover paging, branch/workspace isolation and ended instructions; the contacts, properties, landlords, enquiries, instructions, appraisal and new-lead browser files pass. `npm run check` (253 unit tests) and the production build pass. The old `listProperties` is now used only by tests and can be removed later. No schema, migration, dependency or permission changed. The three new search Server Actions are reviewed at 8G. Not yet run: the whole database suite (only the touched files) and the whole browser suite.

- Contacts: add authorised branch filtering, explicit pagination and clear active/archived/merged handling while preserving person/organisation and contact-detail search.
- Properties: add the current instruction journey, service/asking rent and lead staff summary to the existing address/landlord/branch list; use filters rather than displaying every available field. Add explicit pagination.
- Landlord leads: retain the current stage, branch, lead staff and next-action filters and columns; add explicit pagination and ensure lost and postponed remain opt-in by default.
- Keep each list responsive, with stacked linked rows below `md`, a real table from `md`, useful empty/filter states, and light/dark support.
- **Slice exit:** no delivered list silently truncates at 50 or 100 records, and shared URLs reopen the same checked filters and page.

#### 8E — Workspace search

**8E search box built and tested locally (2026-10-20), not committed; Contacts menu entry not yet removed.** Owner chose a search box in the top bar. It finds contacts/landlords (including email and telephone), properties, landlord leads and instructions, showing up to five per labelled group (`searchWorkspace`, reusing the four verified list reads) after two typed characters. Results never go in the web address. When more matches exist it says to type more rather than linking to a worklist, because search words are kept out of URLs (approved privacy rule). Phones get a search icon that opens a full-width box; Switch context moved into the phone menu to make room. Covered by a database test (grouping, short queries, hidden branch, other workspace) and three browser tests (desktop, no-match, dark phone); the full browser suite and `npm run check` pass. **Navigation trial (2026-10-20, owner request), not committed:** instead of removing Contacts, it is now an expandable menu group holding All contacts and Landlords (Landlords is no longer a top-level entry). Applicants and tenants will be added to the group when those modules exist; no placeholder links. Property and instruction search now need every typed name word to match the same owner or landlord. The new search Server Action is reviewed at 8G.

- Add one prominent workspace search entry point for contacts/landlords, properties, landlord leads and instructions. Label every result type and link to the existing record.
- Search appropriate names, contact details, registration numbers, references, addresses and postcodes using database queries; do not add a separate search service or external index for this milestone.
- Return small grouped result sets with a link to the relevant full filtered worklist when more matches exist. Never mix inaccessible records into totals or suggestions.
- Once workspace search can reliably find authorised contacts that do not yet have a landlord relationship, remove **Contacts** from the main navigation. Keep the Contacts list and contact records available through search and connected workflows; this is a navigation simplification, not a data-model or capability removal.
- **Slice exit:** staff can start with a name, reference, address, postcode, email or telephone and reach an authorised core record without knowing its module first.

#### 8F — Dashboard onboarding attention

**8F built and tested locally (2026-10-20), not committed.** Owner decision: an onboarding instruction is flagged when nothing has changed for **7 days** (`INSTRUCTION_STALE_AFTER_DAYS`, separate from the lead period). The Overview tab has an Instruction onboarding panel (`getInstructionAttention`): totals in onboarding and Ready to market (each linking to the filtered Instructions worklist) and up to five stalled instructions with their last change. A change is a stage move, new terms, an agreement or ownership-check entry, a landlord added or removed, or an exception. Counts follow the viewer's branch access, and the panel is hidden without `instruction.read`. The old dashboard placeholder search box was removed now that the top-bar search exists. Database tests (simulated clock, hidden branch, other workspace, ended instruction) and a dark-phone browser test pass.

- Add only operational summaries backed by delivered records: current instructions still in Onboarding, Ready-to-market totals and a short list of instructions whose onboarding has not changed for an agreed period.
- Link summaries to the filtered Instructions worklist. Keep detailed tables and filters out of the dashboard, and do not add speculative marketing, applicant, tenancy or financial metrics.
- Decide the inactivity period before implementation; do not silently reuse the landlord-lead stale period unless the owner confirms it.
- **Slice exit:** the dashboard points staff to incomplete instruction work without becoming another worklist.

#### 8G — Chunk checkpoint

- Run focused unit, disposable-database and browser coverage as each slice is built, including another-workspace, hidden-branch, pagination and count-leak cases. At the checkpoint run the broader relevant gate once, inspect representative query plans, review responsive light/dark navigation and update the roadmap/data-model handover.
- Independently review the new cross-record reads before the milestone is shown outside the project. Chunk 9 remains the separate private-alpha hardening gate.

Do not add listing, marketing, applicant, communications, activity automation or document-storage fields in this chunk; they remain behind their own product, provider and security decisions. Do not resume contact merge merely to deliver these worklists; revisit it before CSV import or pilot onboarding as already planned.

### Chunk 9 — milestone hardening

- Run the proportionate full relevant gate for the connected milestone, including unit, database/RLS, permission, integration, browser, formatting, type, build, and migration checks required by the affected paths.
- Review accessibility, responsive themes, failure recovery, audit events, migration/export readiness, documentation, and the next marketing boundary.
- **Gate:** declare private-alpha readiness only when the documented checks pass; otherwise distinguish done, tested, and unverified.

CSV import follows stable manual workflows and must be ready before a pilot agency is onboarded. Start with one design partner, then two or three wider pilot agencies. No design partner has yet been selected; recruitment is a future commercial task, not a current development blocker.

## Next approval gate

Ship 8D, then 8E (workspace search). Before any deployment or showing the app outside the project, run the independent security review of the 8A–8C cross-record reads and the new picker search action (owner decision 2026-10-19). The instruction-inactivity period can wait until 8F. Any new schema, database security, shared-environment change, document storage, integration, deployment or push keeps its normal separate approval gate.

Later decisions, not blockers for Chunk 2: private document storage; native e-signing; detailed ownership checks; address finder; retention/erasure periods; marketing readiness and publishing; communications delivery; CSV mapping/import; and design-partner recruitment.
