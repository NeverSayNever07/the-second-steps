# ADR-014: Owner communication and ask-first working

- **Status:** Accepted
- **Context:** The project owner is not a developer and wants to keep control of decisions.
- **Decision:** AI assistants follow `.cursor/rules/communication.mdc`: explain plans and commands in plain English, report progress, and ask instead of inventing requirements or making major decisions silently. Routine development (editing, dev dependencies, tests, local commits) proceeds without per-step approval; deleting significant data, destructive database changes, publishing/deploying, security or auth changes, and paid services always need explicit approval.
- **Date:** 2026-10-11
