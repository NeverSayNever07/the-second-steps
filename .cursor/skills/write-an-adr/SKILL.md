---
name: write-an-adr
description: Record a decision as an ADR in docs/adr/. Use when choosing a tool, provider, data shape or workflow; making a trade-off or an exception to a rule; or changing an accepted decision. Also use when the owner says "decision", "ADR", "record why" or "supersede".
---

# Write an ADR

One decision per file, numbered in order, never rewritten once accepted.
Read only the records that touch the same area; never the whole folder.

## Before writing

1. Find related records: search `docs/adr/README.md` (the index) for the topic, then open only those files.
2. Do not re-argue an accepted record. If the decision changes, the new record supersedes it, in whole or in part.
3. A record written in the current, uncommitted work is still a draft and can be edited freely. `git log -- docs/adr/<file>` shows whether it is committed.
4. Do not invent business rules for referencing, deposits, Right to Rent, AML, KYC or insurance (AGENTS.md). Record that they are unresolved instead.

## Write it

1. Take the next number: the highest `NNNN` in `docs/adr/` plus one.
2. Name the file `docs/adr/NNNN-<the-decision-as-a-short-phrase>.md`. The title states the decision, not the topic: `0032-landlord-leads-use-the-actions-table`, not `0032-tasks`.
3. Use this shape:

```markdown
# ADR-NNN: <The decision>

- **Status:** Proposed | Accepted (owner decision, YYYY-MM-DD)
- **Context:** <What made a decision necessary, in two or three lines.>
- **Decision:** <What was chosen, with the concrete specifics: names, tables, settings.>
- **Rules out:** <The alternatives, and why not, one line each.>
- **Trade-offs:** <The cost, and how to live with it.>
- **Date:** YYYY-MM-DD
```

Add other labelled lines only when they carry a fact (`**Scope:**`, `**Plan:**` linking `.cursor/plans/...`).

4. Simple English, short lines, no people's names. Link other records relatively: `[ADR-016](0016-....md)`.
5. Only the owner accepts a decision. Write `Proposed` unless they have agreed to it in this conversation.

## Supersede an old record

Change only the old record's status line, never its body:

- Whole record: `- **Status:** Superseded by [ADR-NNN](NNNN-....md)`
- Part of it: append `; <the part> superseded by [ADR-NNN](NNNN-....md)`.

## Index

Add `- [ADR-NNN: <title>](NNNN-....md): Status` to the top of the list in `docs/adr/README.md` (newest first), and update the old entry's status when superseding.
