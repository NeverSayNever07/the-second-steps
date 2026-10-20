# C2 design — externally signed landlord agreements

**Status (2026-10-20):** **owner approved (2026-10-20)**. **Built and tested locally:** migration `20261020180000_instruction_agreements`, the agreement services, the upload hook and their tests (full integration suite and `npm run check` pass). **Screen built (2026-10-20):** Add signed agreement (upload, signers, confirmation, signed date, one save), Finish agreement and Discard draft, status line, agreement history with downloads; Record progress offers Prepared and Sent only; the agreement exception action is removed. Review notes fixed: add/remove landlord pass the Ready-to-market confirmation, a second upload says to finish or discard the waiting draft, and complete/discard audit entries carry the agreement and document ids. Independent `review-security`: migration and services **Green**, screen and Server Actions **Green** (2026-10-20). **Applied to shared development Supabase on 2026-10-20**; the owner confirmed no instruction is Ready to market (decision 4). Browser tests pass against shared Supabase (upload, refused completion keeps the draft, download link, discard, phone in dark mode); completing an agreement is not automated, because completed agreements are permanent in shared test data, and awaits an owner hand check. **Not yet:** `npm run build` and the full browser suite at the C2 checkpoint. Builds on C1 (`c0-design-private-documents.md`) and implements C2 of `property-compliance-and-landlord-agreements.md` for fictional data only. Not legal advice; independent legal review remains a real-data gate.

## Owner decisions (2026-10-20)

1. **Material terms:** service type, management fee (kind, value, frequency, VAT), extra charges (name, amount, VAT) and the set of current landlords. Asking rent, rent period, deposit offering and deposit/holding-deposit amounts can change without a new agreement. Allocated responsibilities join the list when Zayto records them.
2. **Signatories:** every landlord on the instruction when the PDF is uploaded must have signed. Zayto snapshots that list; main-contact status is not signing authority.
3. **Old milestones:** staff may still record **Prepared** and **Sent**. **Signed** can no longer be recorded by hand; it comes only from a completed agreement. Earlier events stay as history.
4. **Existing records:** every Ready-to-market instruction returns to Onboarding, because none has a completed agreement PDF. **Revised the same day:** staff move them back by hand on the instruction screen, with a reason, before the C2 migration is applied to shared Supabase. The migration changes no existing rows: the tables are forced RLS and the migrator has no RLS bypass, and doing it automatically would mean lifting that protection and allowing history with no named person.

Already decided: Account Owner, Agency Admin, Branch Manager, Negotiator and Property Manager may upload, complete and discard drafts (`instruction.manage`); Accounts and Read Only may view and download (`instruction.read`). The manager agreement exception stops counting and cannot be added. The ownership-check exception is unchanged.

## Records

**`instruction_agreements`** — one row per uploaded agreement PDF.

| Column                                                         | Rule                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace_id`, `instruction_id`                               | Workspace-aware foreign key to the instruction.                                                                                        |
| `document_id`                                                  | Unique, workspace-aware link to one C1 `instruction_agreement` document on the same instruction.                                       |
| `terms_version_id`                                             | The terms version current at upload, set by the database.                                                                              |
| `material_fingerprint`                                         | SHA-256 of the material terms and the sorted landlord contact ids, computed by the database at upload. Never sent by the app.          |
| `signatory_contact_ids`                                        | The landlords who must have signed, sorted, copied by the database at upload. Immutable.                                               |
| `state`                                                        | `draft` → `completed`, or `draft` → `discarded`. Nothing else.                                                                         |
| `signed_on`                                                    | Required to complete; the date shown on the PDF; not in the future (London date). Staff cannot complete without it.                    |
| `completed_by_membership_id`, `completed_at`                   | Set at completion; `completed_at` by the database.                                                                                     |
| `supersedes_agreement_id`                                      | Set automatically on completion to the previous completed agreement, if any. The earlier row is shown as **Superseded**; never edited. |
| `discarded_by_membership_id`, `discarded_at`, `discard_reason` | Draft discard only, reason required.                                                                                                   |
| `created_by_membership_id`, `created_at`                       | The uploader and database time.                                                                                                        |

At most one `draft` per instruction (partial unique index). A completed row is immutable: a trigger refuses any change to it. The app role cannot delete rows.

**Changed during the build:** the signatory snapshot is the `signatory_contact_ids` column rather than a separate table. It is set only by the database and never changes, so a second table would add policies and grants without adding protection.

The agreement is written in the same transaction that marks the C1 document `stored` (C1's `attach` hook), so a draft never exists without its stored file.

## Rules

- **Complete:** the member confirms every listed landlord has signed and enters `signed_on`. Refused if the instruction has ended, or if the current material fingerprint no longer matches the draft's (terms or landlords changed since upload: upload a fresh copy).
- **Discard draft:** with a reason. The draft becomes `discarded` and its document `removed`, then the file is deleted (C1 order: rows first, file second). The C1 document trigger gains a rule: a document backing a completed agreement can never be removed.
- **Current agreement:** the latest completed agreement. It **matches** when its fingerprint equals the instruction's current fingerprint.
- **Checklist:** the agreement item is met only by a matching current agreement. Agreement exceptions no longer count, and new ones are refused by the database.
- **Agreement update required:** shown when a completed agreement exists but no longer matches.
- **Material change while Ready to market:** saving new fees or adding or removing a landlord uses the existing warn-then-confirm step: staff are warned and nothing is saved; once they confirm, the change and the return to Onboarding are saved together, with a history reason starting "Agreement update required". The existing commit-time database check refuses any path that forgets. **Changed during the build:** this follows the established pattern rather than moving silently. A Ready-to-market instruction missed in the hand move (decision 4) can still be moved back with the existing **Return to Onboarding** action; until then, edits that do not run the readiness step are refused.
- **A second upload while a draft waits** is refused by the database and the upload fails with its file deleted. The screen offers Finish or Discard instead of a new upload while a draft exists.
- **Signed milestone:** the database refuses new `signed` agreement events; `prepared` and `sent` continue.

## Migration (one file, order matters)

1. New enum and the table, indexes, RLS enabled and forced, policies modelled on the instruction record policies (see by branch scope; write only with `instruction_member_can_work`, as yourself), and grants (insert and select; update only on the status and completion columns; no delete).
2. Fingerprint function, triggers (snapshot, immutability, completion rules, supersession) and the C1 document-removal guard.
3. Replace `instruction_checklist_complete` with the matching-agreement rule; block new `signed` events and `agreement` exceptions.
4. No data change. Before applying to shared Supabase, confirm with the owner that Ready-to-market instructions were moved back by hand (decision 4).

## Screen

Extend the existing agreement area of the instruction record (profile-sidebar layout, light and dark, mobile to desktop):

- One status line: **No signed agreement**, **Draft uploaded**, **Signed on 12 Oct 2026**, or **Agreement update required** with what changed (terms or landlords).
- One **Add signed agreement** button for permitted roles, opening one modal: choose PDF, the landlords who must have signed, a confirmation tick, signed date, one save. The file uploads first and becomes a draft; completion follows in the same save. If completion fails the draft stays, with **Finish** and **Discard draft** actions.
- History: every agreement with uploader, dates, signers, status (Completed, Superseded, Discarded) and a plain download link (the C1 route), plus the earlier Prepared/Sent/Signed events.
- The agreement exception action is removed.

## Tests

- **Unit:** fingerprint inputs and material-change detection, checklist states, date and confirmation validation.
- **Integration (security):** cross-workspace and cross-branch reads and writes, role boundary (Accounts and Read Only refused writes), immutability of completed rows and signatories, one draft per instruction, completion refused after a material change, document removal refused for a completed agreement, `signed` events and agreement exceptions refused, migration data step.
- **Integration (application):** upload → draft → complete → Ready to market; material change returns to Onboarding; replacement supersedes; discard removes the file.
- **Browser:** upload and complete, download, discard draft, Agreement update required after a fee change; both themes and mobile width.

## Order and gates

1. Owner approves this design.
2. Migration and database tests; `review-security` of the migration before it is applied to shared Supabase (owner approval for that step).
3. Services, then the screen.
4. C2 checkpoint: `npm run check`, the integration suite, affected browser tests, `npm run build`, `review-security`.
