# C0 legal and product review pack

**Prepared:** 2026-10-20
**Status:** Draft for owner review during the fictional-data proof of concept and MVP, followed by independent England lettings legal/compliance review before any real operational use. This is not legal advice, approved contract wording or permission to implement regulated rules.
**Related plan:** `property-compliance-and-landlord-agreements.md`

## Purpose

This pack turns the compliance and landlord-agreement discovery into a review that a suitably qualified England residential-lettings solicitor or compliance specialist can answer in writing.

The review must establish:

1. which letting scenarios Zayto can safely support first;
2. which facts, evidence and delivery events the product may record;
3. which missing or adverse evidence blocks advertising, granting a tenancy, occupation or continuing management;
4. what an agency's landlord terms of business must cover;
5. what proves that the correct parties agreed the correct version; and
6. which matters remain human legal decisions rather than software decisions.

The desired output is a dated, sourced rule register and approved product boundary. It is not a request for Zayto to decide whether a property or person is legally compliant.

## Instructions for the reviewer

For every numbered decision and rule below, return one of:

- **Confirmed** — suitable for the stated first-release scope;
- **Confirmed with changes** — provide replacement wording or timing;
- **Agency policy** — useful operationally but not a legal requirement;
- **Scheme/code requirement** — identify the applicable scheme or code;
- **Not applicable** — explain why; or
- **Specialist review required** — identify the facts that trigger escalation.

For each legal conclusion, please provide:

- jurisdiction and tenancy/property scope;
- source title and link or citation;
- effective date and any transitional rule;
- the event that starts a deadline;
- exceptions or facts that change the answer;
- whether the duty remains with the landlord even if an agent performs it; and
- a recommended review date or legal-change trigger.

Please do not approve broad labels such as **Property compliant**. Confirm the narrow evidence and the stage affected instead.

## Current product facts the review must not assume away

- **Owner decision (2026-10-20):** the proof of concept and initial MVP use fictional data only. The owner will review the built workflow, but that product review does not replace independent legal/compliance validation before real operational data or reliance.
- **Owner decision (2026-10-20):** the fictional agency is modelled as holding client money. The fictional workflow must therefore exercise current CMP membership/certificate and disclosure states, while actual receipt, banking, reconciliation, deposit handling and client accounting remain out of scope.
- **Owner decision (2026-10-20):** every named fictional landlord party must sign the terms of business unless another signer has explicitly recorded authority to bind that party. Being the main day-to-day contact is not authority to sign for anybody else.
- **Owner decision (2026-10-20):** the first agreement workflow records an agreement signed outside Zayto and securely uploaded by authorised staff. A future landlord portal may support a Zayto-owned electronic-signing journey, but that remains a separate architecture, security and evidential decision rather than an approved implementation.
- **Owner decision (2026-10-20):** ADR-008 adopts private Supabase Storage in the existing London project for controlled fictional PDFs. The controlled upload implementation remains gated on access, delivery, retention, backup and security-test decisions; scanning/quarantine remains mandatory before arbitrary, untrusted or real documents.
- **Owner decision (2026-10-20):** the first agreement upload accepts PDF only, up to 10 MB. Storage and the server must both enforce the limits, and server validation must not trust the extension or browser-supplied media type.
- **Owner decision (2026-10-20):** password-protected or encrypted PDFs are rejected in the first version. Zayto does not request or store a PDF password.
- **Owner decision (2026-10-20):** agreement downloads pass through Zayto. The server rechecks access for every request and streams a non-cacheable attachment; the browser is not given a Supabase URL and the first version does not inline-preview PDFs.
- **Owner decision (2026-10-20):** malware-scanning infrastructure is deferred for the fictional MVP. Only controlled, non-sensitive test PDFs may use the interim upload path; arbitrary, untrusted or real files remain prohibited until scanning/quarantine is implemented and reviewed.
- **Owner decision (2026-10-20):** a completed agreement PDF and the exact terms snapshot it represents are immutable. Corrections, changed parties and material terms changes create a linked replacement or variation; the original and supersession history remain preserved.
- **Owner decision (2026-10-20):** every active staff role that can read an instruction within verified workspace and branch scope may view/download its signed agreement, including Negotiator, Property Manager, Accounts and Read Only. This does not grant document-change or external-participant access.
- **Owner decision (2026-10-20):** Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may upload and mark an agreement complete through `instruction.manage`; Accounts and Read Only cannot change agreement evidence.
- **Owner decision (2026-10-20):** an authorised user may remove an audited incorrect draft upload before completion. A completed agreement cannot be deleted through the normal interface and is corrected only by a linked replacement or variation; permanent erasure requires a later approved process or controlled fictional cleanup.
- **Owner decision (2026-10-20):** completed fictional agreement files remain until the fictional workspace is explicitly reset. The MVP has no automatic deletion schedule; real documents require an approved retention, erasure and legal-hold policy.
- **Owner decision (2026-10-20):** controlled fictional test PDFs are disposable and re-uploadable; the MVP adds no separate file backup/restore system. Real documents require an approved paid service level, backup/recovery design, reconciliation and successful recovery test.
- **Owner decision (2026-10-20):** use one private documents bucket for all workspaces. Object paths contain only opaque workspace/document/version identifiers; the database and fresh server-side permission checks enforce isolation.
- **Owner decision (2026-10-20):** for the first externally signed upload, Zayto records uploader, upload time, verified file facts, storage version and digest automatically. Staff confirm every required signature is present and enter one overall signed/completed date shown by the document; they do not duplicate per-signer methods and timestamps. Future native portal signing records per-signer events automatically.
- **Owner decision (2026-10-20):** if the uploaded agreement has no clear signed/completed date, Zayto refuses completion until a dated copy is supplied. Staff cannot invent or substitute a date.
- **Owner decision (2026-10-20):** a later change to service, fees, VAT treatment, landlord parties or allocated responsibilities marks **Agreement update required** and returns a Ready-to-market instruction to Onboarding until a linked replacement or variation is completed. The original remains immutable history.
- **Owner decision (2026-10-20):** remove the manager override for a missing or outdated signed agreement when the evidence-backed workflow is implemented. No role may override contractual authority into a complete state; the current ownership-check exception remains a separate decision.
- **Owner decision (2026-10-20):** the first fictional compliance register covers EPC/MEES, Gas safety record (CP12), electrical safety/EICR, smoke and carbon-monoxide alarms, and property licensing. The product must label this as an initial set, not an exhaustive compliance checklist.
- **Owner decision (2026-10-20):** each area keeps applicability (**Not assessed**, **Applies**, **Does not apply**, **Needs specialist review**) separate from evidence status (**Not requested**, **Awaiting evidence**, **Reviewed**, **Action required**, **Expired**, **Superseded**). Missing evidence cannot mean not applicable, and an upload cannot hide required action.
- **Owner decision (2026-10-20):** **Does not apply** and **Needs specialist review** require a written reason, actor and date, with an optional supporting source/document. Later changes append assessment history rather than overwriting it.
- **Owner decision (2026-10-20):** routine applicability and evidence updates are operational work, not manager exceptions. Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may record every applicability/evidence state within scope, including **Does not apply**; Accounts and Read Only cannot change compliance records.
- **Owner decision (2026-10-20):** every active staff role authorised to read a property within verified workspace/branch scope may view its compliance statuses and supporting documents, including Accounts and Read Only. This grants no edit or external-participant access.
- **Owner decision (2026-10-20):** compliance evidence accepts PDF, JPEG and PNG up to 10 MB per file; agreement files remain PDF-only. HEIC and other formats wait, and only controlled fictional files are allowed until scanning/quarantine is implemented.
- **Owner decision (2026-10-20):** a compliance item may hold multiple immutable evidence files/events, clearly identify the evidence currently relied upon and preserve older, supporting and superseded evidence as history.
- **Owner decision (2026-10-20):** staff enter inspection, expiry and next-review dates shown by the evidence. Zayto may calculate reminder windows from those entered dates but does not calculate or label a statutory deadline until the relevant rule is independently validated.
- **Owner decision (2026-10-20):** the fictional MVP shows in-app compliance attention 60, 30 and 7 days before the entered date, then overdue. It sends no email/SMS, and completing attention never changes evidence or proves the work occurred.
- **Owner decision (2026-10-20):** overdue CP12, EICR or applicable licence evidence becomes a prominent red **critical compliance issue** across the property, active tenancy and staff worklists. It remains visible until valid replacement evidence is recorded and cannot be cleared by completing or dismissing a reminder.
- **Owner correction (2026-10-20):** named responsibility and assignment of property-management tasks are deferred. In the current slice, expiring compliance remains visible through the property record and shared compliance worklist within existing workspace/branch scope; it is not assigned to an individual staff member.
- **Owner decision (2026-10-20):** CP12, EICR and alarm gaps are visible warnings during listing/content preparation and do not by themselves block **Content ready**. Where applicable, CP12 evidence and satisfactory EICR/remedial evidence are non-overridable **Ready for occupation** blockers. The tenancy-specific alarm check is expected at move-in, but Zayto must still allow staff to record that occupation actually occurred, subject to independent validation before real use.
- **Owner decision (2026-10-20):** the fictional workflow blocks **Ready to advertise** while the EPC position is **Not assessed** or required evidence is missing. It requires reviewed EPC evidence, a recorded commissioned/awaiting state, or a reasoned **Does not apply** assessment. The reviewer must validate the legally sufficient commissioning state and evidence before real use.
- **Owner decision (2026-10-20):** an EPC rated **F or G** blocks **Ready to advertise** until valid exemption evidence is reviewed or specialist review is resolved. No staff role may override this fictional gate; the reviewer must validate the exact legal restriction and acceptable evidence before real use.
- **Owner decision (2026-10-20):** an unassessed property-licensing position does not universally block **Ready to advertise**. Many agencies operate outside additional or selective licensing areas, so Zayto may show attention but must not impose a blanket assessment task as though every property requires a licence.
- **Owner decision (2026-10-20):** licensing remains a warning during advertising. Once staff record that licensing **Applies**, missing or unresolved licence evidence blocks **Ready for occupation** without a staff override. Pending applications and scheme-specific exceptions require specialist review rather than automatically passing the gate.
- **Owner decision (2026-10-20):** authorised staff record licensing applicability manually in the fictional MVP. Postcode or council-scheme detection waits for reliable official data, reviewed scheme rules and update responsibilities, and a separate implementation decision.
- **Owner decision (2026-10-20):** alarm installation evidence and the tenancy-specific operational check are separate. The property may show **Ready for occupation** before the check. **Confirm move-in** remains available as a factual event even when the dated check evidence is missing or records a failure.
- **Owner decision (2026-10-20):** Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may upload the alarm-check evidence and **Confirm move-in** within verified scope. Accounts and Read Only may view permitted records but cannot perform either action. Implementation requires a narrow tenancy/move-in permission.
- **Owner decision (2026-10-20):** missing or failed start-day alarm evidence creates an urgent, non-dismissible remedial issue with a staff-entered target date. Zayto must not label it as a fixed statutory deadline and must keep the property/tenancy flagged until successful repair or re-check evidence is recorded.
- **Owner decision (2026-10-20):** staff cannot **Confirm move-in** without applicable current CP12 evidence, satisfactory EICR/remedial evidence, and resolved licence evidence where licensing **Applies**. These are hard blocks with no staff override; the separately agreed alarm-failure workflow is the explicit exception.
- Zayto is a multi-agency CRM. Every agency workspace and its records are isolated.
- The current proof of concept supports landlord leads, properties, ownership history and instructions. It does not yet support listings, applicants, tenancies, private documents or client accounting.
- An instruction has one property, one or more landlord parties, one main day-to-day contact, one current core service and effective-dated commercial terms.
- Current agreement events — **Prepared**, **Sent** and **Signed** — are milestones only. They do not identify a contract file, template version, signers or execution evidence.
- Current **Ready to market** can use a generic manager exception for missing agreement or ownership evidence. That is not approved for real customer work.
- The application can retain evidence and reminders. It must not provide legal advice, calculate statutory compliance from incomplete facts or let a reminder substitute for evidence.
- Private document storage and electronic-signature providers are unresolved and separately approval-gated.
- Right to Rent, deposits, AML/KYC, referencing and insurance pass/fail rules are outside this review unless needed to define a boundary or responsibility in the landlord agreement.

## Proposed first supported scope — reviewer to validate

The narrow starting point is a new letting in England on or after 1 May 2026 which the instructed professional confirms is an assured periodic tenancy under the current regime, for one self-contained private-rented dwelling, handled by a letting or managing agent for disclosed landlord parties.

The product should stop and request specialist review rather than apply this rule set when the case may involve:

- a resident landlord, lodger or licence to occupy;
- holiday accommodation, purpose-built student accommodation or another excluded tenancy;
- a company let or other non-assured arrangement;
- an HMO, selective/additional licensing uncertainty or property-specific licence condition;
- supported, social, agricultural, Crown or other specialist housing;
- a trust, estate, attorney, deputy, receiver or disputed authority;
- mixed residential/commercial use;
- an overseas or otherwise unusual contracting arrangement; or
- any uncertainty about tenure, landlord identity, authority, jurisdiction or applicable local rules.

**Review question S01:** Is that a safe and useful first boundary? Amend the included and excluded cases and provide an objective escalation test staff can follow without giving legal advice.

## Decision sheet

### Scope and responsibility

| ID  | Decision requiring written confirmation                                                    | Proposed product treatment                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Exact first supported tenancy/property types                                               | Support only the validated ordinary England path; require specialist review for every excluded or uncertain case.                               |
| D02 | Which duties may be performed by the agent and which legal duties remain with the landlord | Record both the underlying duty and the contractually responsible performer; never present contractual allocation as removing a statutory duty. |
| D03 | When local licensing uncertainty must block a stage                                        | Store council/scheme/source and require a human decision; no national yes/no inference.                                                         |
| D04 | Whether the agency may act before signed terms                                             | Remove the generic exception unless the reviewer defines a narrow circumstance, permitted actions, authority, evidence and expiry.              |

### Landlord and signing authority

| ID  | Decision requiring written confirmation                                                     | Proposed product treatment                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D05 | Which landlord parties must contract and sign                                               | **Fictional-data decision:** every named landlord party signs unless another signer has explicitly recorded authority to bind that party. Main-contact status alone gives no signing authority. |
| D06 | Who may sign for a company, partnership, trust, estate or represented person                | Record signer capacity and authority evidence; escalate unsupported capacities.                                                                                                                 |
| D07 | Whether ownership evidence is required before instruction, advertising or tenancy           | Keep ownership and instruction parties separate; record review evidence and the precise stage affected.                                                                                         |
| D08 | How a change of landlord party, signer, service, fee or responsibility affects an agreement | Create a variation or replacement snapshot; never edit or silently reuse the completed agreement.                                                                                               |

### Consumer contract and agency facts

| ID  | Decision requiring written confirmation                                                              | Proposed product treatment                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D09 | How staff determine whether the landlord contracts as a consumer or business                         | Record the reviewed capacity and facts; do not infer it only from person versus organisation.                                                                                                                        |
| D10 | When the Consumer Contracts Regulations apply to on-premises, distance and off-premises instructions | Record contracting route and required information/cancellation events from approved wording.                                                                                                                         |
| D11 | Exact early-start request and cancellation treatment                                                 | Use a separate affirmative action and durable evidence; never pre-tick it or bury it in general acceptance.                                                                                                          |
| D12 | Required redress, complaints, fee-tariff and client-money-protection disclosures                     | Store these as versioned workspace facts and insert only the facts applicable to that agency.                                                                                                                        |
| D13 | Whether the first supported agency holds landlord/tenant money                                       | **Fictional-data decision:** yes. Record this as an explicit workspace fact and exercise CMP membership/certificate and disclosure states. Do not infer that money was actually received or build client accounting. |
| D14 | Which professional or scheme code the first customer follows                                         | Treat code obligations as conditional on membership, clearly separate from law and agency policy.                                                                                                                    |

### Evidence and lifecycle

| ID  | Decision requiring written confirmation            | Proposed product treatment                                                                                                         |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D15 | Exact blockers for **Content ready**               | Limit to advert facts/content and reviewed material information; do not imply move-in safety.                                      |
| D16 | Exact blockers for **Ready to advertise**          | Require only validated marketing duties and restrictions, including the advertised-rent and EPC position.                          |
| D17 | Exact blockers for **Ready for tenancy agreement** | Keep applicant-private checks and tenancy terms outside listing/property evidence.                                                 |
| D18 | Exact blockers for **Ready for occupation**        | Require validated pre-move-in evidence and delivery events at the legally correct time.                                            |
| D19 | Behaviour at **Confirm move-in**                   | Always allow the factual event to be recorded; turn missing or failed start-day evidence into urgent unresolved work.              |
| D20 | Which evidence expires or recurs during management | Create dated follow-up without converting completion of a reminder into compliance evidence.                                       |
| D21 | Whether any missing/adverse item can be overridden | Permit only a reviewer-defined product exception to a product gate; never override or relabel the underlying legal/evidence state. |

## Candidate England rule register

This table deliberately says **candidate**. The reviewer must correct it before implementation.

| ID  | Candidate rule or boundary as at 2026-10-20                                                                                                                                                          | Proposed stage and record                                                                            | Reviewer must confirm                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| R01 | The first phase of the Renters' Rights Act 2025 has applied in England since 1 May 2026. New assured private tenancies are periodic rather than fixed-term.                                          | Tenancy-scope decision before agreement generation.                                                  | Covered tenancy types, exclusions and transitional cases.                                                                        |
| R02 | New covered tenancies require prescribed written information about key terms. Existing pre-1 May 2026 cases have separate transition requirements.                                                   | **Ready for tenancy agreement**; preserve exact document/version and delivery evidence.              | Required content, recipients, timing, delivery method and corrections.                                                           |
| R03 | A rental advert must state an asking rent; encouraging bids or accepting above the advertised rent is prohibited for covered lettings.                                                               | **Content ready / Ready to advertise**; one explicit advertised rent and immutable advert history.   | Scope, exceptions and how price changes/re-advertising work.                                                                     |
| R04 | Rent must not be demanded, encouraged or accepted before the tenancy agreement is signed, and current advance-rent controls must be reflected in money workflows.                                    | Future offer/pre-tenancy payment gate, not instruction terms.                                        | Exact permitted timing/amount and exceptions; Zayto must not invent collection rules.                                            |
| R05 | EPC marketing duties require a valid certificate to be made available where applicable and reasonable efforts to obtain it before marketing; particulars must include required energy information.   | **Ready to advertise** with certificate details or reviewed commissioning state.                     | Exact blocker, exceptions, display fields and what commissioning evidence permits.                                               |
| R06 | MEES restrictions are distinct from EPC marketing duties. An F/G rating does not itself tell Zayto whether a valid exemption or other route applies.                                                 | Restriction state before grant/continuation; advertising treatment separately confirmed.             | Relevant tenancy scope, exemptions, registration evidence and affected stage.                                                    |
| R07 | Where landlord gas duties apply, relevant appliances/flues require annual checks by a Gas Safe registered engineer; records have tenant-delivery and retention requirements.                         | Capture at instruction; hard gate no later than **Ready for occupation**; recurring management.      | Applicability, 10–12 month flexibility, record content, delivery timing/method, retention and remedial blockers.                 |
| R08 | Covered electrical installations require inspection/testing by a qualified person at least at the interval set by the regulations/report, with report delivery and remedial duties.                  | **Ready for occupation** plus recurring/action workflow.                                             | Current 2025/2026 amendments, report outcomes, remedial/urgent timing, local-authority delivery and prospective-tenant requests. |
| R09 | Required smoke and carbon-monoxide alarms must be installed and checked as working on the first day of a new tenancy; reported faults require action.                                                | Property applicability plus a tenancy-specific start-day event and later fault workflow.             | Exact alarm locations/fuel-appliance scope, first-day evidence and repair timing.                                                |
| R10 | Mandatory HMO, additional HMO and selective licensing depend on property/use and local scheme.                                                                                                       | Instruction capture and specialist/local review before the validated letting stage.                  | When application versus granted licence is sufficient, licence conditions and local-source review cadence.                       |
| R11 | Fitness, hazards and repair duties cannot be reduced to a certificate or an automated HHSRS score.                                                                                                   | Issues/actions across onboarding and management; serious unresolved issues affect the reviewed gate. | Escalation criteria and who is competent to assess/close each issue.                                                             |
| R12 | Supplied furniture/furnishings and fire precautions have conditional requirements; HMO rules may add duties.                                                                                         | Furnished-property applicability and occupation gate.                                                | Evidence expected for the supported non-HMO scope and escalation conditions.                                                     |
| R13 | Landlords must assess/control legionella risk, but routine sampling or a universal “legionella certificate” should not be presented as a legal requirement.                                          | Risk assessment/review evidence where applicable; not a universal certificate gate.                  | Review triggers, competent-person boundary and record wording.                                                                   |
| R14 | Right to Rent responsibility may be transferred to an agent only through an agreement meeting the applicable requirements; checks contain participant-private data.                                  | Responsibility in landlord terms; performance in a separate restricted applicant case.               | Valid allocation wording/timing, check stages, follow-up and retention/access boundary.                                          |
| R15 | Deposit proposal in instruction terms is not evidence of receipt, protection or prescribed-information delivery.                                                                                     | Future pre-tenancy/move-in money and delivery events.                                                | Keep detailed rules outside C0 unless separately commissioned.                                                                   |
| R16 | Letting/property-management agents must belong to an approved redress scheme; agents holding client money in England must meet applicable CMP requirements.                                          | Versioned workspace facts, agreement disclosures and operational launch checks.                      | Exceptions, display/document requirements and evidence/review dates.                                                             |
| R17 | Consumer-facing service descriptions, fees and contract terms must be clear, accurate, prominent and fair; onerous, variation, renewal, termination and continuing-fee terms need particular review. | Approved terms template and pre-contract disclosure snapshot.                                        | Approved clause wording and prominence; treatment of VAT, referral income and continuing commission.                             |
| R18 | Distance/off-premises consumer service contracts can carry pre-contract information, durable confirmation, cancellation and early-performance requirements.                                          | Agreement issue/signing events separate from general signature.                                      | Classification, information, model form, timing, early-start wording, proportionate charge and full-performance effect.          |
| R19 | Electronic signatures can be legally capable of authenticating a contract, but intent, authority, formalities and evidence still matter.                                                             | Approved provider evidence package or securely uploaded externally signed copy.                      | Signature standard for each supported party/capacity and whether witnessing/deed formalities ever arise.                         |
| R20 | The planned PRS Database and landlord ombudsman are phase-two changes with regional/commencement detail still requiring verification.                                                                | Change watch only; do not claim registration or ombudsman checks until live scope is verified.       | Position on implementation date and in each operating area before release.                                                       |

## Proposed lifecycle gates for review

### Gate A — Instruction authority

Proposed result: the agency has evidence that the correct client parties appointed it on the approved terms for the stated property and services.

Candidate requirements:

- supported scope and landlord capacity assessed;
- property and instruction parties identified;
- authority/ownership evidence reviewed to the approved standard;
- immutable terms snapshot identifies service, fees, VAT and responsibilities;
- every required signer has completed the approved execution route;
- issue, delivery and completion evidence is preserved;
- consumer information/cancellation handling is complete where applicable; and
- no later material terms change has made the agreement stale.

The reviewer must specify whether any action may occur before this gate and, if so, exactly which action, authority and evidence permit it.

### Gate B — Content ready

Proposed result: advert content is internally reviewed. This is not permission to advertise, grant a tenancy or allow occupation.

CP12, EICR and alarm gaps remain visible here but do not make the advert content incomplete.

### Gate C — Ready to advertise

Proposed result: the validated marketing requirements and restrictions have been addressed. This does not assert that all occupation duties are complete.

The fictional gate blocks an unassessed EPC position or missing required evidence. It accepts reviewed EPC evidence, a recorded commissioned/awaiting state, or a reasoned **Does not apply** assessment, pending validation of the exact legal rule.

An EPC rated **F or G** also blocks the fictional gate until valid exemption evidence has been reviewed or specialist review is resolved. There is no staff override.

An unassessed property-licensing position does not by itself block this gate. The reviewer should instead validate when a known scheme, property type or recorded applicability decision must change later readiness gates.

### Gate D — Ready for tenancy agreement

Proposed result: the case is within the supported tenancy path, proposed terms and applicant-private prerequisites are ready, and no known restriction prevents granting the tenancy.

### Gate E — Ready for occupation

Proposed result: the validated pre-move-in property evidence, remedial work and document delivery are complete and current. The property may reach this state before the tenancy-specific start-day alarm check.

For the fictional workflow, applicable CP12 evidence and satisfactory EICR/remedial evidence cannot be overridden at this gate. The reviewer must validate the exact legal scope and timing before real use.

If licensing has been recorded as **Applies**, missing or unresolved licence evidence also blocks this gate without staff override. Pending applications and scheme-specific exceptions remain in specialist review until the validated rule permits progression.

### Gate F — Confirm move-in

Proposed result: occupation is recorded as a factual event even if the tenancy-specific dated start-day alarm evidence is missing or records a failure. Property-level installation evidence remains useful history but cannot replace the tenancy event; **Ready for occupation** may be shown before it occurs.

This factual-event treatment does not extend to every compliance gap. **Confirm move-in** remains unavailable until applicable current CP12 evidence, satisfactory EICR/remedial evidence, and resolved licence evidence where licensing **Applies** have passed the earlier **Ready for occupation** gate. There is no staff override for those items.

Missing or failed evidence creates an urgent, non-dismissible issue with a staff-entered operational target date. Zayto does not present that date as a statutory deadline and keeps the property/tenancy visibly flagged until successful repair or re-check evidence is recorded. The reviewer must confirm how the start-day duty and the “as soon as reasonably practicable” repair duty should be described before real use.

### Gate G — In-tenancy monitoring

Proposed result: recurring evidence dates, reported problems and remedial work create visible work and escalation. No overall compliant verdict is generated.

**Review question G01:** For each gate, mark every legal blocker, agency-policy blocker, warning-only item and unsupported-case escalation. State when a later change must automatically revoke the product gate.

## Landlord terms-of-business review inventory

Zayto will not author a customer's legal contract. The reviewer should approve an agency-supplied template and return a clause schedule covering the following.

### Parties, property and authority

- full legal identity and contact/service details of agent and client;
- property/instruction covered and treatment of later-added properties;
- every landlord party and signer's capacity/authority;
- landlord warranties, declarations and evidence requirements;
- lender, superior-landlord, insurer, planning and licensing consents where relevant; and
- consequences if information or authority is absent, false or changes.

### Service and operational authority

- Let only, Rent collection and Fully managed scope;
- start/end of service, minimum term if any, termination, handover and surviving obligations;
- authority to advertise, negotiate, sign or serve documents, collect money and instruct contractors;
- repair spending limits, emergencies, quotes, connected contractors and approval escalation;
- keys, access, inspections and vacant-property responsibilities; and
- boundaries for legal proceedings, notices, possession and reserved legal activities.

### Fees and money

- every mandatory, optional, conditional and third-party charge;
- VAT treatment and clear examples where needed;
- when fees become due and what occurs on cancellation, withdrawal, failed letting, termination or transfer;
- renewal, continuation, sale/introduction or post-termination commission;
- referral fees, commissions, mark-ups and conflicts;
- rent/deposit/client-money handling, authority, account route, interest and statements; and
- CMP details where applicable and the distinction from tenancy-deposit protection.

### Regulatory and property responsibilities

- gas, electrical, alarms, EPC/MEES, furniture/fire, fitness/repairs and water risk;
- HMO/selective/additional licensing and licence conditions;
- material property information and changes during marketing;
- Right to Rent responsibility and cooperation/data provision;
- deposit protection/prescribed information responsibility;
- inventories, check-in/out and document delivery;
- landlord obligations to fund, disclose, instruct and respond; and
- what the agent may pause or refuse when evidence/action is missing.

### Consumer, complaints and data

- pre-contract information and prominence of unusual/onerous terms;
- consumer/business capacity and contracting route;
- cancellation notice/form, durable confirmation and separate early-start request;
- fair variation, termination, renewal and continuing-fee treatment;
- complaints process and applicable redress scheme;
- privacy roles, notices, processors, sharing, retention and data-subject handling; and
- communications and durable-copy methods.

### Execution and change

- required signers for individuals, joint landlords and organisations;
- acceptable electronic/offline signature methods and evidence;
- effective date versus signature date;
- corrections before completion, declined/expired/void agreements;
- variation/replacement rules after completion; and
- cancellation, termination and supersession evidence.

**Required reviewer output T01:** an approved template or clause schedule, a prominence schedule for unusual/onerous terms, and a mapping from every variable field to its source and permitted values. “Use standard terms” is not sufficient.

## Agreement evidence standard for review

The proposed minimum evidence package is:

- immutable template version and final agreement snapshot;
- exact structured commercial-terms version used;
- property and contracting parties;
- each required signer, capacity and authority evidence reference;
- issue timestamp, issuer, recipients and delivery route;
- pre-contract/cancellation documents and durable-delivery evidence where applicable;
- separate early-start request where applicable;
- signature/decline/void/expiry events and timestamps;
- completed document and provider completion/evidence file, or equivalent offline evidence;
- digest of the issued and completed files;
- durable-copy delivery event for each party; and
- later variation, cancellation, termination or supersession links.

**Review question E01:** Is this sufficient for the supported contracts, and which elements are legally required, evidentially prudent, scheme-required or agency policy?

### Agreed first slice and future native signing

The fictional-data first slice uses the same durable agreement model needed later but does not create a signing ceremony:

1. staff create and review an immutable fictional agreement snapshot;
2. the agreement is marked as issued outside Zayto;
3. every required fictional signer and their authority/capacity is recorded;
4. authorised staff upload the final externally signed PDF, confirm every required signature is present and enter the overall signed/completed date shown by the document;
5. the agreement becomes complete only when the required-signature rule and evidence are satisfied; and
6. later changes create a variation or replacement rather than editing the completed snapshot.

The owner's preferred later direction is a Zayto-owned signing journey through the landlord portal. Before that is approved, a separate decision must compare native signing with an approved provider and address authentication, intent/consent, signer authority, document integrity, trusted timestamps, tamper evidence, repudiation/disputes, durable-copy delivery, accessibility, recovery, audit/export, retention, privacy, security testing and incident handling. A drawn signature alone is not an electronic-signing system.

## Compliance evidence standard for review

Each requirement should preserve:

- rule-definition version, jurisdiction, source and effective period;
- property and optional instruction/tenancy context;
- applicability assessment and assessor;
- evidence type, source, reference, event/inspection date and next review/expiry;
- actual result without translating it into a universal compliant verdict;
- remedial action, responsible party, due date and completion evidence;
- document-delivery event and recipient where required;
- human review identity/time;
- supersession history; and
- the precise product gate affected.

**Review question E02:** For R05–R15, specify the minimum accepted evidence, adverse outcomes, remedial closure evidence, delivery evidence, recurrence calculation and historical retention.

## Scenarios the reviewer must decide

Return the expected product result for each: **proceed**, **block at named gate**, **warning/agency policy**, or **specialist review**.

1. A jointly owned property where only the main contact wants to sign.
2. A company landlord where the contact's authority is not evidenced.
3. An individual consumer landlord instructing remotely and asking marketing to start immediately.
4. Terms signed, followed by a fee, service or compliance-responsibility change.
5. No gas installation or landlord-supplied gas appliance.
6. A current gas record with remedial action noted but no closure evidence.
7. An electrical report coded unsatisfactory with work said to be complete but no required confirmation.
8. Alarms recorded during onboarding but not checked on the tenancy start day.
9. An EPC rated F/G with no exemption reference, and separately with a claimed exemption not found/reviewed.
10. EPC commissioned but not yet available when staff want to advertise.
11. The address sits in an area with possible selective licensing and staff have not checked the current council scheme.
12. A licence application has been submitted but not determined.
13. A furnished property without reviewed furniture/fire evidence.
14. An ordinary-looking case later identified as an HMO or company let.
15. Signed terms uploaded as a PDF but with no reliable link to the commercial terms version.
16. An old agreement marked **Signed** while a newer instruction-terms version is current.
17. An agency that receives rent or deposits but has no recorded current CMP evidence.
18. A workspace following a redress/scheme code different from the template assumptions.
19. A late-2026 property in an area where PRS Database rollout status is unclear.
20. An expired certificate where a reminder was marked complete but no replacement evidence exists.

## Product changes C0 is expected to authorise or reject

The reviewer is not approving code. They are approving or rejecting these future product directions:

1. Replace the generic agreement milestone with a link to an immutable agreement snapshot and evidence package.
2. Invalidate instruction authority when a material terms version is newer than the completed agreement.
3. Remove the generic manager agreement exception unless a narrow reviewed rule replaces it.
4. Separate property evidence from listing, applicant and tenancy-private evidence.
5. Use stage-specific gates rather than one **Ready to market** or **Compliant** state.
6. Store rule versions and effective dates so legal changes do not rewrite history.
7. Keep law, scheme/code requirements and agency policy visibly distinct.
8. **Approved for the fictional first slice:** begin with manual evidence review and externally signed document upload. A future Zayto-owned signing journey through the landlord portal remains a separately reviewed proposal.

## Fictional-data build boundary

Before external legal/compliance validation, the proof of concept may implement and test the proposed information architecture and workflow using fictional data only. It may:

- record evidence types, applicability and review states without deciding legal sufficiency;
- show stage-specific checklists as provisional product workflow;
- preserve agreement versions, fictional signers and simulated execution evidence;
- exercise expiry reminders, remedial actions and audit history;
- exercise fictional CMP membership, certificate and disclosure states without recording or simulating financial transactions; and
- display a clear internal warning that the rules and templates are not approved for operational reliance.

It must not:

- accept or import real landlord, applicant, tenant, property-document or tenancy data;
- provide a Zayto-authored landlord contract for real signature;
- label a property, instruction, tenancy or person legally compliant;
- present candidate deadlines, applicability decisions or gate results as legal advice;
- connect production e-signing, compliance, portal or document-delivery providers; or
- be shown or supplied as ready for a real agency's operational use.

Moving beyond this boundary requires the independent review outputs and C0 acceptance record below, plus the normal security, storage and release approvals.

## C0 acceptance record

C0 legal validation is complete only when all of the following are recorded. The fictional-data build may precede this sign-off within the boundary above; real operational use may not.

- owner-approved first supported scope and explicit exclusions;
- reviewer name, organisation, role/qualification and review date;
- reviewer-marked decision sheet D01–D20;
- reviewer-corrected rule register R01–R20 with sources/effective dates;
- approved gate matrix and exception rules;
- approved landlord-terms template or clause schedule and prominence schedule;
- approved signer/capacity and consumer-contract handling;
- confirmed initial client-money, CMP, redress and code assumptions;
- unresolved items converted into explicit unsupported-case stops or future work;
- next rule-review date and named owner; and
- owner approval before C1/C2/C3 implementation begins.

## Primary-source register checked for this draft

Current as checked on 2026-10-20; the reviewer must verify currency and applicability.

- [Renters' Rights Act 2025 implementation roadmap](https://www.gov.uk/government/publications/renters-rights-act-2025-implementation-roadmap)
- [Renters' Rights Act overview for landlords](https://www.gov.uk/guidance/renters-rights-act-an-overview-for-landlords)
- [Renters' Rights Act Information Sheet 2026](https://www.gov.uk/government/publications/the-renters-rights-act-information-sheet-2026)
- [Written-statement and Information Sheet Regulations 2026](https://www.legislation.gov.uk/uksi/2026/324)
- [HSE domestic gas safety FAQs](https://www.hse.gov.uk/gas/domestic/faqlandlord.htm)
- [Electrical-safety standards guidance](https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance)
- [Smoke and Carbon Monoxide Alarm Regulations](https://www.legislation.gov.uk/uksi/2015/1693)
- [EPC marketing guidance](https://www.gov.uk/government/publications/energy-performance-certificates-for-the-construction-sale-and-let-of-dwellings/a-guide-to-energy-performance-certificates-for-the-marketing-sale-and-let-of-dwellings)
- [Domestic minimum energy-efficiency standard guidance](https://www.gov.uk/guidance/domestic-private-rented-property-minimum-energy-efficiency-standard-landlord-guidance)
- [HMO licensing](https://www.gov.uk/find-licences/house-in-multiple-occupation-licence) and [selective-licensing guidance](https://www.gov.uk/government/publications/selective-licensing-in-the-private-rented-sector-a-guide-for-local-authorities)
- [HSE legionella guidance for landlords](https://www.hse.gov.uk/legionnaires/legionella-landlords-responsibilities.htm)
- [Consumer Contracts Regulations 2013](https://www.legislation.gov.uk/uksi/2013/3134)
- [CMA fair-contract guidance](https://www.gov.uk/guidance/writing-a-fair-contract-for-customers)
- [Law Commission electronic-execution report](https://lawcom.gov.uk/project/electronic-execution-of-documents/)
- [Letting-agent redress schemes](https://www.gov.uk/redress-scheme-estate-agencies)
- [Client-money protection](https://www.gov.uk/client-money-protection-scheme-property-agents)
- [Home Office Right to Rent code](https://www.gov.uk/government/publications/right-to-rent-landlords-code-of-practice)

## Deliberately not decided here

- legal contract wording;
- whether a particular property, landlord or tenancy is compliant;
- detailed Right to Rent, deposit, referencing, AML/KYC or insurance rules;
- document-storage provider or retention periods;
- electronic-signature provider;
- local licensing status for any address;
- PRS Database or landlord-ombudsman functionality before confirmed commencement/rollout; or
- client accounting design.
