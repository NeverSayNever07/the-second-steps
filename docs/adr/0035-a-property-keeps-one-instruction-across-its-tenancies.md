# ADR-035: A property keeps one instruction across its tenancies

- **Status:** Proposed (the two core decisions were confirmed by the owner on 2026-10-22; the rest awaits acceptance)
- **Context:** Properties are let repeatedly, tenants move out, landlords leave and return, and ownership can change. The instruction, listing and (later) tenancy records all hang off the property, and applicants will attach to listings, so how they relate over time had to be settled before the applicant work. Design: `.cursor/plans/property-lifecycle-design.md`.
- **Decision:**
  - **The instruction is the agency's standing agreement with the landlord and spans many tenancies.** It ends only by an explicit End by the landlord or agency, never because a tenant moves out. There is one current instruction per property, as today.
  - **A tenancy is its own record** (built in Phase 3): at most one current per property, linked to the property, the instruction and the listing it came from, with a start date, an ended date and a move-out reason. A move-out ends the tenancy, not the instruction.
  - **A letting is not a table.** It is a listing plus applicants plus a tenancy in sequence. A property's **status is derived** when shown (Not instructed, Onboarding, Ready to market (void), Marketing, Let, Notice given, Ended), not stored.
  - **Re-marketing creates a new listing** under the same instruction; old listings, versions and media stay as history. Starting from the previous listing copies the advert text; reusing photos is a later decision.
  - **A returning landlord starts with a new lead**, pre-filled, linked by a derived "earlier instruction" panel. An ended instruction is **never reopened or reinstated**.
  - **Guards, added later:** warn on a new lead for a property with an open lead or a current instruction; block ending an instruction while a tenancy is current; warn on ending an ownership while an instruction is current.
  - **Compliance evidence stays with the property**, so it survives every instruction and tenancy. Nothing is overwritten or deleted by routine work.
- **Rules out:**
  - Ending the instruction on every move-out: the landlord would be "re-won" each time and a managed agreement would vanish between tenancies.
  - Reopening an ended instruction: breaks the rule that ended records are frozen and muddles terms and agreement history.
  - A stored letting or status column: it would duplicate state and go stale.
- **Trade-offs:** The instruction page can grow long over many lettings, so history is shown by section and time. A returning landlord repeats the lead and appraisal steps, which keeps the audit trail clean. Whether post-termination fees or renewals survive an end is a legal question, flagged in the legal review pack and not decided here.
- **Open:** a structured end reason (Landlord left, Property sold, Agency ended, Other); photo reuse between listings; sale of a property (sales are a later module).
- **Date:** 2026-10-22
