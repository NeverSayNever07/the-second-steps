# Property compliance and landlord agreements

**Status (2026-10-20):** Discovery approved; implementation remains proposal. The owner confirmed that GSI meant the annual gas-safety inspection/record (commonly CP12) and that the proof of concept and initial MVP will use fictional data only. The owner may review a provisional built workflow, but independent England lettings legal/compliance validation remains mandatory before real operational data or reliance. Current England sources have been reviewed to define the product boundaries and the questions requiring owner, legal or provider approval. Nothing in this plan is legal advice or a claim that Zayto's checklist proves compliance. It does not authorise a migration, private file storage, electronic-signature provider, external connection, paid usage, shared-environment change, deployment or push.

## Why this work belongs now

Listing preparation, the landlord's terms of business and property evidence meet at the instruction-to-marketing boundary. The boundaries should be agreed before the listing schema is approved so that listing records do not become an accidental home for reusable property compliance evidence, and so **Content ready**, **Ready to advertise**, **Ready for tenancy** and **Ready for occupation** never mean the same thing.

Do the discovery now. Build only the smallest manual evidence and agreement slices needed by the approved journey. Full property-management compliance, automated legal decisions and provider integrations remain later modules.

## Scope and language

- First operational jurisdiction: conventional residential lettings in England.
- Wales, Scotland and Northern Ireland require their own rule sets and workflows.
- HMO, student, build-to-rent, holiday, company-let, licence-to-occupy and other specialist regimes remain outside the initial supported workflow. Zayto must identify an unsupported or uncertain case and stop making readiness claims rather than treating it as ordinary.
- **Owner decision (2026-10-20):** GSI meant the annual gas-safety inspection/record, commonly called a CP12. Use **Gas safety record (CP12)** in the interface rather than the ambiguous abbreviation.
- A certificate or staff confirmation is evidence of a real action. It is not a general “property compliant” verdict.

## Lifecycle gates — proposed separation

### 1. Instruction authority

Before the agency relies on the landlord's authority or begins a service that requires it, capture:

- the approved terms-of-business version and the services, fees and authority it grants;
- the landlord parties and each signer's capacity to bind an individual or organisation;
- the exact property and instruction covered;
- who is contractually responsible for safety checks, repairs, licensing, Right to Rent checks, deposits, client money and ongoing management;
- required landlord warranties and declarations from a legally reviewed template; and
- signed evidence, cancellation information and any explicit request to begin work during a cancellation period.

The existing **Prepared → Sent → Signed** instruction history remains useful, but a real agreement needs document/version/signatory and delivery evidence before it can support real customer work.

### 2. Content ready

This is an internal listing-content state. Require reviewed advert facts, one advertised rent, material-information review and an EPC evidence state. Show all known safety/licensing gaps, but do not turn every move-in duty into a marketing blocker.

**Owner decision (2026-10-20):** CP12, EICR and alarm gaps remain visible warnings during listing and content preparation. They do not by themselves block **Content ready** or make the advert content incomplete.

### 3. Ready to advertise

Add only after the media decision. Proposed blockers include the approved minimum media, a specific advertised rent, an EPC commissioned where required, the rating when a valid EPC is available, and resolution of any fact that makes the advert materially misleading. Whether a pending local licence or another restriction blocks advertising rather than only later letting requires a reviewed England rule and, where local, the applicable council position.

**Owner decision (2026-10-20):** the fictional workflow blocks **Ready to advertise** while the EPC position is **Not assessed** or required evidence is missing. The gate requires reviewed EPC evidence, a recorded commissioned/awaiting state, or a reasoned **Does not apply** assessment. Independent review must validate which commissioned state and evidence are legally sufficient before real use.

**Owner decision (2026-10-20):** an EPC rated **F or G** blocks **Ready to advertise** until staff have reviewed valid exemption evidence or a specialist review has been resolved. No staff role may override this fictional gate. Independent review must validate the exact legal restriction and evidence before real use.

**Owner decision (2026-10-20):** an unassessed property-licensing position does not universally block **Ready to advertise**. Many agencies operate in areas without additional or selective licensing, so a blanket assessment gate would create disproportionate routine work. The product may show licensing attention without treating every property as licensable.

**Owner decision (2026-10-20):** licensing remains a warning during advertising. Once staff record that licensing **Applies**, missing or unresolved licence evidence is a non-overridable **Ready for occupation** blocker. A pending application or scheme-specific exception requires specialist review and does not automatically pass the gate.

**Owner decision (2026-10-20):** authorised staff record licensing applicability manually in the fictional MVP. Postcode or council-scheme detection is deferred until reliable official data, scheme rules and update responsibilities have been reviewed and a separate implementation is approved.

**Owner decision (2026-10-20):** alarm installation evidence and the tenancy-specific operational check are separate records. Every tenancy requires its own dated start-day alarm check; historic installation evidence cannot satisfy that event. The property may show **Ready for occupation** beforehand. **Confirm move-in** records what actually happened and remains available even when the check evidence is missing or records a failure.

### 4. Ready for tenancy agreement

This future pre-tenancy gate owns applicant/occupier checks, the proposed tenancy terms, affordability/referencing decisions where approved, Right to Rent timing, required written information and any unresolved restriction on granting the tenancy. Do not put applicant evidence into the listing or property-compliance record.

### 5. Ready for occupation

This future pre-move-in readiness gate owns evidence that must be current or delivered before occupation: gas-safety record where applicable, satisfactory electrical evidence and completed required remedial work, licensing/MEES position, prescribed information and other approved duties. The tenancy-specific start-day alarm check is handled by the later **Confirm move-in** action, so the property may show **Ready for occupation** before that event. A listing becoming Content ready never implies this gate has passed.

**Owner decision (2026-10-20):** in the fictional workflow, applicable CP12 evidence and satisfactory EICR/remedial evidence are non-overridable **Ready for occupation** blockers. The dated start-day alarm check is expected at move-in but does not prevent Zayto recording that occupation actually occurred. Independent legal/compliance review must validate their exact scope and timing before real use.

### 6. Confirm move-in

This future tenancy action records that occupation has actually proceeded and therefore remains available even if start-day alarm evidence is missing or records a failure. Readiness can be shown beforehand, but neither readiness nor move-in confirmation is evidence that the check occurred or passed.

**Owner decision (2026-10-20):** **Confirm move-in** is a hard block if applicable current CP12 evidence is missing, EICR/remedial evidence is not satisfactory, or licensing is recorded as **Applies** without resolved licence evidence. These items must already have passed **Ready for occupation** and cannot be overridden. The alarm workflow is the explicit exception described below.

Missing or failed start-day alarm evidence creates an urgent, non-dismissible remedial issue. Staff enter an operational target date, which Zayto must not label as a statutory deadline. The property/tenancy remains visibly flagged until successful repair or re-check evidence is recorded. Current England rules require the start-day working check and require later reported faults to be handled as soon as reasonably practicable; they do not provide a universal fixed-day repair period.

**Owner decision (2026-10-20):** Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may upload the alarm-check evidence and **Confirm move-in** within verified scope. Accounts and Read Only may view the permitted record but cannot perform either action. The implementation design must introduce a narrow tenancy/move-in permission rather than reusing an unrelated broad permission.

### 7. In-tenancy monitoring

Recurring gas checks, electrical next-inspection dates, licence/exemption/certificate expiry, reported alarm failures, repairs and risk reviews become property-management tasks with evidence and escalation. A reminder is not proof that work was completed.

**Owner decision (2026-10-20):** the fictional MVP shows in-app compliance attention at 60, 30 and 7 days before the staff-entered expiry/next-review date, then as overdue. It sends no email or SMS. Dismissing or completing an attention item does not alter the evidence state or prove the underlying work occurred.

**Owner decision (2026-10-20):** overdue CP12, EICR or applicable licence evidence becomes a prominent red **critical compliance issue** on the property, active tenancy and staff worklists. It remains visible until valid replacement evidence is recorded and cannot be cleared by completing or dismissing a reminder.

**Owner correction (2026-10-20):** named responsibility and assignment of property-management tasks are deferred. In the current slice, expiring compliance remains visible through the property record and shared compliance worklist within existing workspace/branch scope; it is not assigned to an individual staff member.

## Initial England compliance inventory

This inventory routes evidence and follow-up; it is not an exhaustive legal checklist. Every implemented rule needs a source, jurisdiction, effective date, scope conditions and review date.

**Owner decision (2026-10-20):** the first fictional compliance register covers five areas: EPC/MEES, Gas safety record (CP12), electrical safety/EICR, smoke and carbon-monoxide alarms, and property licensing. The remaining inventory stays planned and must not be presented as assessed or covered by the initial release.

| Area                                         | Earliest useful capture                                    | Proposed hard gate                                                                               | Evidence/status to preserve                                                                                              | Important boundary                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| EPC marketing duty                           | Instruction/listing                                        | Ready to advertise                                                                               | Certificate reference/rating/dates and source review, or dated commissioning evidence; separate exemption evidence       | Open data assists discovery but does not prove validity.                                                             |
| Minimum energy efficiency (MEES)             | Instruction/listing                                        | Before granting/continuing a relevant tenancy; advertising treatment needs legal review          | EPC band, registered exemption reference/type/dates, actions required                                                    | Never infer an exemption from a missing or low-rated EPC.                                                            |
| Gas installation and appliances              | Instruction                                                | Ready for occupation, then recurring                                                             | Applicability, engineer, check date, next due date, outcome, remedial status and tenant-delivery event                   | The agreement must clearly allocate landlord/agent duties.                                                           |
| Electrical installation/EICR                 | Instruction                                                | Ready for occupation; respond to a prospective tenant's written request within the required time | Inspection/report date, next due date, outcome, remedial confirmations and delivery events                               | “Report exists” is insufficient when required remedial work remains open.                                            |
| Smoke and carbon-monoxide alarms             | Property onboarding                                        | Confirm move-in, then reported-fault workflow                                                    | Required locations, installation and start-day test event; later repair/replacement events                               | A historic checkbox cannot prove alarms worked on a later tenancy start day.                                         |
| Property licensing                           | Instruction                                                | Before the relevant letting/occupation according to scheme; exact gate is local                  | Scheme/local authority, licence/application/reference, scope, dates, conditions and source                               | Mandatory HMO, additional HMO and selective licensing vary; local rules cannot be hard-coded as one national answer. |
| Fitness, hazards and repairs                 | Appraisal/onboarding                                       | Unresolved serious or materially misleading issue blocks the relevant next step                  | Inspection/issue, severity supplied by an authorised human or authority, actions, responsible party and closure evidence | Zayto records findings; it does not calculate an HHSRS or certify fitness.                                           |
| Furniture/fire safety                        | Property onboarding when furnished                         | Ready for occupation                                                                             | Applicability, reviewed inventory/evidence and unresolved action                                                         | Do not turn manufacturer labels or staff inspection into a universal certificate.                                    |
| Legionella/water risk                        | Property onboarding/management                             | Risk-dependent; not a routine certificate gate                                                   | Assessment/review date, assessor, controls and actions where used                                                        | HSE says domestic systems usually do not require sampling or a “legionella certificate.”                             |
| Right to Rent                                | Terms allocate responsibility; applicant stage performs it | Before the tenancy/occupation at the applicable statutory time                                   | Separate participant-private case and written agent responsibility                                                       | Never store identity evidence in the listing or general property record.                                             |
| Deposit and prescribed information           | Instruction records proposal only                          | Future pre-tenancy/move-in workflow                                                              | Actual receipt, scheme, protection and delivery evidence                                                                 | Do not confuse proposed instruction terms with money received or protected.                                          |
| Local/property-specific material information | Appraisal/listing                                          | Before the relevant applicant decision                                                           | Source, reviewed fact, qualification/uncertainty and review date                                                         | Current law is principle-based; there is no safe fixed “legally complete” field list.                                |
| Consents and authority to let                | Instruction                                                | Before acting or the relevant letting step, according to legal review                            | Landlord declaration and, where required, lender/freeholder/insurer or other evidence                                    | Zayto must not assume ownership alone gives every required consent.                                                  |

## Proposed compliance record boundary

Compliance evidence belongs to the property and, where relevant, to a specific instruction or tenancy—not to a listing copy field.

Use a versioned, workspace-owned record shaped around:

- requirement type, jurisdiction and rule/source version;
- property plus optional instruction/tenancy context;
- **Owner decision (2026-10-20):** keep applicability separate as **Not assessed**, **Applies**, **Does not apply**, or **Needs specialist review**;
- keep evidence status separate as **Not requested**, **Awaiting evidence**, **Reviewed**, **Action required**, **Expired**, or **Superseded**;
- require a written reason, actor and date for **Does not apply** and **Needs specialist review**, with an optional supporting source/document; preserve later changes as history;
- **Owner decision (2026-10-20):** treat routine applicability and evidence updates as ordinary operational work. Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may record **Applies**, **Does not apply**, **Needs specialist review** and evidence states within verified workspace/branch scope; Accounts and Read Only cannot change them;
- source/provider, reference, inspection/event date, valid-from, expiry/next-review date and who reviewed it;
- **Owner decision (2026-10-20):** until the relevant legal rule is independently validated, staff enter inspection, expiry and next-review dates from the evidence; Zayto may calculate reminder windows from those entered dates but must not calculate or label its own legal deadline;
- actions/remedial work and delivery-to-recipient events as separate history;
- allow multiple immutable evidence files/events per requirement, identify the evidence currently relied upon and preserve supporting/older/superseded files as history;
- contractual responsible party, kept distinct from the underlying legal duty; and
- optional classified document link only after private storage is approved.

Do not use one generic **Compliant / Non-compliant** field. Do not let a manager exception override a legal duty. A supported gate may record a documented product decision about missing evidence, but it must never relabel the underlying evidence as satisfactory.

Definitions should be system-versioned and centrally maintained for jurisdiction and effective dates. Workspaces may add agency-policy requirements, clearly labelled as policy rather than law. Existing general actions can provide reminders; completion must link back to evidence rather than silently changing it.

## Landlord terms of business — proposed workflow

### Authoring and approval

- Zayto does not write the legal contract. Begin with an agency-supplied template that has been reviewed by its solicitor and, where relevant, aligned with its redress-scheme obligations.
- Store immutable template versions. A published version can be used for new agreements; editing creates a new version and never changes an issued or signed agreement.
- Keep structured commercial instruction terms in Zayto. Generate an agreement snapshot from the exact approved service, fees, VAT treatment, property, parties and responsibility choices.
- Validate required placeholders before issue, but do not claim the contract is legally sufficient.

The legal/template review should cover at least: agency and client identity; property; service scope and authority; duration, termination and handover; fees, VAT, renewal/continuing charges and third-party commissions; repair/contractor authority and spending limits; keys and access; rent, deposits and client money; CMP/redress/complaints information; compliance and safety responsibilities; property licensing and consents; Right to Rent responsibility and timescales; data protection and approved processors; conflicts/referrals; cancellation rights; early-start request; and execution/signatory requirements. This is a review inventory, not approved contract wording.

### Issue and signing

1. Staff review a read-only agreement preview generated from one immutable snapshot.
2. An authorised staff member issues it to named signatories. Each individual or organisation signer has a recorded capacity.
3. The issue records template/agreement version, recipients, delivery method, issue time, cancellation information supplied and a cryptographic digest of the exact document.
4. Each required signer signs or declines. The agreement is not **Signed** until the approved signature rule is satisfied.
5. Completion preserves the signed file, provider completion evidence, signer/authentication evidence, timestamps and the final digest. Send each party a durable copy.
6. A correction, changed party or material service/fee/responsibility change creates a variation or replacement agreement; it never edits the signed artefact.
7. Cancellation, termination and supersession are separate dated events with the continuing fee/handover outcome recorded from the agreement—not inferred by Zayto.

Electronic signatures are generally capable of executing contracts in England and Wales, but evidential weight and any execution formalities still matter. Do not build a drawn-signature box as “native e-signing.” Use either an approved provider with an evidence package or an offline signing path with a securely uploaded completed document.

### Consumer-contract handling

Do not assume every landlord is a consumer or every contract is on-premises. Record the reviewed contracting capacity and route: individual consumer/business, organisation, on-premises, distance or off-premises.

For a distance or off-premises consumer service contract, the workflow must support the prescribed pre-contract information and cancellation form, durable confirmation, the applicable 14-day cancellation period, and a separate express early-start request. The early-start control must not be pre-ticked or hidden inside the signature. Record acknowledgement of proportionate charges on cancellation and, where applicable, loss of the cancellation right only after full performance. Exact wording and applicability require legal approval.

### Relationship to the existing instruction

The current instruction agreement events are milestone history, not execution evidence. Preserve them until the agreement-document model replaces or links them.

A real signed agreement must point to the commercial terms version it contains. If service, fee, VAT, repair authority, Right to Rent allocation or another material contractual term changes afterwards, the instruction must show **Agreement update required** and leave Ready to market until the approved variation/new-agreement rule is satisfied. This closes a gap in the current proof of concept, where a later terms version and an older generic **Signed** event can coexist without proving what was signed.

**Owner decision (2026-10-20):** a later change to service, fees, VAT treatment, landlord parties or allocated responsibilities automatically makes the completed agreement stale. Zayto shows **Agreement update required** and returns a Ready-to-market instruction to Onboarding until a linked replacement or variation is completed; the original agreement remains immutable history.

The current manager exception for a missing signed agreement is also a proof-of-concept control, not an approved rule for real instructions. Before real use, legal validation must decide whether any narrow circumstance permits work to begin without completed terms, which actions remain prohibited, and what evidence is required. Do not carry forward a generic override by default.

**Owner decision (2026-10-20):** when the evidence-backed agreement workflow replaces the current milestones, remove the manager override for a missing or outdated signed agreement. No role may use an exception to make contractual authority appear complete without the required evidence. The separate proof-of-concept ownership-check exception is not decided by this agreement decision.

## Security and privacy requirements

- Agreement files and compliance evidence are private, classified workspace documents—not public listing media.
- Approve UK storage location, encryption, malware/type/size checks, short-lived authorised downloads, retention, deletion/legal hold, backup and recovery before real uploads.
- Separate document permissions from listing visibility. Accounts, contractors, applicants and landlords do not gain evidence access from broad property access.
- Signer links must be purpose-bound, expiring, revocable and resistant to account discovery. Sensitive signing/evidence views are audited.
- Provider webhook events require signature verification, idempotency, replay protection and visible failure handling. Queues are not installed, so no provider should be connected until a durable delivery/retry design is approved.
- Do not log documents, API secrets, signature payloads, identity evidence or unrestricted provider responses.

## Build-ready delivery plan

**Status:** confirmed for a provisional fictional-data implementation. This sequence does not authorise real data, a shared migration or Storage configuration change without the normal owner approval. Independent England legal/compliance review remains a release gate before operational reliance.

### C0 — design and security preflight

Claude should start here and keep this step small.

- Read the relevant project rules, current instruction/property services and screens, ADR-008, ADR-016, ADR-020 to ADR-023 and the installed Next.js guidance before proposing code.
- Inspect the current Prisma ownership, instruction history, audit, permissions and transaction patterns; reuse them rather than introducing a parallel document or access model.
- Produce the minimum schema and service design for private documents, agreement evidence and compliance evidence. Every tenant-owned table/query must carry and enforce verified workspace scope; branch/resource checks remain server-side and database-backed.
- Resolve ADR-008's remaining fictional-implementation choices: bucket name/configuration, metadata and Storage RLS, safe download headers/limits, failed/orphan upload cleanup and controlled fictional-workspace reset.
- Define the migration order, least-privilege grants/RLS, audit events and tests before authoring the migration. Do not add a dependency unless the current outcome requires it and the owner approves it.
- Keep the C0 legal-review pack as the source of questions for independent review. The provisional build may encode only the owner-approved fictional rules and must label them as workflow/readiness states, never as a legal-compliance verdict.

**Stop gate:** review the schema, permissions, upload lifecycle and failure cleanup before applying a migration or changing the shared Supabase project. Database/storage security work requires `review-security`; shared migration/Storage changes still require owner approval.

### C1 — private document foundation

- Add a reusable private-document record with immutable versions, opaque object keys, workspace/resource linkage, classification, original display name, verified type/size, digest, creator and audit history. Keep agreement and compliance business state in their own records rather than in a generic file table.
- Implement server-only Storage access for the one private documents bucket. Never expose a Supabase URL/client decision to the browser.
- Validate actual content, size and encryption state. Agreement uploads accept PDF only; compliance uploads accept PDF, JPEG and PNG; every file is limited to 10 MB.
- Implement authenticated, non-cacheable attachment download through Zayto with a fresh workspace, branch, role, resource and document check. Do not add inline preview.
- Support audited cleanup of failed/orphan uploads and removal of an incorrect draft version. Never overwrite or normally delete completed/superseded evidence.
- Enforce the controlled-fictional-file restriction visibly in the interface and documentation; scanning/quarantine remains mandatory before arbitrary, untrusted or real uploads.

**Checkpoint:** targeted unit tests plus cross-workspace, cross-branch, role, object-substitution, type/size/encryption, failed-upload and refused-download integration tests. Run the whole integration suite because this slice adds migrations/RLS, then `npm run check`.

### C2 — externally signed landlord terms evidence

- Extend the existing instruction agreement area; do not create a second instruction workflow.
- Snapshot the exact instruction terms and named landlord/signatory requirements represented by the uploaded agreement. Main-contact status is not signing authority.
- Let Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager upload a controlled fictional PDF, confirm all required signatures are present and enter the overall signed/completed date shown on the document. Accounts and Read Only cannot change evidence.
- Record uploader/time, verified file facts, digest, terms snapshot, required parties, completion actor/date and append-only history automatically. Refuse completion without a dated copy.
- Allow audited draft removal before completion. Make completed PDF/version and terms snapshot immutable; correction or material change creates a linked replacement/variation and preserves supersession history.
- Mark **Agreement update required** after a material terms/party/responsibility change, return a Ready-to-market instruction to Onboarding and remove the generic missing/outdated-agreement manager override when the replacement workflow is complete.
- Add one coherent agreement-evidence interaction to the existing instruction record layout, supporting light/dark themes and mobile/tablet/desktop. Do not generate legal wording, PDFs, emails or signatures.

**Checkpoint:** agreement state/service unit tests; workspace/branch/role and immutable-version integration tests; responsive browser coverage for upload, completion, download, draft correction and material-change invalidation; `review-security`, `npm run check`, the relevant integration suite, affected Playwright tests and `npm run build`.

### C3 — manual property compliance foundation

- Add versioned requirement definitions for the initial fictional set only: EPC/MEES, Gas safety record (CP12), electrical safety/EICR, smoke and carbon-monoxide alarms, and property licensing.
- Keep applicability separate from evidence status. Preserve assessment/evidence history; **Does not apply** and **Needs specialist review** require reason, actor and date.
- Link multiple immutable evidence versions/events to one compliance item and identify the evidence currently relied upon without overwriting older, supporting or superseded files.
- Store only staff-entered evidence facts and dates. Zayto calculates attention windows from those dates but does not infer a statutory deadline, legal applicability, certificate outcome or overall compliance verdict.
- Licensing applicability is manual. Do not add postcode/council automation.
- Apply the agreed role boundary: all property-reading staff may view within scope; Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may update; Accounts and Read Only cannot change records.

**Checkpoint:** service/state-transition unit tests; full migration/RLS integration suite including cross-workspace, cross-branch, role and evidence-version isolation; `review-security` and `npm run check`.

### C4 — compliance screens, attention and current readiness

- Add a flat compliance section to the existing property profile-sidebar layout, with one clear edit/review flow rather than scattered controls. Support both themes and all responsive sizes from the start.
- Add a shared compliance worklist within existing workspace/branch scope. Do not add individual assignees or property-management tasks.
- Show in-app attention at 60, 30 and 7 days before a staff-entered date, then overdue. Reminder completion/dismissal never changes evidence.
- Show overdue CP12, EICR or applicable licence evidence as a prominent red **critical compliance issue** on the property and shared worklist until replacement evidence is recorded. Active-tenancy display waits until tenancies exist.
- Expose the evidence states needed by the current instruction journey without building future listing or tenancy screens. The current slice may show that CP12/EICR/licensing will affect later readiness, but must not pretend **Ready to advertise**, **Ready for occupation** or **Confirm move-in** exists before those modules are built.
- Keep EPC/MEES, licensing and alarm rules as recorded evidence/workflow states. Do not hard-code unsupported legal conclusions beyond the confirmed fictional rules.

**Checkpoint:** unit tests for attention thresholds and non-clearing behaviour; access/integration tests; responsive browser coverage for property compliance, evidence history/upload/download and the shared worklist; then `npm run check`, affected Playwright tests and `npm run build`.

### C5 — combined checkpoint and handoff

- Review C1–C4 together for tenant isolation, branch scope, least privilege, immutable history, audit completeness, misleading compliance language and failure recovery.
- Reconcile database records against private Storage objects in test scenarios and verify controlled cleanup without deleting completed evidence.
- Update ADR-008, permissions, data model, roadmap and this plan to match what was actually built; distinguish done, tested and still unverified.
- Run `review-security`, the full integration suite, `npm run check`, relevant end-to-end coverage and `npm run build`. Fix findings before anything is shown outside the project.
- Stop after the fictional-data checkpoint. Independent legal/compliance validation and the real-data controls below remain mandatory release gates.

## Explicitly deferred from this build

- Landlord portal, Zayto-owned electronic signing, provider signing and signer links.
- Approved legal templates, agreement PDF generation, sending, cancellation/early-start capture and production communications.
- Listings and the actual **Content ready** / **Ready to advertise** gates.
- Applications, Right to Rent, deposits, tenancy creation, **Ready for occupation**, alarm start-day evidence and **Confirm move-in**.
- Active-tenancy compliance screens, individual task assignment, email/SMS reminders and property-management workflows.
- Postcode/council licensing detection, EPC/provider lookups and every other external integration.
- Compliance areas beyond the confirmed initial five.
- Arbitrary/untrusted/real files, malware scanning/quarantine, production retention/legal hold, paid backup/recovery and operational support.

## Current primary and authoritative sources

- [GOV.UK: Renters' Rights Act 2025 implementation roadmap](https://www.gov.uk/government/publications/renters-rights-act-2025-implementation-roadmap), [current landlord overview](https://www.gov.uk/guidance/renters-rights-act-an-overview-for-landlords) and [2026 written-information rules](https://www.legislation.gov.uk/uksi/2026/324)
- [HSE: landlord gas-safety responsibilities](https://www.hse.gov.uk/gas/landlords/who.htm)
- [GOV.UK: electrical-safety standards](https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance)
- [Smoke and Carbon Monoxide Alarm Regulations](https://www.legislation.gov.uk/uksi/2015/1693/body?view=plain)
- [GOV.UK: EPCs for marketing, sale and let](https://www.gov.uk/government/publications/energy-performance-certificates-for-the-construction-sale-and-let-of-dwellings/a-guide-to-energy-performance-certificates-for-the-marketing-sale-and-let-of-dwellings)
- [GOV.UK: domestic minimum energy-efficiency standard](https://www.gov.uk/guidance/domestic-private-rented-property-minimum-energy-efficiency-standard-landlord-guidance)
- [GOV.UK: HMO licensing](https://www.gov.uk/find-licences/house-in-multiple-occupation-licence) and [selective-licensing guidance](https://www.gov.uk/government/publications/selective-licensing-in-the-private-rented-sector-a-guide-for-local-authorities)
- [HSE: legionella and landlords](https://www.hse.gov.uk/legionnaires/legionella-landlords-responsibilities.htm)
- [GOV.UK: landlord safety responsibilities](https://www.gov.uk/private-renting/your-landlords-safety-responsibilities) and [fitness for human habitation](https://www.gov.uk/government/publications/homes-fitness-for-human-habitation-act-2018)
- [Consumer Contracts Regulations 2013](https://www.legislation.gov.uk/uksi/2013/3134), [CMA fair-contract guidance](https://www.gov.uk/guidance/writing-a-fair-contract-for-customers) and [Law Commission electronic-execution report](https://www.gov.uk/government/publications/electronic-execution-of-documents)
- [GOV.UK: letting-agent redress schemes](https://www.gov.uk/government/publications/lettings-agents-and-property-managers-redress-schemes), [client-money protection guidance](https://www.gov.uk/client-money-protection-scheme-property-agents) and [Tenant Fees Act guidance](https://www.gov.uk/government/publications/tenant-fees-act-amended-by-the-renters-rights-act-2025/tenant-fees-act-2019-statutory-guidance-for-enforcement-authorities)
- [Home Office Right to Rent code](https://www.gov.uk/government/publications/right-to-rent-landlords-code-of-practice) and [TPO residential letting-agent code](https://www.tpos.co.uk/about-us/codes-of-practice/) where the agency is subject to it.

## Immediate owner decisions

1. **Confirmed:** discovery proceeds now for ordinary English residential lettings; unsupported cases stop for specialist review.
2. **Confirmed:** the proof of concept and initial MVP use fictional data only. A provisional workflow may be built for owner review without claiming legal compliance; independent validation is deferred only until before real operational use.
3. **Confirmed:** the fictional-data delivery order is C0 design/security preflight, C1 private document foundation, C2 externally signed landlord-terms evidence, C3 manual property compliance foundation, C4 compliance screens/attention/current readiness, then the combined C5 checkpoint. Independent legal/compliance validation remains mandatory before real use; portal/native e-signing and tenancy/move-in workflows remain later work.
4. **Confirmed:** the fictional agency is modelled as holding client money, so the workflow exercises fictional CMP membership/certificate and disclosure states without building actual money handling or client accounting.
5. **Confirmed:** every named fictional landlord party must sign unless another signer has explicitly recorded authority to bind that party; main-contact status alone is not signing authority.
6. **Confirmed:** the first agreement slice uses secure upload of an externally signed agreement. A future Zayto-owned signing journey through the landlord portal remains a separate proposal requiring architecture, security and evidential review.
7. **Confirmed:** private Supabase Storage in the existing London project is the approved direction for fictional documents. ADR-008's upload-security and operational decisions remain before implementation, and independent release controls remain before real data.
8. **Confirmed:** the first agreement upload accepts validated PDF files only, with a 10 MB maximum enforced by both Storage and the server.
9. **Confirmed:** password-protected or encrypted PDFs are rejected in the first version; Zayto does not request or store document passwords.
10. **Confirmed:** agreement downloads pass through an authenticated Zayto route. The server rechecks access and streams a non-cacheable attachment; the browser receives no Supabase URL.
11. **Confirmed:** malware-scanning infrastructure is deferred for the fictional MVP. Only controlled, non-sensitive test PDFs are permitted; arbitrary, untrusted or real uploads stay blocked until scanning/quarantine is implemented and reviewed.
12. **Confirmed:** a completed agreement PDF and its exact terms snapshot are immutable. Corrections and material changes create a linked replacement or variation while preserving the original and supersession history.
13. **Confirmed:** every active staff role with `instruction.read` may view/download the signed agreement within verified workspace and branch scope, including Negotiator, Property Manager, Accounts and Read Only. This grants no document-change permission or external-participant access.
14. **Confirmed:** Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may upload and mark an agreement complete through `instruction.manage`; Accounts and Read Only cannot change agreement evidence.
15. **Confirmed:** `instruction.manage` may remove an audited incorrect draft upload before completion. Completed agreements cannot be deleted through the normal interface; they are superseded by a linked replacement/variation, with permanent erasure reserved for a later approved process or controlled fictional cleanup.
16. **Confirmed:** completed fictional agreement files remain until the fictional workspace is explicitly reset; there is no automatic deletion schedule in the MVP. Real documents require an approved retention, erasure and legal-hold policy.
17. **Confirmed:** the fictional MVP has no separate file backup/restore system; controlled test PDFs are disposable and re-uploadable. Real documents require an approved paid service level, backup/recovery design, reconciliation and successful recovery test.
18. **Confirmed:** use one private documents bucket for all workspaces with opaque workspace/document/version object paths and no personal data in names. The database and server-side permission check—not the path—enforce isolation.
19. **Confirmed:** for an externally signed upload, Zayto records file/upload evidence automatically; staff confirm all required signatures are present and enter one overall signed/completed date from the document. Per-signer method/timestamps wait for native portal signing, where Zayto records them automatically.
20. **Confirmed:** an externally signed agreement without a clear signed/completed date cannot be marked complete; staff must obtain a dated copy and cannot invent or substitute a date.
21. **Confirmed:** a material change after completion marks **Agreement update required** and returns a Ready-to-market instruction to Onboarding until a linked replacement or variation is completed.
22. **Confirmed:** remove the missing/outdated agreement manager override when the evidence-backed workflow is implemented. No role may override contractual authority into a complete state; the ownership-check exception remains a separate future decision.
23. **Confirmed:** the first fictional compliance register covers EPC/MEES, Gas safety record (CP12), electrical safety/EICR, smoke and carbon-monoxide alarms, and property licensing. It does not claim to be an exhaustive compliance checklist.
24. **Confirmed:** every compliance area has separate applicability and evidence statuses. Missing evidence cannot become **Does not apply**, and uploaded evidence does not become satisfactory when action remains required.
25. **Confirmed:** **Does not apply** and **Needs specialist review** require a written reason, actor and date, with an optional supporting source/document; later changes preserve assessment history.
26. **Confirmed:** Negotiators may perform the same routine compliance applicability and evidence updates as Account Owner, Agency Admin, Branch Manager and Property Manager within scope, including **Does not apply**. Accounts and Read Only remain unable to change compliance records.
27. **Confirmed:** every active staff role authorised to read the property within workspace/branch scope may view compliance statuses and supporting documents, including Accounts and Read Only. This grants no edit or external-participant access.
28. **Confirmed:** compliance evidence accepts PDF, JPEG and PNG up to 10 MB per file; agreement uploads remain PDF-only. HEIC and other formats wait, and the controlled-fictional-file restriction remains until scanning/quarantine is approved.
29. **Confirmed:** each compliance item may hold multiple immutable evidence files/events, clearly identify the evidence currently relied upon and preserve older, supporting and superseded evidence as history.
30. **Confirmed:** staff enter inspection, expiry and next-review dates from the evidence. Zayto may calculate reminders from those dates but does not invent or label a legal deadline before rule validation.
31. **Confirmed:** show in-app compliance attention 60, 30 and 7 days before the entered date and then overdue. No email/SMS; completing attention never changes evidence or proves compliance work.
32. **Confirmed:** CP12, EICR and alarm gaps are warnings during listing/content preparation, not **Content ready** blockers. Applicable CP12 and EICR evidence/action becomes non-overridable at **Ready for occupation**. The tenancy-specific alarm check is expected at move-in, but Zayto must still allow staff to record that occupation actually occurred, subject to independent validation before real use.
33. **Confirmed:** **Ready to advertise** is blocked while the EPC position is **Not assessed** or required evidence is missing. The fictional gate requires reviewed EPC evidence, a recorded commissioned/awaiting state, or a reasoned **Does not apply** assessment, subject to independent validation before real use.
34. **Confirmed:** an EPC rated **F or G** blocks **Ready to advertise** until valid exemption evidence is reviewed or specialist review is resolved. The fictional workflow provides no staff override, subject to independent validation before real use.
35. **Confirmed:** **Ready to advertise** is not universally blocked by a **Not assessed** property-licensing position. Licensing remains visible, but Zayto must not force every agency to assess every property as though a local scheme exists.
36. **Confirmed:** licensing remains a warning during advertising. If staff record **Applies**, missing or unresolved licence evidence blocks **Ready for occupation** without staff override; pending applications and scheme-specific exceptions require specialist review.
37. **Confirmed:** licensing applicability is entered manually by authorised staff in the fictional MVP. Postcode/council-scheme automation is deferred pending reliable official data and reviewed scheme rules.
38. **Confirmed:** alarm installation evidence does not replace the tenancy-specific operational check. The property may show **Ready for occupation** beforehand; each tenancy still requires its own dated start-day check, but missing or failed evidence does not prevent staff recording that move-in occurred.
39. **Confirmed:** Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may upload the alarm-check evidence and **Confirm move-in** within scope. Accounts and Read Only cannot perform those actions; implementation must use a narrow tenancy/move-in permission.
40. **Confirmed:** missing or failed start-day alarm evidence creates an urgent, non-dismissible remedial issue and a staff-entered target date. Zayto does not call that target a statutory deadline and keeps the property/tenancy flagged until successful repair or re-check evidence is recorded.
41. **Confirmed:** staff cannot **Confirm move-in** without applicable current CP12 evidence, satisfactory EICR/remedial evidence, and resolved licence evidence where licensing **Applies**. These hard blocks have no staff override; the separately agreed alarm-failure workflow is the explicit exception.
42. **Confirmed:** overdue CP12, EICR or applicable licence evidence is a prominent red **critical compliance issue** across the property, active tenancy and staff worklists until valid replacement evidence is recorded. Reminder completion cannot clear it.
43. **Deferred:** named responsibility and individual property-management task assignment are outside the current slice. Expiring compliance remains visible through the property record and shared compliance worklist within existing scope.
