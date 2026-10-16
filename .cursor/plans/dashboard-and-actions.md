# Dashboard and general actions (real build)

**Status:** Proposal, approved in direction by the owner on 2026-10-16 (layout G from the design lab; general actions). No implementation has started. The design-lab mock-up is `/design-lab/dashboards`, option G, with notes in `.cursor/plans/dashboards.md`.

## Progress

- **D1 (2026-10-16):** migration `20261016200000_general_actions` (the `actions` table, its row-level security and rules, and `planned_for` on `enquiry_tasks`), the Prisma model, the `action.read` and `action.manage` permissions, and `tests/integration/action-security.test.ts` (14 database tests; the whole disposable suite passes, 172 tests). Schema and migration match apart from the known name-only differences. **Applied to shared development Supabase and verified on 2026-10-16** after the review and its fixes, with the owner's approval (row-level security forced, the app role has no delete, all 31 functions pin their search path, new columns present). **Next: D2 services** (Sonnet is sufficient).
- **Independent review of D1 (2026-10-16, separate Opus agent):** no cross-agency or cross-branch leak; Read Only, suspended members, closing, immutability, link checks and grants held. Fixed before any shared application:
  - a creator who had lost access to the action's branch could still edit, cancel or hand over someone else's action; the update rule no longer grants the creator anything (they can still see it);
  - owner decision (2026-10-16): an assignee who has lost access to the branch may only **finish, cancel or hand over** their action (the database refuses other changes);
  - handing an action over left it invisible to the person who did it, so the database refused the hand-over; whoever last handed it over is now recorded by the database (`handed_over_by_membership_id`) and keeps seeing it.
  - 8 more database tests cover these and the review's other gaps (suspended and Read Only writes, link swaps and later links, fixed id and workspace, the cancelled path, agency-wide assignment, planning a closed lead next action, hand-over with RETURNING). A test proven to fail with the old rule; the disposable suite passes (180 tests).
  - Accepted as in earlier chunks: the assignee check takes no lock, so a membership suspended at the same instant could slip through once; and a refused insert may report the assignee rule rather than the creator rule (the service must not rely on the code).

- **D2 step 1 (2026-10-16): work-item service built and tested, not committed.** `core/actions/` has `listWorkItems` (one due-ordered list, mine or everything visible, from both tables) and `addWorkItem`, `completeWorkItem` (with an optional next step, saved in the same transaction or not at all), `cancelWorkItem`, `snoozeWorkItem`, `planWorkItem` and `handOverWorkItem` for lead next actions and general actions. Lead next actions need `enquiry.update`, general actions `action.manage`. Snoozing and handing over clear any planned time. Lead-task add and close were split into transaction-level functions so they can join these changes. 8 new database tests; the whole disposable suite passes (188). Committed as c5932c2.
- **D2 step 2 (2026-10-16): dashboard summary built and tested, not committed.** `getDashboardSummary` (`core/actions/application/dashboard-summary.ts`) returns the headline numbers (open leads, appraisals this week, won this month, recent leads and how many reached an appraisal, the user's overdue actions, leads with no next action), three alert lists with counts (no next action, no lead person, waiting 7+ days in a stage), the user's appraisals today, open leads per stage, and the 10 latest stage changes with who made them. Everything is limited to what the user can see (database row-level security) and shows real records only; the conversion is returned as two counts so the screen shows nothing misleading when there are no leads. Weeks run Monday to Sunday and months by calendar, in UK time. 4 new database tests; whole suite passes (192). Committed as db77d59.
- **D3 stage 1 (2026-10-16): Actions list and Add action pop-up on the real Overview, built and browser-checked, not committed.** The Overview now has the Actions list down the right (first on phones): the signed-in user's work in due order with All / Overdue / Today filters, a tick-circle to finish (always asks "What happens next?", defaulting to a next action for landlord leads), and a "more" menu for snooze, hand over and cancel. **Add action** is a pop-up that adds a lead next action when a lead is chosen and a general action otherwise. Read Only sees the list without controls. The two cards the list replaces (overdue and next 7 days) were removed; "Awaiting a next action" and "Today's appraisals" remain until the Overview tab. Tested: typecheck, lint, 181 unit tests, new browser tests (`e2e/dashboard-actions.spec.ts`: add, snooze and finish through the real screens; phone dark mode without overflow), and the existing landlord-lead browser tests. Light and dark, desktop and phone were looked at in screenshots.
- **Not in stage 1 (deliberate, for stage 2 or later):** the tabs and Comfortable/Compact switch; the Plan button (needs the Schedule tab); linking an action to a contact or property in the pop-up (the service supports it; the pop-up has no picker yet); call and email from a row; **undo** (a finished or cancelled action cannot be reopened by the database rules, so the list confirms what happened instead).
- Browser tests sign in as the fictional demo user, so they must run one at a time (`--workers=1`); parallel sign-ins sometimes time out.
  **Next: D3 stage 2** (tabs, Overview content from `getDashboardSummary`, Pipeline, Schedule and Team).
- Not yet covered by a test: editing a general action's title or type, and the general action's own "outside its branch" restrictions through this service (the database tests already cover those rules).

## Outcome

Replace today's read-only Overview with the tabbed dashboard the owner chose: **Overview, Pipeline, Schedule and Team tabs** and an **Actions list always visible on the right**, in due order with the most overdue first. Staff add, finish, snooze, hand over and plan actions without leaving the page. **Add action** opens a pop-up. The page is built for later modules, but it shows only real data: nothing invented, and no placeholder tiles for modules that do not exist.

## Owner decisions

- Layout G (tabs plus an actions rail, with a Comfortable/Compact switch) is the direction.
- **General actions:** an action can stand alone ("ring the council") or be linked to a lead, contact or property; it is not limited to landlord leads.
- Add action is a pop-up from the dashboard, and actions are listed in due order, most overdue first.
- A temporary Design lab section in the navigation (development only) links to the lab pages.

## Design

### Two tables, one list

- **Landlord-lead next actions stay in `enquiry_tasks`.** They carry reviewed lead rules (a lead needs an open next action; closing a lead closes its tasks), and migrating them is risky because the migration role cannot see rows under forced row-level security.
- **General actions go in a new `actions` table** (no lead link: an action about a lead is a lead next action in `enquiry_tasks`, as below): title, type (call, email, send, chase, other), due date, optional planned start time, assignee (required), status (open, done, cancelled) with who and when it was closed, responsible branch (required, as for leads), and optional links to a lead, contact and property (same-workspace composite foreign keys, links checked when first made, never swapped).
- **The Add action pop-up chooses the table for the user.** If a lead is picked, it adds a lead next action (so the lead rule holds). Otherwise it creates a general action, optionally linked to a contact or property. The user sees one list.
- A thin **work-item service** merges both sources into one due-ordered list and exposes the same operations on either: add, complete (optionally setting the next step in one go), snooze (change the due date), hand over (reassign), plan into an hour (a planned start time, which needs one new column on `enquiry_tasks`), and cancel. Later modules either add their own source to the merge or use general actions with links; this is the shared work-item model the roadmap calls SHARED-01.

### Rules to carry over from the lead work

- Assignees must be active, able to work the action, and able to see its branch (as `canAssignEnquiryWork`).
- The database sets closing times; history for stage changes stays as it is; the app role can never delete.
- Every id from the browser is validated; text is capped; no browser object is spread into a call carrying the sign-in identity.

### What each tab shows, from real data

- **Actions rail:** the merged list for the signed-in user, in due order (overdue first), with filters (All, Overdue, Today), tick-off with "what happens next?", Plan, snooze, hand over, call or email where the linked contact has one, and Add action.
- **Overview tab:** headline numbers computed from leads the user can see (open leads, appraisals this week, won this month, share of leads from the last 30 days that reached an appraisal, overdue actions, leads with no next action); "Needs attention" alerts from real conditions (leads with no lead person, leads waiting seven or more days in a stage, overdue actions); today's appraisals with Record outcome; a pipeline snapshot; recent activity from stage history (actor, lead, new stage), limited to what the user can see.
- **Pipeline tab:** the lead board with move-on, assign and close actions, reusing the lead services.
- **Schedule tab:** today by the hour, appraisals fixed in place and planned actions dropped into free hours (needs the planned start time).
- **Team tab:** open and stale leads per colleague, for roles allowed to see colleagues (branch scope applies).
- Not included until the data exists: viewings, applications, certificates, rent, maintenance, and any fee or money figure (fee calculation is not specified, so none is shown).

## Delivery stages

1. **D1, database and security (Opus):** the `actions` table, row-level security, triggers, a planned-start column on `enquiry_tasks`, permissions, disposable-database isolation tests, an independent security review, then owner approval before applying to shared Supabase.
2. **D2, services (Sonnet):** the work-item layer, add, complete, snooze, hand over, plan and cancel for both sources; the headline, alert and activity queries; application tests.
3. **D3, interface (Sonnet):** the tabbed dashboard, actions rail, Add action pop-up and Comfortable/Compact switch on the real Overview; responsive, light and dark; browser checks.
4. **Checkpoint (Opus review, then handover):** independent review of D2 and D3, full relevant checks, demo data, documentation.

## Access decisions (owner, 2026-10-16)

- **Add and finish own actions:** every role except Read Only (Account Owner, Agency Admin, Branch Manager, Negotiator, Property Manager, Accounts). Read Only can view actions in its scope.
- **Change someone else's action** (hand over, edit, finish or cancel): anyone who can add actions, for actions in a branch they can see. The new assignee must still be active, able to add actions and able to see the action's branch.
- **Lost branch access:** an assignee may still finish, cancel or hand over their own actions there, nothing else; a creator can still see actions they created there but not change them; whoever last handed an action over keeps seeing it.
- **Who sees an action:** its assignee and its creator always, plus anyone whose branch scope includes the action's responsible branch (workspace-wide staff see all).
- **Team tab:** roles that work landlord leads (Account Owner, Agency Admin, Branch Manager, Negotiator, Property Manager), for colleagues in their branches.
- **Recent activity:** everyone, limited to records they can see.

## Deliberate exclusions

Recurring actions, reminders by email or SMS, comments on actions, attachments, sub-tasks, a calendar sync, and moving existing lead next actions into the new table.
