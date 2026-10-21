# Workflow review — landlord to Ready to market (October 2026)

**Status (2026-10-21):** **decided by the owner (2026-10-21)**; the record page restructure is **built** (instruction and property pages in top tabs, compliance on the instruction, next-step banner with Mark ready, current-instruction card on the property, stale agreement hint fixed). Remaining: owner hand check, C4b, C5. Prompted by the owner's feedback that the journey feels "all over the place": Ready to market has no visible next step, compliance lives only on the property, and the instruction page is too busy. Mock-ups: `/design-lab/record-pages` (development only). Nothing here changes code until the owner decides.

## Owner decisions already made (2026-10-21)

1. **Pause C4b** (compliance worklist and attention flags) until this review and the mock-ups are agreed. C4a (the property compliance section) stays as built.
2. **Compliance is shown on the instruction for information only.** Ready to market keeps its current checklist. Compliance becomes a hard gate later, at **Ready to advertise** on the listing, as the compliance plan already says.
3. **Mock up both top tabs and side tabs** for the instruction page.
4. **Mock up the property page with tabs too**, so both record pages follow one pattern.
5. This review lives in the project as a plan file.

## The journey as built today

```text
Landlord lead ──► Appraisal ──► Won ──► Start instruction (reviewed)
                                             │
                                             ▼
                       Instruction: Onboarding ──► Ready to market ──► (nothing yet)
                             │  terms, landlords, signed agreement,
                             │  ownership check, lead staff
                             ▼
                       Property (the lasting record)
                             owners · instructions · leads · compliance · notes
```

| Stage                | Record             | What staff do                                                                                                                             | Built                                     |
| -------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| New lead → appraisal | Landlord lead      | Capture, qualify, book and complete the appraisal, record the outcome                                                                     | Yes                                       |
| Start instruction    | Lead → instruction | Review the pre-filled handover and confirm                                                                                                | Yes                                       |
| Onboarding           | Instruction        | Terms, landlords and main contact, signed agreement upload, ownership check, lead staff                                                   | Yes                                       |
| Ready to market      | Instruction        | Staff press **Mark ready** once the checklist is complete (it was easy to miss in the readiness section); a material change moves it back | Yes, but it is the end of the line        |
| Compliance           | Property           | Applicability, evidence, review, history                                                                                                  | C3 and C4a; not linked to the instruction |
| Listing and onwards  | (future)           | Advertise, applicants, viewings, offers, tenancy                                                                                          | Phase 2 onwards                           |

## What makes it feel scattered

1. **Ready to market is a dead end, and getting there is easy to miss.** The **Mark ready** button sat in the readiness section header and stayed disabled until every item was met, so it was not obvious that staff move an instruction forward themselves. Once there, no screen says what happens next. Listings (Phase 2) will be the next step, but nothing tells the user that.
2. **Compliance is invisible from the instruction.** Staff onboarding a property cannot see that the gas record is missing or expired without going to the property page.
3. **The instruction page stacks six sections in one column:** Readiness, Terms, Landlords, Agreement, Ownership check and Journey history. Setup tasks, evidence and history all compete, each with its own buttons.
4. **The property page is one long column too.** The current instruction is one row in a list, with no readiness at a glance. Compliance, leads, owners, branch history and notes follow one after another, and the page will grow again with listings, tenancies and maintenance.
5. **Out-of-date wording.** The Ready to market checklist still says "Record the agreement as signed, or ask a manager for an exception", but since C2 the agreement is met only by an uploaded signed copy and agreement exceptions no longer exist. (To fix whichever way the review goes.)
6. **Two readiness words are coming.** "Ready to market" (instruction) and "Ready to advertise" (future listing, with the compliance gate) will both exist. Users need to see them as two steps on one ladder, not two competing ideas.
7. **Work starts in several places:** the dashboard onboarding panel, the Instructions worklist, and soon a compliance worklist (C4b). Where compliance attention appears should be decided with the record pages, not added as another list in isolation.
8. **Known gaps on the property:** Edit property and Transfer branch have tested services but no screens.

## Proposed model: one ladder, three records

```text
Landlord lead           Instruction                     Listing (Phase 2)
New → Appraisal → Won → Onboarding → Ready to market → Draft → Ready to advertise → Advertised → Let agreed → Tenancy
                         └──── agreement, terms ────┘          └── compliance gate ──┘
```

- **The property is the hub.** It shows the current instruction (with its stage and what is missing), previous instructions, compliance, leads and, later, listings and tenancies.
- **The instruction is the onboarding workspace.** It shows the property's compliance (read-only status, with a link or the same Update dialog: decision 3 below) so nobody has to switch pages to see a gap.
- **Ready to market shows its next step.** Until listings exist, it says plainly "Next: create the listing (coming with Marketing)". Once listings exist, it becomes a **Create listing** button.

## Proposed record page structure

Both pages keep the profile sidebar (ADR-030) for identity and key facts. The working area gets tabs instead of one long column. A tabbed working area changes ADR-030, so it needs an ADR update if adopted.

**Instruction:** Overview · Terms · Landlords & agreement · Compliance · History

- **Overview:** stage, the Ready to market checklist with one link per missing item, the next step, key terms at a glance, and a compliance snapshot (gaps and expiries).
- **Terms:** the current terms and their version history.
- **Landlords & agreement:** landlords and main contact, the signed agreement and its history, the ownership check. These are the "who is the client and have they signed" tasks.
- **Compliance:** the property's five areas (the same component as on the property).
- **History:** journey changes, agreement milestones, exceptions and ending.

**Property:** Overview · Instructions · Compliance · Leads · Notes

- **Overview:** the current instruction card (stage, checklist progress, link), a compliance summary, current owners.
- **Instructions:** current and previous instructions.
- **Compliance:** the full section built in C4a.
- **Leads:** landlord leads for the property.
- **Notes:** as today.

Tabs follow the URL (for example `?tab=compliance`), so a link can open the right tab, the browser Back button works, and the pages stay server-rendered.

## Owner decisions on the proposal (2026-10-21)

1. **Top tabs** for both record pages (ADR-030 amended).
2. **Tab names and grouping as proposed** above.
3. **Staff can update compliance from the instruction**, using the same Update dialog as the property; it is the same property record.
4. **The Ready to market next step reads as mocked:** "Next: create the listing. Marketing is coming in Phase 2; until then this is the last step", with a disabled "Create listing (soon)" button.
5. **Compliance attention goes in a dashboard panel** when C4b resumes, not a separate new list.
6. **Order of work as below.**

## Proposed order of work

1. Fix the stale agreement wording in the checklist (small, any time).
2. Restructure the instruction and property pages into the chosen tab pattern, including compliance on the instruction (a UI change; no database change).
3. Resume C4b with the attention placement agreed in decision 5, then the C5 compliance checkpoint (security review of C1–C4 together).
4. Phase 1 hardening (Chunk 9) and the Edit property and Transfer branch screens.
5. Marketing discovery: listings, Ready to advertise and the compliance gate.
