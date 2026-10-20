# Marketing listings

**Status (2026-10-20):** Product planning in progress. The hand-off from an instruction, EPC lookup behaviour and requirement for AI-assisted marketing copy below are confirmed. The remaining workflow, data model, permissions and delivery slices are proposals until reviewed with the owner. This plan does not authorise a migration, external API connection, credential, paid usage, document storage, portal integration, deployment or push.

## Outcome

Let an authorised member of agency staff turn a **Ready to market** instruction into an accurate, reviewable rental listing without re-entering information Zayto already holds. The first slice ends with a listing marked **Ready to advertise** inside Zayto. It must not claim that a property has been published to an agency website or property portal until a real, verified integration has done so.

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
8. The staff member resolves blocking issues and marks the listing **Ready to advertise**.
9. Website and portal publication remain later, explicit actions with their own real statuses and history.

Use a structured full page rather than a compulsory step-by-step wizard. Experienced staff should be able to move directly to the section that needs attention. Mobile should retain the same workflow with a reachable save action and a compact completion summary.

## Government EPC lookup — confirmed direction

Use the official Energy Certificate Data API for properties in England and Wales. The integration requires a GOV.UK One Login bearer token held only on the server. Connecting it and storing the credential require a separate approval when implementation reaches that slice.

Prefer an exact UPRN match. Until Zayto holds a verified UPRN, search by postcode and address and require the user to confirm the correct property when the result is not unambiguous.

Show one of these states:

- **Current EPC found** — rating, certificate date, calculated expiry, certificate reference, source link and last-checked time.
- **Only expired EPC found** — a current public certificate was not found.
- **No public EPC found** — check the address or record that an EPC has been commissioned.
- **Several possible matches** — the user must select the correct property.
- **Not checked** — the government service was unavailable or the lookup has not run.
- **Exemption recorded** — a separate reviewed fact; Zayto must not infer an exemption.

Never turn an empty result or a provider failure into the claim **No valid EPC exists**. The government dataset can omit opted-out records and contains expired or replaced certificates. Use **No current EPC was found in the public register**.

The listing remains editable when a current EPC is not found. The proposed Ready to advertise gate requires one of:

- a current EPC linked to the listing;
- confirmation that an EPC has been commissioned; or
- a reviewed exemption.

The EPC result is a dated source record, not an editable copy of government data. Staff can refresh the lookup. The application must handle timeouts, rate limits and provider failures without losing listing work.

## AI-assisted marketing copy — confirmed direction

AI-generated marketing copy is part of the intended listing workflow, not merely a suggestion that staff copy into another product. The first provider may be Anthropic, through its commercial API. A personal Claude Free, Pro or Max subscription does not provide application API usage; the Anthropic Console account, API credential and prepaid usage are separate. Creating that connection or buying credits requires the owner's explicit approval.

Keep one small provider boundary inside Zayto so the first implementation can use Anthropic without making listings depend directly on one model or model name. Do not build a general multi-provider framework before a second provider is actually needed.

Proposed first experience:

- **Generate marketing copy** creates a headline, short summary, full description and concise feature highlights.
- The prompt receives only reviewed, applicant-facing listing facts. Do not send landlord details, internal notes, ownership-check information, staff data or unrelated contact information.
- The model is told to use only the supplied facts, use British English, avoid discriminatory wording, avoid unverifiable superlatives and return clearly separated fields.
- Generated text is always labelled as a draft and placed into editable fields. It never changes factual property fields and can never mark or publish a listing by itself.
- Staff can regenerate one section without replacing copy they have already approved elsewhere.
- Before **Ready to advertise**, the ordinary listing review—not the model—checks that required facts are present and that the final copy is consistent with them.
- Manual writing remains fully supported when the provider is unavailable, the workspace has no AI entitlement, or the user prefers not to generate copy.

Store enough generation history to explain the result: workspace, listing, actor, time, provider, model identifier, prompt-template version, the approved facts supplied, generated fields, outcome and token/cost metadata where the provider returns it. Do not log the API key or full request through ordinary application logs.

The first connection should be feature-flagged for local/demo use, have conservative output and spending limits, and fail without losing listing work. The model is server-side configuration so a later model upgrade does not require changing the listing domain.

## Legal and product guardrails already established

- A written advert states one specific advertised rent. Zayto retains its history and must not encourage or accept an offer above it.
- Deposit information is reviewed in the listing even when copied from instruction terms.
- Material information is presented clearly before an applicant decides whether to proceed. Do not freeze the superseded 2023 Part A/B/C structure into the data model as if it were current statutory guidance.
- Do not publish discriminatory wording concerning applicants with children or receiving benefits.
- England is the first operational jurisdiction. Wales, Scotland and Northern Ireland require their own reviewed rules and service behaviour before use.

## Data and history principles

- A listing belongs to one instruction and one property inside the verified workspace.
- Creating it takes an explicit initial snapshot of relevant property and instruction facts. Later source changes do not silently alter an advert that staff reviewed.
- The page identifies facts that now differ from their source and lets the user choose a reviewed update.
- Advertised rent, readiness changes and future publication attempts keep append-only history with actor and time.
- Store the government certificate reference, UPRN where available, rating, relevant dates, lookup time and source. Avoid copying government-supplied address fields into Zayto where Zayto already owns the operational address.
- Every query, mutation and provider result remains workspace-scoped. The government credential is server-only and must never be sent to the browser or written to logs.

## Deliberately outside the first slice

- Publishing to Rightmove, Zoopla, OnTheMarket, an agency website or social media
- Claiming a portal has accepted, rejected or removed a listing
- Applicant records, property enquiries, viewings, offers or applications
- Photo and floor-plan storage before the private document-storage decision
- Autonomous AI publication or generation from unreviewed notes, documents or photographs
- Supplier-specific portal field mappings

## Next product decision

Agree whether the first generator should create all four proposed fields—headline, short summary, full description and feature highlights—or start with a smaller set. Reusable agency tone and wording preferences can follow after the basic generation and review loop is proven.
