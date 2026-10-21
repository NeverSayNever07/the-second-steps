# Properties and ownership (Chunk 4)

**Status:** Approved by the owner on 2026-10-16, including the starter feature list. Stage 4A (database and security) is complete: disposable-database tests pass, an independent Opus review ran on 2026-10-16 (see the review notes below), and with owner approval the migration was applied to shared development Supabase and verified on 2026-10-16. Next: 4B services. 4B must show a friendly message when archiving a contact who still owns a property.

## Handover (2026-10-16)

**Built and live in development:** properties, owners (with a lead landlord and full ownership history), branch transfers, notes, duplicate-address warnings and search, in the database, services and screens. Everything is applied to shared development Supabase, committed and pushed.

**Where things are**

- Screens: Properties in the navigation (`app/dashboard/w/[workspaceSlug]/properties/`), a Properties section on each contact, and the **Manage owners** dialog on the property record.
- Logic: `core/properties/` (rules in `domain/`, database work in `application/`). Contact services are reused for owner search and quick-add.
- Database: migrations `20261016100000_properties_and_ownership` and `20261016140000_property_integrity_hardening`. The app can never delete property data, and every table is workspace-scoped with row-level security.
- Tests: `tests/integration/property-security.test.ts` (database rules), `tests/integration/property-application.test.ts` (services), `core/properties/domain/property.test.ts`, and `e2e/properties.spec.ts` (browser, read-only). Run `npm run test:integration` (needs Docker) for the first two.
- Demo data: nine fictional properties and three extra contacts in the Oakfield sandbox workspace, plus one archived browser-check property ("Zzz Browser Check Close").

**Not built yet**

- **Transfer branch** screen. `transferPropertyBranch` already exists and is tested, so only the dialog remains. **Edit property** was built on 2026-10-21 (an Edit property button on the property page opening the property form pre-filled, without the branch and owners; independently security-reviewed, Green).
- Recording a past owner directly (today an owner is added as current, then ended).
- Photos, listings, rent, property journey, the Landlords area (Chunk 8), property merge, CSV import and address lookup (see "Deliberate exclusions").

**Things to know before changing this area**

- New server actions must read browser-supplied values by name and validate ids (`core/properties/domain/ids.ts`). Never spread a browser object into a call carrying `authSubject`.
- A change that writes more than once must throw `PropertyRollback` after its first write, or the earlier writes are kept.
- The branch-transfer safeguard needs the transfer record inserted with plain SQL, because it relies on the database's own transaction time.
- Restart the dev server after `prisma generate`, or pages fail with "Cannot read properties of undefined".
- The ownership count on contacts is maintained only by a database trigger. Do not write it from the application.

**Open decisions for the owner:** whether ending an ownership should remove the owner's branch visibility, whether a user may learn that a contact owns a property they cannot see, and whether role checks should also be enforced in the database. Details are under "Independent security review".

## Implementation notes (4A, 2026-10-16)

- **Current-owner archive rule:** the person archiving a contact may not be able to see the owned property, so a visibility-limited lookup could miss it. Contacts carry `current_property_ownership_count`, kept by a database trigger on ownership changes and never writable by the application; a check constraint stops an archived or merged contact having current ownerships.
- **Branch transfers:** the database refuses a responsible-branch change unless the same actor inserted a matching transfer record in the same transaction. Sharing owners with the new branch is done by the 4B transfer service and tested there.
- **Owner branch link:** the 4B services create the owner's non-primary branch link before inserting the ownership, because the ownership policy requires the owner to be visible.
- **Floor area** is stored as a whole number in the chosen unit.
- **Former owners:** the database permits an ownership to be stored as already ended, but the 4B services only create current ownerships and then end them (with a reason). Recording a past owner directly would be a later addition. Only current ownerships count towards the archive rule.
- **Contact archive:** archiving a contact who currently owns a property returns `owns_property`, shown on the contact page, instead of a raw database error.
- **Notes:** blank time means "now", as for contact notes, so the edit form must send the note's original time back.
- **Property notes** have no branch or visibility column: they follow the property's visibility.

## Outcome

Authorised staff can create a UK property in their branch, record its address and characteristics, record its current and former owners (people or organisations) with one lead landlord contact, add notes, and find it again. A contact's record shows the properties they own or have owned.

## Owner decisions (2026-10-15)

Confirmed earlier in `.cursor/plans/landlord-property-onboarding.md` and still binding: a property is a permanent record; several individual or organisation owners with no percentages; one current owner may be the lead landlord contact; ownership keeps known start and end dates and former owners are history; structured manual addresses; the agreed property types, furnished statuses, characteristics, and features; photos, listings, instructions, rent, and the property journey are later chunks.

Decided now:

- **Owners:** any staff member who can create a property may record its owners while creating it. Adding an owner to an existing property, ending an ownership, or changing the lead landlord contact needs Branch Manager or higher.
- **Owner visibility:** recording an owner gives that contact a non-primary branch link to the property's responsible branch, as for organisation-person links. Audited.
- **Notes:** properties get the same notes timeline as contacts in this chunk.
- **Navigation:** add a **Properties** area now. The **Landlords** area waits for Chunk 8, when its agreed columns can be filled.
- **Responsible branch:** a Branch Manager or higher may transfer a property between branches they manage, with a reason. The old branch, new branch, actor, date, and reason are kept.

## Independent security review (2026-10-16)

A separate Opus agent reviewed the migration, services, actions and tests, and ran the full suites (no tenant-isolation break was found in the row-level security rules). Findings and outcomes:

- **High, fixed:** `findDuplicatePropertiesAction` spread browser-supplied fields after the signed-in identity, so a crafted call could replace the identity or workspace. It now reads named fields only. All other actions were checked: browser-supplied ids, objects and query text are now validated and length-capped (`core/properties/domain/ids.ts`). Rule for future actions: never spread a browser-supplied object into a call that carries `authSubject`.
- **Medium, fixed in migration `20261016140000_property_integrity_hardening`:** a session able to run its own SQL could use temporary tables or functions to shadow the real tables read by triggers (bypassing the transfer record rule and the ownership count). Every function we own now has a pinned search path, and the count can only be changed by a SECURITY DEFINER ownership trigger (checked through `current_user <> session_user`, not trigger depth).
- **Low-medium, fixed in the same migration:** the transfer history could contain fake "reverse" transfers. There is now one transfer per property per transaction, and a record must match where the property actually ended up.
- **Low, fixed in the services:** ownership changes now lock the property row (as branch transfers already did) so they cannot race a transfer, and uniqueness or check clashes from races or hidden rows return `invalid_state` instead of an error page.
- **Tests added:** phantom transfer, temporary-table transfer history, temporary trigger function against the count, temporary contacts table, and a hidden lead landlord. The first four were confirmed to fail without the migration.
- **For the owner to decide (not defects):** (1) adding an owner or transferring a property gives that branch lasting visibility of the owner contact, and ending the ownership does not remove it; (2) the archive refusal and the stored count tell a user that a contact owns a property they cannot see; (3) the transferred-to branch sees all earlier notes and the transfer reasons; (4) role checks are in the application only, not in row-level security, as for contacts.

## Data design

All tables are workspace-owned, use workspace-aware composite foreign keys, force RLS, and give the runtime role no DELETE.

### `Property` → `properties`

| Field                                                                                                  | Rule                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `reference`                                                                                            | Immutable readable reference `PRP-XXXXXXXX`, unique per workspace                                        |
| `responsibleBranchId`                                                                                  | Required; changes only through a branch transfer                                                         |
| `status`                                                                                               | `active` or `archived` (archive is Branch Manager or higher)                                             |
| `addressBuilding`, `addressStreet`, `addressLocality`, `townCity`, `county`, `postcode`, `countryCode` | Building/flat optional; street, town/city and postcode required; postcode validated and normalised; `GB` |
| `normalizedAddressKey`                                                                                 | Derived from building, street, and postcode for duplicate warnings; never shown                          |
| `propertyType`                                                                                         | Detached, semi-detached, terraced, bungalow, flat/apartment, maisonette, room, other                     |
| `bedrooms`, `bathrooms`, `receptionRooms`                                                              | Optional whole numbers, 0–50                                                                             |
| `floorArea`, `floorAreaUnit`                                                                           | Optional; unit `sq_ft` or `sq_m`; both or neither                                                        |
| `furnishedStatus`                                                                                      | Optional: furnished, part furnished, unfurnished, flexible                                               |
| `features`                                                                                             | Codes from the system list below                                                                         |
| `parkingNotes`, `outdoorSpaceNotes`                                                                    | Optional free text for unusual details (≤ 500)                                                           |
| `councilTaxBand`                                                                                       | Optional England band A–H                                                                                |
| `generalNotes`                                                                                         | Optional internal summary (≤ 2,000); dated discussion belongs in the notes timeline                      |
| `createdByMembershipId`, `createdAt`, `updatedAt`, `archivedAt`                                        | Standard                                                                                                 |

### `PropertyOwnership` → `property_ownerships`

| Field                               | Rule                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `propertyId`, `contactId`           | Same-workspace keys; the contact may be a person or an organisation, not a merged record |
| `isLead`                            | At most one current lead per property (partial unique index)                             |
| `startedOn`, `endedOn`              | Optional known dates; `endedOn` on or after `startedOn`                                  |
| `endedAt`, `endReason`              | Set when an ownership ends; ended rows are never reopened or deleted                     |
| `createdByMembershipId`, timestamps | Standard                                                                                 |

One current ownership per property and contact (partial unique index). A trigger keeps ownership fields immutable apart from ending and the lead marker.

### `PropertyBranchTransfer` → `property_branch_transfers`

Append-only: `propertyId`, `fromBranchId`, `toBranchId`, `reason` (required, ≤ 500), actor, timestamp. Written in the same transaction as the branch change.

### Property notes

Same design as contact notes (`.cursor/plans/contact-notes.md`), in separate `property_notes` and `property_note_revisions` tables so the reviewed contact-notes rules stay unchanged. One difference: a property has one responsible branch, so property notes are visible to everyone who can see the property and there is no "share with all branches" option. After a transfer, the new branch sees the property's full history.

## Database security (RLS)

- **Properties:** visible to workspace-scoped members, or to named-branch members whose branches include the responsible branch. Inserts and updates must keep the responsible branch within the actor's scope.
- **Ownerships:** visible only when both the property and the owner contact are visible, so a hidden contact never appears through a property.
- **Transfers and property notes:** visible when the property is visible; notes and revisions follow the contact-notes rules otherwise.
- **Branch transfer:** the transfer also shares every current and former owner with the new branch, so the property's owner history stays complete and visible there.

## Permissions

| Permission                                      | Granted to                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `property.read`                                 | Every role, within branch scope                                           |
| `property.create`                               | Account Owner, Agency Admin, Branch Manager, Negotiator, Property Manager |
| `property.update`                               | As create, plus Accounts                                                  |
| `property.archive`                              | Account Owner, Agency Admin, Branch Manager                               |
| `property.ownership.manage`                     | Account Owner, Agency Admin, Branch Manager                               |
| `property.branch.transfer`                      | Account Owner, Agency Admin, Branch Manager                               |
| `property.note.create` / `property.note.manage` | As the matching contact-note permissions                                  |

Contacts with a current ownership cannot be archived until the ownership is ended (agreed rule, enforced from this chunk).

## Duplicate warnings

The agreed rule: an exact match on building, street, and postcode is a **strong** warning; the same postcode and street is a **possible** match. Warnings explain the match, never block a justified creation, and only show properties the user can see.

## Selectable features (proposed starter list for approval)

System-defined, grouped for the form:

- **Outside space:** private garden, communal garden, balcony, terrace or roof terrace, patio
- **Parking:** off-street parking, allocated parking, garage, on-street parking, permit parking, electric vehicle charging
- **Building:** lift, concierge, bike storage, wheelchair accessible
- **Heating:** gas central heating, electric heating, underfloor heating
- **Interior:** en-suite, utility room, dishwasher, washing machine, fireplace

Letting policies (pets, smokers, students, and so on) are not property features and belong to the later marketing slice.

## Interface

- **Properties** list: address, lead landlord, type, bedrooms, responsible branch, and last updated, with search (address, postcode, reference, owner name) and filters. Columns for lead staff, journey stage, service, rent, and next action arrive with their chunks.
- **New property** page (two columns on wide screens): address with a live duplicate warning, details and features, responsible branch, and owners. Owners are chosen from existing contacts or added as a new person or organisation in place, with the duplicate-contact check, and one marked as lead.
- **Property record** in the ADR-030 profile-sidebar layout: the address as the title, reference, type, and key facts on the left; **Owners** (current, with former owners on request) and **Notes** in the working area; details and features in the 2xl rail. Managers see **Manage owners**, **Transfer branch**, and **Archive**.
- **Contact record:** a **Properties** section listing properties the contact owns or has owned.
- Light and dark themes, phone, tablet, and desktop.

## Delivery stages

1. **4A — database and security:** schema, migration, RLS, permissions, and disposable-database isolation tests; Opus review; owner approval to apply to shared Supabase.
2. **4B — services:** create, update, archive, transfer, ownership add/end/lead, duplicates, and notes, with application tests.
3. **4C — interface:** list, create, record, contact Properties section, and browser checks. Delivered 2026-10-16: list, create, record, contact section and the **Manage owners** dialog (add, make lead, end with reason). **Deferred by the owner:** the Edit property dialog and the Transfer branch dialog; their services (`updateProperty`, `transferPropertyBranch`) are built and tested, so only the screens remain. Demo data (9 properties, 3 extra contacts) was added to the Oakfield sandbox workspace on 2026-10-16, plus one archived browser-check property.
4. **Checkpoint:** full relevant checks, documentation, and a short handover.

## Validation plan

- **Unit:** address normalisation and validation, characteristics rules, feature codes, duplicate strength, lead rules.
- **Disposable database:** cross-workspace and cross-branch denial for properties, ownerships, transfers, and notes; hidden-contact ownership never shown; one current lead and one current ownership per contact; ended ownerships immutable; transfer shares owners; runtime cannot delete; audit without personal values.
- **Browser:** create with owners, duplicate warning, record page, manager actions, contact Properties section, mobile and dark mode.

## Deliberate exclusions

Address lookup and UPRN, photos and floor plans, listings and publishing, instructions and fees, rent, the property journey, compliance and licensing, ownership checks and evidence, the Landlords area, property merge, CSV import, and devolved-nation council-tax bands.
