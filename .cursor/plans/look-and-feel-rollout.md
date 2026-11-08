# Look and feel rollout (ADR-038)

**Status:** Decided by the owner on 2026-11-08. L1 to L3 and the landlord lead, contact and property modals (L4) are built; the applicant modal follows A4. Nothing is committed yet. The reference mock-ups are `/design-lab/look-and-feel-2` (Crisp Slate, blue box, key facts inside the box, create in a modal) and `/design-lab/look-and-feel` (round one). Dashboards are out of scope until the owner decides.

## Stages

| Stage | Content                                                                                                                                                                                                               | Gate                                                                  | Model  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| L1    | Design tokens: Crisp Slate palette in `styles/globals.css` (light and dark), radius reduced, `--sidebar` dark navy; update `styles/theme-contrast.test.ts` pairs                                                      | Unit tests, contrast checks, a look at every screen in light and dark | Sonnet |
| L2    | Shared components: `Input`, `Select` trigger, `Textarea`, `Button`, `Table` header, `Dialog` and `Sheet` use the compact white-field style from the tokens, not per-screen classes                                    | Unit tests, browser tests, light/dark/phone                           | Sonnet |
| L3    | A shared record header box (name, reference, badges, actions, key facts inside) and a compact list page header with one toolbar row; apply to contacts, landlords, properties, instructions, listings, landlord leads | Browser tests, light/dark/phone                                       | Sonnet |
| L4    | Convert create forms to modals, one at a time: landlord lead (with duplicate review as a second step), contact, property, then applicant; bottom sheet on phones                                                      | Browser tests for each, keyboard and focus checks                     | Sonnet |
| L5    | Update `.cursor/rules/ui-design.mdc`, ADR-017/030 notes, remove the lab mock-ups or keep them as reference                                                                                                            | Owner review                                                          | Haiku  |

## Notes

- Applicant screens (A4) resume after L3, so the list and record pages are built once in the new look. The New applicant form is built as a modal from the start.
- Decide before L4 which existing full-page create flows keep a full page (long or multi-stage tasks).
- Check dark mode for the blue box and the dark sidebar as part of L1.

## Progress (2026-11-08)

- **L1, L2:** palette, radius, compact fields, buttons, table header and dialog are in the shared tokens and `components/ui`.
- **L3:** `RecordHeader` and `ListPageHeader` are applied to contacts, properties, instructions, listings, landlord leads, applicants and the list pages. New `record` colour tokens have contrast checks. Merging the search row into the filter row is still open.
- **L4:** landlord lead (two-step modal; bedrooms, bathrooms and the landlord's own address moved to the records), contact (identity and contact methods; addresses and preferences on the record) and property (address, type, rooms, branch, owners; features, council tax, floor area and notes through Edit) are modals. The applicant modal is built with A4.
- **L5:** `.cursor/rules/ui-design.mdc` updated. ADR-017 and ADR-030 are partly superseded by ADR-038 (not edited).
- **Open:** the lab pages are kept as reference for now; the security review of the `core/access/` timeout change; the 5 non-styling e2e failures (dev badge covering the phone menu button, calendar tests needing entries today).
