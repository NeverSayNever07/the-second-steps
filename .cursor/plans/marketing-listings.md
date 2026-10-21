# Marketing listings

**Status (2026-10-21): superseded in part by `.cursor/plans/marketing-m0-design.md` and ADR-034.** The owner approved the first marketing build on 2026-10-21: listing content plus photos and floorplans, ending at an internal **Ready to advertise**, with chunks **M0 to M6** replacing L0 to L6 below, Negotiators able to review, advertised rent read-only, the EPC hard block at Ready to advertise (not Content ready), and AI copy (L4) and the EPC lookup (L5) moved to later steps. Where this file disagrees with those two documents, they win; the sections below remain the reference for the hand-off, guardrails, AI copy direction and EPC lookup notes. **Earlier status (2026-10-20):** Product planning in progress. The hand-off from an instruction and requirement for AI-assisted marketing copy are confirmed. The staff journey, lifecycle, data boundary, permission split and delivery chunks below have been reviewed against the built product and are proposals until the owner approves the decisions called out under **Approval gate**. The EPC integration direction has been corrected after checking current official sources: public open data may assist discovery but is not proof of legal validity. This plan does not authorise a migration, external API connection, credential, paid usage, document storage, portal integration, deployment or push.

## Outcome

Let an authorised member of agency staff turn a **Ready to market** instruction into an accurate, reviewable rental listing without re-entering information Zayto already holds. The first build (M0 to M6) ends at an internal **Ready to advertise** after the owner-approved media rule (5 photos and 1 floorplan) is met. Neither state means that the property has been published to an agency website or property portal; only a real, verified integration may make that claim.

## Confirmed hand-off from the instruction

- Reaching **Ready to market** does not silently create a listing.
- The instruction shows one obvious next action: **Prepare listing**.
- Starting that action creates a separate draft listing linked to the instruction and property.
- The listing is pre-filled from the property and the instruction. Staff review the information rather than typing it again.
- The instruction remains the agreed commercial record. A listing does not silently rewrite its terms.

## Proposed staff journey

1. A staff member selects **Prepare listing** from a Ready to market instruction.
2. Zayto opens one full listing-preparation page, pre-filled with known property, rent and deposit information.
3. A visible completion summary shows what is ready, missing or needs review.
4. The page groups the work into availability, advert content, property facts, costs and deposits, EPC, and later media.
5. The staff member can ask Zayto to draft the marketing copy from the reviewed facts, then edit or regenerate individual sections.
6. The staff member can save a draft and return without losing completed work.
7. A preview shows the applicant-facing advert rather than database fields.
8. The staff member resolves the content blockers and an authorised reviewer marks the listing **Content ready**. After the media decision, the approved minimum media can unlock **Ready to advertise**.
9. Website and portal publication remain later, explicit actions with their own real statuses and history.

Use a structured full page rather than a compulsory step-by-step wizard. Experienced staff should be able to move directly to the section that needs attention. Mobile should retain the same workflow with a reachable save action and a compact completion summary.

## Government EPC evidence and lookup — revised proposal

Use the official Energy Performance Certificate Register as the source a staff member checks for an individual property. The separate open-data API for England and Wales may assist search and pre-fill, but government states that its open data must not be relied on to prove that a valid EPC exists. Its current account, token, licensing and data-protection requirements must be verified in a short integration spike before Zayto chooses an endpoint or stores a credential. Any credential remains server-only and requires separate approval.

Prefer an exact UPRN match. Until Zayto holds a verified UPRN, search by postcode and address and require the user to confirm the correct property when the result is not unambiguous.

Record evidence, not a compliance verdict. Show one of these states:

- **Current-dated certificate reviewed** — rating, certificate date, calculated expiry, certificate reference, source link, who reviewed it and when.
- **Only expired EPC found** — a current public certificate was not found.
- **No public EPC found** — check the address or record that an EPC has been commissioned.
- **Several possible matches** — the user must select the correct property.
- **Not checked** — the government service was unavailable or the lookup has not run.
- **Exemption recorded** — a separate reviewed fact; Zayto must not infer an exemption.

Never turn an empty result or a provider failure into the claim **No valid EPC exists**. The government dataset can omit opted-out records and contains expired or replaced certificates. Use **No current EPC was found in the public register**.

**Corrected 2026-10-21:** the hard EPC block is at **Ready to advertise**, not Content ready (see ADR-034); the states below beyond what the property compliance model can express (for example a separate "Exemption recorded") are part of the later EPC lookup step. The listing remains editable when a current EPC is not found. The EPC position required at Ready to advertise is one of:

- a current-dated certificate reviewed against the official register;
- dated confirmation that an EPC has been commissioned; or
- a separately reviewed and evidenced exemption.

Government guidance says an EPC must be commissioned before marketing where no valid certificate already exists and the rating must appear in commercial advertising when a valid certificate is available. Zayto records the evidence and review; it must not claim that the software has determined legal compliance. The result is a dated source record, not an editable copy of government data. Staff can refresh a future lookup, and provider timeouts, rate limits or failures must never lose listing work.

## AI-assisted marketing copy — confirmed direction

AI-generated marketing copy is part of the intended listing workflow, not merely a suggestion that staff copy into another product. The first provider may be Anthropic, through its commercial API. A personal Claude Free, Pro or Max subscription does not provide application API usage; the Anthropic Console account, API credential and prepaid usage are separate. Creating that connection or buying credits requires the owner's explicit approval.

Keep one small provider boundary inside Zayto so the first implementation can use Anthropic without making listings depend directly on one model or model name. Do not build a general multi-provider framework before a second provider is actually needed.

Proposed first experience:

- **Generate marketing copy** creates a headline, short summary, full description and concise feature highlights.
- The prompt receives only reviewed, applicant-facing listing facts. Do not send landlord details, internal notes, ownership-check information, staff data or unrelated contact information.
- The model is told to use only the supplied facts, use British English, avoid discriminatory wording, avoid unverifiable superlatives and return clearly separated fields.
- Generated text is always labelled as a draft and placed into editable fields. It never changes factual property fields and can never mark or publish a listing by itself.
- Staff can regenerate one section without replacing copy they have already approved elsewhere.
- Before **Content ready**, the ordinary listing review—not the model—checks that required facts are present and that the final copy is consistent with them.
- Manual writing remains fully supported when the provider is unavailable, the workspace has no AI entitlement, or the user prefers not to generate copy.

Store enough generation history to explain the result: workspace, listing, actor, time, provider, model identifier, prompt-template version, the approved facts supplied, generated fields, outcome and token/cost metadata where the provider returns it. Do not log the API key or full request through ordinary application logs.

The first connection should be feature-flagged for local/demo use, have conservative output and spending limits, and fail without losing listing work. The model is server-side configuration so a later model upgrade does not require changing the listing domain.

## Legal and product guardrails already established

- A written advert states one specific advertised rent. Zayto retains its history and must not encourage or accept an offer above it.
- Deposit information is reviewed in the listing even when copied from instruction terms.
- Material information is presented clearly before an applicant decides whether to proceed. Do not freeze the superseded 2023 Part A/B/C structure into the data model as if it were current statutory guidance.
- Do not publish discriminatory wording concerning applicants with children or receiving benefits.
- England is the first operational jurisdiction. Wales, Scotland and Northern Ireland require their own reviewed rules and service behaviour before use.

Property safety evidence, landlord agreement execution and later tenancy/move-in gates are designed in `.cursor/plans/property-compliance-and-landlord-agreements.md`. Listings may show relevant evidence and attention states, but they do not own reusable compliance records or imply that a property is ready for occupation.

**Owner decision (2026-10-20):** CP12, EICR and alarm gaps are visible warnings during listing/content preparation, not **Content ready** blockers. Where applicable, CP12 and EICR evidence/action becomes non-overridable at the later **Ready for occupation** gate. The tenancy-specific alarm check belongs to move-in, but Zayto must still allow staff to record that occupation actually occurred. Exact legal scope and timing require independent validation before real use.

**Owner decision (2026-10-20):** the fictional workflow blocks **Ready to advertise** while the EPC position is **Not assessed** or required evidence is missing. The gate requires reviewed EPC evidence, a recorded commissioned/awaiting state, or a reasoned **Does not apply** assessment, pending independent validation of the exact legal rule.

**Owner decision (2026-10-20):** an EPC rated **F or G** blocks **Ready to advertise** until valid exemption evidence is reviewed or specialist review is resolved. No staff role may override this fictional gate; independent review must validate the exact restriction before real use.

**Owner decision (2026-10-20):** a **Not assessed** property-licensing position does not universally block **Ready to advertise**. Licensing attention may be shown, but agencies outside relevant licensing areas must not be forced through a blanket assessment for every listing.

**Owner decision (2026-10-20):** licensing remains a warning during advertising. If staff record that licensing **Applies**, missing or unresolved evidence blocks the later **Ready for occupation** gate without staff override; pending applications and scheme-specific exceptions require specialist review.

**Owner decision (2026-10-20):** authorised staff record licensing applicability manually in the fictional MVP. Postcode or council-scheme detection is deferred until reliable official data and reviewed scheme rules support a separately approved implementation.

**Owner decision (2026-10-20):** alarm installation evidence does not replace the tenancy-specific operational check. A property may show **Ready for occupation** beforehand. Missing or failed start-day evidence does not prevent recording the factual move-in; it creates urgent unresolved work until successful repair or re-check evidence is recorded.

**Owner decision (2026-10-20):** the alarm treatment is a narrow exception. Staff cannot **Confirm move-in** without applicable current CP12 evidence, satisfactory EICR/remedial evidence, and resolved licence evidence where licensing **Applies**; those hard blocks have no staff override.

Current official sources checked for this plan:

- [Rental bidding guidance](https://www.gov.uk/government/publications/rental-bidding-a-guide-for-local-authorities-and-councils/rental-bidding-a-guide-for-local-authorities-and-councils): for relevant English tenancies, a written advert must state one specific rent and must not invite, encourage or accept a higher offer.
- [EPC guidance for marketing dwellings](https://www.gov.uk/government/publications/energy-performance-certificates-for-the-construction-sale-and-let-of-dwellings/a-guide-to-energy-performance-certificates-for-the-marketing-sale-and-let-of-dwellings): commission an EPC before marketing where needed and include the rating in commercial media when available.
- [Government material-information consultation](https://www.gov.uk/government/consultations/material-information-in-property-listings/material-information-in-property-listings): current consumer law is principle-based and the government has not published a definitive lettings field checklist. Zayto therefore records reviewed facts and does not label a fixed checklist as legal compliance.

## Data and history principles

- A listing belongs to one instruction and one property inside the verified workspace.
- Creating it takes an explicit initial snapshot of relevant property and instruction facts. Later source changes do not silently alter an advert that staff reviewed.
- The page identifies facts that now differ from their source and lets the user choose a reviewed update.
- Advertised rent, readiness changes and future publication attempts keep append-only history with actor and time.
- Store the government certificate reference, UPRN where available, rating, relevant dates, lookup time and source. Avoid copying government-supplied address fields into Zayto where Zayto already owns the operational address.
- Every query, mutation and provider result remains workspace-scoped. The government credential is server-only and must never be sent to the browser or written to logs.

## Proposed listing lifecycle

- An instruction can have several historical listings over time but only one current listing. **Prepare listing** opens that current listing rather than creating a duplicate.
- Starting requires a current instruction at **Ready to market**. Creation copies a deliberate snapshot of the approved instruction terms and selected property facts; it does not move or rewrite either source.
- States are **Draft**, **Content ready**, **Ready to advertise** (internal only, needs the minimum media) and **Withdrawn**. **Advertised**, portal-specific states and applicant availability wait for the publication slices.
- Saving a draft does not imply review. Marking **Content ready** creates an append-only event with actor and time.
- A material source difference—including advertised rent, deposit offering, address or core property facts—is shown clearly and blocks a new readiness confirmation until the user reviews whether to update the listing snapshot. Source records never silently replace reviewed advert content.
- Ending the instruction withdraws its current listing in the same operation. Returning the instruction to Onboarding removes **Content ready** in the same operation and records why. The listing and its history remain visible.
- Withdrawing a listing requires a reason. A later marketing attempt creates a new listing rather than erasing the previous advert history.

## Proposed first content boundary

The manual listing must work without either external integration. Its first reviewed version contains:

- one advertised rent in integer pence and its period, copied from instruction terms and read-only on the listing (owner decision 2026-10-21; a change in the agreed rent is shown as drift to accept);
- availability date and a plain-language availability note, without inventing a fixed tenancy term;
- headline, short summary, full description and concise feature highlights;
- reviewed copies of the address, property type, bedrooms, bathrooms, receptions, furnished status, council-tax band, parking, outdoor space and selected features that already exist in the property record;
- reviewed deposit presentation copied from the instruction, kept separate from future money handling;
- an EPC evidence state and its dated evidence; and
- a plain-language material-information section for facts the agent determines an applicant needs to know.

The product must distinguish **copied from source**, **edited for this advert**, **not supplied**, and **not applicable** where that distinction affects review. It must not present the material-information section or readiness result as a legal-compliance certificate.

The initial snapshot and each reviewed replacement are immutable versions; the highest version number is current (the earlier current-version pointer was dropped on 2026-10-21 as a race source). This keeps the exact content that was approved without building portal publication history prematurely. Draft autosave is not proposed; the full page uses one explicit **Save draft** action.

## Proposed permissions

All access remains limited by the listing's verified workspace and responsible branch, with the same branch boundary as its property and instruction.

| Permission        | Proposed roles                                                    | Purpose                                                                                                                       |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `listing.read`    | All current staff roles, including Read Only, within branch scope | View the listing and its history.                                                                                             |
| `listing.prepare` | Account Owner, Agency Admin, Branch Manager, Negotiator           | Create and edit drafts and request AI copy.                                                                                   |
| `listing.review`  | Account Owner, Agency Admin, Branch Manager, Negotiator           | Mark Content ready and Ready to advertise, return to Draft, and withdraw (owner decision 2026-10-21: Negotiators may review). |

Property Managers and Accounts would initially have read-only listing access. Feature flags and future commercial entitlements can hide the module, but never grant these permissions. Owner decision (2026-10-21): Negotiators may also perform the final content review.

## Proposed screen shape

- Add **Prepare listing** as the single primary next action on a current Ready-to-market instruction. If a current listing exists, label the action **Open listing**.
- Add a Marketing worklist with Draft, Content ready and Withdrawn filters, responsible branch, staff owner, last updated time and a clear attention reason.
- Use one responsive full page, not a wizard: a compact completion rail/summary, then flat sections for availability and costs, advert copy, property facts, material information and EPC evidence. Use a sticky mobile save action.
- Preview opens an applicant-facing presentation of the saved version. It never simulates a named portal or says the advert is live.
- Source differences, missing blockers, provider failure and permission denial all have explicit recovery paths. Manual copy remains available when AI is disabled or unavailable.

## Delivery chunks (superseded)

**Superseded 2026-10-21:** the chunks below (L0 to L6) are replaced by M0 to M6 in `marketing-m0-design.md`. L1 to L3 map to M1 to M4, media is M5 and M6, and L4 (AI copy) and L5 (EPC evidence and lookup) are later steps. They are kept for their gate and test detail.

## Approval-ready delivery chunks (original)

Each chunk ends with its focused tests and a short done/tested/unverified record. A later chunk does not need to be approved merely to begin an earlier independent one.

### L0 — owner decisions and design gate

- Decide the interim milestone name: recommended **Content ready** until approved media exists, or approve a defensible media-free meaning for **Ready to advertise**.
- Decide whether only managers perform the final review (recommended initially) or Negotiators may do so.
- Confirm all four copy fields (recommended): headline, short summary, full description and feature highlights.
- Confirm the initial lifecycle, one-current-listing rule, first content boundary and deliberate exclusions.
- Produce the proposed relational model, invariants, permission matrix and screen sketch for review. No migration.

**Gate:** owner approval of these product and data decisions. Any different decision is recorded here before implementation.

### L1 — listing foundation

- Add the approved listing, immutable content-version and lifecycle-history tables, workspace-aware relationships, one-current-listing invariant, branch scope, RLS and narrow permissions.
- Add domain validation for states, source snapshots, rent, dates, copy lengths and withdrawal reasons.
- Test cross-workspace, hidden-branch, role, malformed-input, race and history cases on the disposable database.

**Gate:** independent security review, full database suite, and separate owner approval before applying the migration to shared Supabase.

### L2 — manual listing services and instruction hand-off

- Add atomic **Prepare listing**, get/list, save-version, mark-content-ready, return-to-draft and withdraw services with audit events.
- Open an existing current listing instead of creating a duplicate.
- Couple instruction return/end actions to listing readiness/withdrawal without losing history.
- Detect material source differences and require explicit review; never silently sync them.

**Gate:** focused unit and integration tests for rollback, duplicate races, branch/role denial, source drift and instruction lifecycle coupling.

### L3 — manual listing screens

- Build the instruction action, Marketing worklist, structured preparation page, completion summary and applicant-facing preview.
- Cover loading, empty, not-found, error and provider-unavailable states from the start, even though providers remain disabled.
- Verify keyboard use, accessible names/headings, mobile/tablet/desktop, light/dark/system themes and long advert copy.

**Gate:** relevant browser tests plus `npm run check` and production build. At this point the manual Content-ready workflow is useful without an external provider.

### L4 — AI copy generation

- Behind a local/demo feature flag, add one small provider interface and a server-only adapter for the separately approved provider.
- Send only the reviewed applicant-facing facts, apply per-request/output limits and a workspace spending stop, and return structured fields for staff editing.
- Persist the approved generation audit described above, including provider retention assumptions, without secrets or general application-log payloads.
- Support full and one-section regeneration without overwriting other edited sections.

**Gate:** separate owner approval for the provider, data-processing terms, API credential and spending limit before connection; failure/timeout and redaction tests before use.

### L5 — EPC evidence and optional lookup

- First build the manual evidence states, official-register link and reviewed/commissioned/exemption record so listing work does not depend on an API.
- Run a short spike against the then-current official developer service to verify endpoint, bearer-token lifecycle, permitted use, address/UPRN matching, update delay, opt-outs, rate limits and data-controller obligations.
- Only after approval, add the server-only lookup adapter with ambiguous-result selection, safe refresh and failure recovery.

**Gate:** separate owner approval for the government account/credential and integration. Test ambiguous addresses, old/replaced certificates, no result, opt-outs represented as unknown, timeout and rate limiting.

### L6 — milestone checkpoint and next boundary

- Independently review listing reads/writes, AI data minimisation, audit history, accessibility and applicant-facing claims.
- Run the proportionate full gate: unit, database/RLS, integration, browser, formatting, type and build checks.
- Update architecture, data model, permissions, workflows and roadmap with implemented versus deferred scope.
- Decide private media storage and the minimum media rule before adding **Ready to advertise**; separately decide website-feed or portal publication before any live status exists.

**Gate:** declare only the manual content workflow ready. Do not claim external publication, EPC compliance, legal completeness or portal compatibility.

## Deliberately outside the first slice

- Publishing to Rightmove, Zoopla, OnTheMarket, an agency website or social media
- Claiming a portal has accepted, rejected or removed a listing
- Applicant records, property enquiries, viewings, offers or applications
- Photo and floor-plan storage, ordering and minimum-media rules before the private document-storage decision
- Autonomous AI publication or generation from unreviewed notes, documents or photographs
- Supplier-specific portal field mappings

## Approval gate

**Resolved 2026-10-21:** the owner approved the first build (see the status line): Ready to advertise (internal) after the media rule, Negotiators may review, and AI copy later. The original questions were:

Implementation must not start until the owner decides the three L0 questions: **Content ready** versus a media-free **Ready to advertise** state; manager-only review versus allowing Negotiators to review; and all four AI copy fields versus a smaller set. The recommendations are Content ready, manager-only review initially, and all four copy fields. Reusable agency tone and wording preferences can follow after the basic generation and review loop is proven.
