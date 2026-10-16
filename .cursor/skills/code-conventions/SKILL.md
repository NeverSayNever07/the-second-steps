---
name: code-conventions
description: How to shape TypeScript and React so a reviewer can follow and approve it, and pages load fast and stay usable. Covers domain concepts that own their rules, typed outcomes, validating once at the edge, visible effects, exact money, and plain control flow. Use when adding or changing a feature, domain rule, Server Action or component in core/, app/ or components/, or when reviewing one.
paths: core/**, app/**, components/**, lib/**
---

# Code conventions

Write for the person who has to understand, approve and later change the code, not for the fewest lines. These rules apply to code you write or change. Leave untouched code alone; improvements to it are their own change.

**Match the house style first.** This codebase uses `export function` declarations (not exported arrow functions), small components that destructure props in the parameter list, and `{ ok: true, ... } | { ok: false, ... }` results. Keep doing that. ESLint and Prettier settle formatting.

## 1. Give each concept a home

- Before writing, name the concept the change is about: a landlord lead, an appraisal, an ownership share, a role change. Use the product's words (ADR-031: **Landlord lead**, **Applicant**, **Property enquiry** are different things).
- Put its rules in `core/<module>/domain/`, next to its type: `evaluateRoleChange` lives with roles, not in the page that shows the button. Pages and actions call the rule; they do not re-implement it.
- Model states that cannot happen together as a union, not as several booleans or optional fields that can disagree:

```ts
// bad: nothing stops both being set, or neither
type Appraisal = { bookedFor?: string; cancelledReason?: string };

// good: each state carries exactly what it needs
type Appraisal =
  | { status: "booked"; bookedFor: string }
  | { status: "cancelled"; reason: CancellationReason };
```

- Keep "not loaded yet", "confirmed none" and "failed" distinct when the screen or rule behaves differently for each.
- The same three or four parameters travelling together through several functions are a missing concept. Give them a type when they share a meaning, not merely because they are passed together.
- No `utils.ts` or `helpers.ts` dumping grounds. A file is named after the concept it owns.

## 2. Return outcomes, not surprises

Expected refusals are values with a typed reason. Throw only for things that should never happen.

```ts
export type RoleChangeDecision =
  { allowed: true } | { allowed: false; reason: RoleChangeDenial };
```

- Reasons are string unions (`"last_active_owner"`), never free-text strings built deep in the code. Turn a reason into user-facing words once, at the screen.
- Use `boolean` only for a plain yes/no question that needs no reason.
- Server Actions return the shared result shape from `typescript.mdc`, never a raw error or stack trace.

## 3. Check once, at the edge

- `FormData`, URL params, cookies and JSON are `unknown` until checked. Narrow them with type guards or the module's parser into a domain type, once, where they enter. After that, code trusts the type.
- Every way of building a value goes through the same check, including mapping database rows back into domain types.
- No `as` casts to quiet the compiler, and never `as unknown as`. Fix the type where the value comes from.
- Do not invent a value to satisfy a signature (`?? ""`, `?? 0`, `?? []`). If the function can cope with absence, make the parameter optional and handle it there. If it cannot, deal with the missing case before calling it.

## 4. Keep effects visible

- Domain functions are pure: inputs in, result out. No Prisma, no `new Date()`, no environment reads. Pass `now` and settings in.
- The application function reads as the workflow, in order: verify the actor, open the transaction and set the workspace context, load, decide with the domain rule, write, record the audit entry, return. A reader should see every database write and its order without opening helpers.
- Do not move a check or query across a branch to tidy the code. Each path keeps the checks it needs.

## 5. Keep money and time exact

- Money is integer pence everywhere, including forms and JSON (`rentPence: 125000`). Never floating-point pounds. Parse "£1,250.00" into pence once at the edge; format pence into pounds only when displaying.
- Timestamps are UTC; show them in `Europe/London`. Calendar dates such as a tenancy start are `YYYY-MM-DD` strings.
- Do not invent rules for deposits, referencing, Right to Rent, AML or insurance. Ask (AGENTS.md).

## 6. Control flow that reads aloud

- Name a condition with two or more parts before using it: `const isLastOwner = targetIsOwner && !targetWillBeOwner && otherActiveOwnerCount === 0;`
- New booleans start with `is` where it reads naturally.
- Always use braces on `if`, even for one line. Guard clauses return early; the main path stays at the left margin.
- A ternary is for one simple choice between two simple values. Nested or chained ternaries become an `if` or a `switch`.
- Three or more outcomes from one value: `switch` on it, and make it exhaustive so a new status fails to compile:

```ts
default: {
  const unhandled: never = status;
  return unhandled;
}
```

- Do not use `||` for defaults; it swallows `0`, `""` and `false`. Use `??` at the edge, or a default in the destructuring.
- Collections: `filter`/`map` with small named steps when it reads well. Use a `for` loop when there is `await`, a database write, or other effects, so the order stays visible.
- Exported functions declare their return type.

## 7. React

- Decide before rendering. Work out a named value, then use it. No conditionals inside props:

```tsx
// bad
<Button
  variant={isArchived ? "outline" : "default"}
  disabled={!canEdit || isSaving}
/>;

// good
const variant = isArchived ? "outline" : "default";
const isDisabled = !canEdit || isSaving;
<Button variant={variant} disabled={isDisabled} />;
```

- Conditional rendering uses a real boolean: `{hasNotes && <NoteList notes={notes} />}`, not `{notes.length && ...}`, which renders `0`. Use a ternary only when both branches render something.
- Event handlers are named `on…` (`onArchive`, `onSubmit`).
- Handle loading and empty states in the component before passing data down; do not pass placeholders to make props fit.
- A component does not set its own outer margin. Accept `className` and let the parent place it (use `gap` on the parent for spacing between children).

## 8. The URL holds navigation state, never data

Staff share links ("look at this lead, appraisals tab, my branch"). A link must reopen exactly what they saw, and Back and Forward must work.

- Navigation state goes in the URL: where the person is and how the view is set up. That means the record id, tab, filters, sort, list search text, page number, and an edit panel that is a place in its own right (`?edit=details`).
- Read it on the server from `searchParams` (awaited in Next.js 16) and render from it. Change it with `<Link>` or a `GET` form. Use `router.replace` from a small client component only where a reload per keystroke would be wrong, such as a live search box.
- Treat search params as untrusted input: check each against its allowed values and fall back to the default for anything unknown. A shared link never grants access; the server checks the viewer as usual.
- **Never put personal data in a URL**: no names, emails, phone numbers, addresses or note text. Only ids and fixed values such as `tab=notes`. URLs are kept in browser history, server logs and `Referer` headers.
- Short-lived interface state stays in the component: whether a menu is open, unsaved form input, the search box inside a picker dialog, a confirmation step.

## 9. Fast pages that stay usable

This is a high priority. A person must be able to click, type and move around while anything slow is still loading, and no page should wait on work that could have run at the same time.

- **No waterfalls.** Start every independent load at the same moment with `Promise.all`. `await` one load before another only when it needs the first one's result.
- **Check access first, or together.** The access check may run alongside reads only if nothing renders until both have finished. Never stream data above or before the check.
- **Stream what is slow.** What the person needs to act on (the record header, the list) renders first. Secondary sections (notes, related records, counts) are their own async Server Components inside `<Suspense>`, with a skeleton the same size so nothing jumps. Every route segment that loads data has a `loading.tsx`.
- **Layouts load only the frame.** Navigation and the workspace name; never page data, so the frame never waits on the page.
- **Count round trips.** The database is a network hop away and each statement waits for the last. Group a screen's reads into as few transactions as practical, combine settings into one statement, and never query once per row. `Promise.all` inside one transaction does not run queries in parallel.
- **Share per-request work.** A check or lookup that a layout and its page both need is wrapped in React `cache()` so it runs once per request. Never cache personal or workspace data across requests or users.
- **Send the browser only what it shows.** Pass client components the fields they use (`{ id, name }`), never whole records: it is smaller and leaks less.
- **`"use client"` only on interactive leaves.** A component without state, effects or event handlers is a Server Component.
- **Keep server code out of the bundle.** Modules that use Node APIs (`node:crypto`, `fs`) or the database start with `import "server-only"`. Anything a client component needs from them lives in a separate file without those imports.
- **Never freeze the screen on a save.** Forms show their pending state (`useActionState`, `useFormStatus`) and the rest of the page stays usable; use `useOptimistic` when the result is predictable. Revalidate the smallest path that changed, not the whole layout.
- **Measure before changing.** When a page feels slow, count its transactions and check its first-load JavaScript in the `next build` output first.

## 10. Before you finish

Read the changed code as a newcomer and answer:

1. Which concept owns each rule, and where would the next likely requirement go?
2. Can I follow the workflow, its branches, writes and failures from top to bottom?
3. Do names, types, defaults and return values tell the same story?
4. Are absence, pending and failure still distinct where they matter?
5. Did any extraction save the reader work, or just move it into another file?

Then run the checks the change needs (AGENTS.md, "Match validation to risk"). Tests state the behaviour as sentences; avoid tests that only mirror the implementation.
