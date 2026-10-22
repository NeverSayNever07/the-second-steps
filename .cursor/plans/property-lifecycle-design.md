# A property's lettings over time

**Status:** Designed 2026-10-22 and **accepted by the owner the same day**. The lifecycle safeguards (chunk L1, below) are **built and tested**, with no migration. The tenancy model waits for Phase 3, and the structured end reason was not built (the owner did not ask for it). Decision record: [ADR-035](../../docs/adr/0035-a-property-keeps-one-instruction-across-its-tenancies.md) (Accepted).

## Why this exists

A property is let, the tenant leaves, it is let again. The landlord might leave and come back, or sell. Applicants, viewings, offers and tenancies all attach to these records, so how they relate over time is settled before the applicant work starts.

## Owner decisions (2026-10-22)

1. **The instruction carries on across tenancies.** It is the agency's standing agreement with the landlord. It ends only when the landlord or agency ends it, not when a tenant moves out. After a move-out the property is marketed again under the same instruction.
2. **A returning landlord starts with a new lead, linked to the old instruction.** An ended instruction is never reopened.

## Where each thing is stored

| Concept                 | What it is                                        | Lifetime                                                                                                    | Stored in                                                                                            |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Property**            | The physical home                                 | Permanent, never deleted                                                                                    | `properties`, plus dated ownership history and its compliance items                                  |
| **Landlord lead**       | One attempt to win a property                     | Closed as Won, Lost or Postponed and kept as history                                                        | `landlord_enquiries`, with stage history                                                             |
| **Instruction**         | The agency's standing agreement with the landlord | From instructed to ended; **spans many tenancies**; one current per property                                | `instructions`, with append-only terms, agreement, ownership-check and journey history               |
| **Listing**             | One marketing run for the home                    | Draft to Ready to advertise, then Withdrawn when let or pulled; many per instruction over time, one current | `listings`, with versions, events and media                                                          |
| **Tenancy** (Phase 3)   | One household's occupation                        | Start to move-out; many per property over time, one current                                                 | New `tenancies` table, linked to the property, the instruction and the listing it came from          |
| **Compliance evidence** | Certificates and checks                           | Belongs to the property, so it outlives every instruction and tenancy                                       | `property_compliance_*`, append-only                                                                 |
| **Documents**           | Agreement PDFs, evidence, photos, floorplans      | Kept with their owner                                                                                       | Agreement with its instruction, evidence with the property, photos and floorplans with their listing |

Nothing in this list is ever overwritten or deleted by routine work. A new instruction, listing or tenancy is always a new row beside the old one.

## What exists today (verified 2026-10-22)

- Many instructions per property over time, **one current** (`instructions_one_current_per_property`, `WHERE ended_on IS NULL`, with `properties.current_instruction_count`). A new one is allowed once the old one has ended.
- A lead produces exactly one instruction (`UNIQUE (workspace_id, enquiry_id)`), so a re-instruction needs a new won lead and a completed appraisal.
- Ending an instruction needs a free-text reason and freezes it for good; the journey becomes Withdrawn. It is never reopened.
- Many listings per instruction over time, **one current per instruction** (`WHERE state <> 'withdrawn'`). Ending the instruction withdraws the current listing; returning it to Onboarding sends reviewed listings back to Draft. A new listing does **not** copy the old one, and photos belong to one listing.
- Compliance is one item per area per property, with append-only evidence and status history.
- The property page lists every instruction (current first) and every listing including withdrawn ones. The instruction page shows only its current listing.
- **Not built:** tenancy, tenant, applicant, move-out, renewal, void period, let-agreed state.

## The design

1. **No new "letting" table.** A letting is simply listing, applicants and tenancy in sequence. A separate table would duplicate state. Instead the property shows a **derived status**, worked out when the page loads so it cannot go stale: _Not instructed, Onboarding, Ready to market, Listing in preparation, Ready to advertise (internal), Instruction ended_, with _Let_ and _Notice given_ added when tenancies arrive (the built labels avoid the word Marketing so nothing implies a property is advertised).
2. **Tenancy rules** (set now, built in Phase 3): at most one current tenancy per property (a partial unique index, like instructions). A tenancy records its instruction, the listing it came from, start date, ended date and move-out reason. A move-out ends the tenancy, **not** the instruction, and the property returns to _Ready to market (void)_.
3. **Re-marketing** is a new listing under the same instruction, with a **Start from the previous listing** option that copies the advert text. Photos are re-added or re-used by a later decision: a stored file belongs to one listing today, so reuse means copying the file, not sharing it.
4. **A returning landlord** gets a new lead pre-filled from the property and landlord, with a derived panel on the lead and the new instruction: "Earlier instruction INS-… ended on …". That needs no schema change. The old instruction stays frozen and **reinstatement is refused**.
5. **Guards to add later (small):**
   - warn when a new lead is for a property that already has an open lead or a current instruction (today a second open lead is silently allowed);
   - once tenancies exist, block ending an instruction while a tenancy is current, so the agency must choose what happens to the tenant;
   - warn when an ownership is ended while an instruction is current.
6. **Structured end reason (open, small migration later):** Landlord left, Property sold, Agency ended, Other, so reports can tell why. Recommended, not blocking.

## Scenarios

| #   | Scenario                                           | What is stored and shown                                                                                                                                                                                                        | Today                                                                                   |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | **Tenant moves out, a new tenant follows**         | Tenancy 1 ends (move-out reason). The instruction stays current. The property shows _Ready to market (void)_. Staff prepare listing B, optionally starting from listing A's text. Listing A stays as history. Tenancy 2 starts. | Listing and instruction side works; the tenancy waits for Phase 3.                      |
| 2   | **Second marketing run after a withdrawn listing** | Withdraw listing A with a reason; prepare listing B. Both listings appear on the property page.                                                                                                                                 | Works. Text is not copied yet.                                                          |
| 3   | **Landlord ends, later returns**                   | The instruction ends (frozen, reason kept, listing withdrawn). A new lead is created, pre-filled, with the earlier-instruction panel; a new appraisal and instruction follow. The two instructions read as one story.           | Works as end, new lead, new instruction. The linking panel needs the small build chunk. |
| 4   | **Landlord sells, or ownership changes**           | The old owner's ownership ends with a date (history kept) and the new owner is added. An open instruction should be reviewed: the instruction's landlords are a separate list.                                                  | Ownership history works. No warning ties it to the instruction yet. No sale workflow.   |
| 5   | **Two leads for one property**                     | A second open lead, or a lead on an instructed property, should warn and show the existing record.                                                                                                                              | Allowed silently today. Guard recommended.                                              |
| 6   | **Instruction ended while a tenant is still in**   | Must not be possible without deciding what happens to the tenancy.                                                                                                                                                              | Not applicable until tenancies exist; guard designed.                                   |
| 7   | **A lost lead is retried**                         | The lost lead stays closed. A later attempt is a new lead on the same property, shown with the earlier history.                                                                                                                 | Works (leads are not unique per property).                                              |
| 8   | **Branch transfer between instructions**           | A transfer is refused while an instruction is current; ended instructions keep the branch they had.                                                                                                                             | Works as designed.                                                                      |

## Deliverables of this step

- This note and [ADR-035](../../docs/adr/0035-a-property-keeps-one-instruction-across-its-tenancies.md) (status Proposed until the owner accepts it).
- `docs/DATA-MODEL.md`, `docs/WORKFLOWS.md` and `docs/ROADMAP.md` updated, with a small **Lifecycle safeguards** chunk listed ahead of the applicant work.

## Build chunk L1: lifecycle safeguards (built 2026-10-22, no migration)

Sonnet, small, no migration (except the optional structured end reason):

- a warning on **New landlord lead** when the property has an open lead or a current instruction (reusing the duplicate review in `core/enquiries/application/appraisals.ts`);
- an **Earlier instruction** panel on a lead and instruction for a property with ended instructions (reusing `listInstructionsForProperty` in `core/instructions/application/instruction-records.ts`);
- **Listing history** on the instruction page (reusing `listListings` with `state: "all"`);
- the derived property status on the property page, using what exists (instruction stage and listing state), with Let and Notice given added when tenancies arrive;
- **Start from the previous listing** when preparing a listing, copying the advert text.

**What was built:** the duplicate review in New landlord lead now says when a matching property already has open leads or a current instruction; a lead or instruction on a property shows its other instructions ("Earlier instructions on this property", never reopened); the instruction's History tab lists every listing prepared for it; the property page shows a derived letting status (Not instructed, Onboarding, Ready to market, Listing in preparation, Ready to advertise (internal), Instruction ended) that is worked out on load and never says anything is live; and **Start from the previous advert** prepares a new listing with the property's latest withdrawn advert text (the available-from date is left blank, and the earlier listing is untouched). Tested: unit tests for the status, database tests for the copy and the duplicate flags, and browser tests. Demo data now includes a returning landlord (Oliver Bennett, whose first instruction ended and who has a new lead).

## Out of scope

Building tenancy, applicants, viewings or offers; photo reuse mechanics; legal rules on renewals and post-termination commission (already flagged in the legal review pack); any code or migration.
