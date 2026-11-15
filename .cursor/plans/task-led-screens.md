# Task-led screens (ADR-039)

**Status:** Approved by the owner on 2026-11-15 after comparing the mock-ups at `/design-lab/next-ideas` (fictional data). T1 is built. Nothing else is started. Fictional data only.

## Why

The 2026-11-15 review found the screens consistent but built around records, not the agent's job. The owner approved three ideas: a journey bar with one Next step on records (with a light header), lists you work from, and a dashboard Home that is the person's day.

## Stages

| Stage      | Content                                                                                                                                                                                                                | New reads or writes                                                                                     | Gate                                                                                     | Model                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| T1         | Light record header on every record page (shared `RecordHeader`); ADR-039; rule update                                                                                                                                 | None                                                                                                    | Light, dark and phone check                                                              | Sonnet                                                 |
| T2         | **Your day** on the dashboard Home: Now, Today, This week from the existing actions list, today's appraisals, the compliance attention items and waiting property enquiries; figures as one strip; the diary beside it | One read service that merges existing, already-scoped reads; no new tables                              | Application tests for scope (branch, role, other agency), browser test, light/dark/phone | Sonnet                                                 |
| T3         | **Working lists**, Landlord leads first: views with counts (Needs action, Mine, All open, Won), filter as you type, preview beside the list with Done and the next action                                              | Counts per view; a preview read (the existing lead view); the existing complete and add action services | Application tests for the counts' scope, browser test, keyboard and phone check          | Sonnet                                                 |
| T4         | Roll the working list out to Applicants, Property enquiries, Instructions, Properties and Listings, one at a time; make the Listings page match                                                                        | As T3 per list                                                                                          | Browser test each                                                                        | Sonnet                                                 |
| T5         | **Journey bar and Next step** on the property and instruction records: stages derived from the lead, appraisal, instruction, listing and enquiries that exist; Viewings and Let shown as still to come until built     | One derived read; no new rules or gates                                                                 | Unit tests for the derivation, application tests for scope, browser test                 | Opus for the derivation design, Sonnet for the screens |
| T6         | **One timeline per record** and hiding empty details behind one link                                                                                                                                                   | A read that merges notes, stage and status history, actions and documents a person can already see      | Application tests for scope and for private notes staying private; independent review    | Opus                                                   |
| Checkpoint | Full suites, independent `review-security` of T2 to T6 reads, owner walk-through                                                                                                                                       |                                                                                                         | Owner                                                                                    | Opus                                                   |

## Notes and open points

- **Order against viewings (Stage B), owner decision 2026-11-15:** T2 (Your day), then T3 (working list on Landlord leads), then Stage B viewings, then T5 (journey bar) once viewings exist so its Viewings stage is real. T4 and T6 are placed when those are done.
- **Do not invent rules.** The journey and Next step only reflect existing records and gates. "Needs attention" repeats the existing compliance attention items; it never decides compliance.
- **Phone:** the journey bar needs its own small-screen design (the mock-up scrolls sideways inside its box and starts before the current stage).
- **Photos on property and listing rows** were raised in the review and not mocked up; they wait for the thumbnail work already recorded in the marketing plan.
- **Dashboard tabs:** Your day replaces the Home tab only. The long Landlords & instructions tab is reviewed after T3, when the working list may make most of it unnecessary.
- **Clean-up when the Design Lab goes:** remove the `record` colour tokens and their contrast pairs.

## Progress

- **T1 (2026-11-15):** `RecordHeader` is a white box with a border; checked on the landlord lead, instruction, listing, applicant, contact and property records in light, and instruction and listing in dark, and the applicant on a phone. `.cursor/rules/ui-design.mdc` and ADR-039 are written.
