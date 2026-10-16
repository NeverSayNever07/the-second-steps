---
name: write-a-guide
description: Write or update a "So you want to" guide in docs/so-you-want-to/ for a job that will be done again, such as running the Docker demo, adding a migration, adding a sandbox user or rotating a Supabase key. Use when the owner says "guide", "how do I", "write up the steps", or after doing such a job by hand.
---

# Write a guide

A guide is for a job that will be done again. A one-off job is recorded in an ADR or the relevant doc instead.
The reader is the owner, who is not a developer: every step is something they can copy.

## Before writing

1. Look for an existing guide in `docs/so-you-want-to/README.md` and update it rather than writing a second one.
2. Use only steps that actually worked in this session. Mark anything not run as untested.

## Write it

1. Name the file `docs/so-you-want-to/<job>.md`, finishing the sentence: `run-the-docker-demo.md`.
2. Use this shape:

```markdown
# So you want to <do the job>

<One or two lines: what the job does, and when you need it.>

## Before you start

- <What must be true or to hand, such as Docker running, or a setting in .env.local by name.>

## Steps

1. <One action per step, with the exact command.>
2. <A warning goes before the step it applies to.>

## Check it worked

<What you see when it worked.>
```

3. Simple English: one fact per sentence, numbered steps when order matters, the condition before the action ("With Docker running, run ...").
4. Commands use the `npm run` scripts that exist. Secrets are named, never written: "the Supabase secret key from 1Password", never the value.
5. Link the decisions behind the job (`docs/adr/`) with relative links.

## Index

Add a line to `docs/so-you-want-to/README.md`, creating it with a one-line introduction if it does not exist.
