# Marketing build 1 — M0 design note

**Status (2026-10-21):** **owner approved (2026-10-21)**; docs only, no code or migration yet. This is the agreed design for the first marketing build: a **listing** taken from Draft through **Content ready** to **Ready to advertise**, with photos and floorplans, entirely inside Zayto. **Nothing is published anywhere** (no portals, no website feed, no Advertised state) and every listing screen says so. It supersedes the chunk list (L0 to L6), roles table, lifecycle and EPC-gate placement in `marketing-listings.md`, which keeps the still-valid hand-off, guardrails, AI copy direction and EPC lookup notes as the "later" material. The working plan, with the full chunk table, is `C:\Users\Will\.claude\plans\lets-move-on-to-resilient-brook.md`; this note records what a later reader needs from it. Fictional data only; every gate is workflow pending independent legal validation, and no screen claims legal compliance.

## Owner decisions (2026-10-21)

1. **Scope:** listing content plus photos and floorplans, ending at **Ready to advertise**.
2. **Reviewers:** Negotiators may confirm **Content ready** and **Ready to advertise** (not managers only).
3. **AI copy:** later, as its own step (needs an Anthropic API account, spend limit, a new dependency and a decision on running without a job queue). The content model leaves room for labelled AI drafts.
4. **Minimum media for Ready to advertise:** 5 photos and 1 floorplan; the first photo is the main image. Constants live in one file.
5. **Photo preview:** ADR-008 is amended so **staff-only** photos display inside Zayto through the existing private route. No public delivery.
6. **Advertised rent:** read-only on the listing, always copied from the instruction's agreed rent; a change to the agreed rent appears as source drift to accept.
7. **An expired EPC blocks** Ready to advertise.

**Defaults assumed, open to change:** Property Manager, Accounts and Read Only are read-only for listings (a Property Manager can still end or return an instruction, which cascades to the listing); a reviewer may confirm their own edits (no four-eyes rule); an EPC rated F or G blocks Ready to advertise unless the latest applicability assessment is **Does not apply with a recorded reason** (interim, no schema change, no role can override); photo and floorplan caps of 30 and 3.

## Lifecycle

Draft → Content ready → Ready to advertise → Withdrawn. Advertised and portal states come later. One current (non-withdrawn) listing per instruction; history is kept. Starting needs an instruction that is currently Ready to market and open. A withdrawal needs a reason, and a later attempt creates a **new** listing.

- **Ending the instruction** withdraws its current listing; **returning it to Onboarding** takes Content ready or Ready to advertise back to Draft. Both are enforced by a database trigger on `instructions`, in the same transaction, so no future caller can bypass them, and the screens warn first.
- **Any edit after review** returns the listing to Draft and records why.
- **Source drift** (agreed rent or period, deposit, address or core property facts, the EPC position) is shown with a side-by-side difference and blocks a new confirmation until a new version is saved after reviewing it.

## What a listing holds

One advertised rent (integer pence and a period, copied from the instruction terms, read-only); availability date and note; headline, short summary, full description and feature highlights; reviewed copies of address, type, bedrooms, bathrooms, receptions, furnished status, council-tax band, parking, outdoor space and selected features; reviewed deposit presentation; a plain-language material-information section; and a snapshot of the property's EPC position. Each field records whether it was copied from source, edited for this advert, not supplied or not applicable.

**Never copied onto a listing:** landlord details, fees and charges, the agreement, the ownership check, parties and the property's internal summary. Facts come through an explicit allowlist, never a spread, with a test that proves it.

**Content versions are immutable**, saved with an explicit **Save draft** (no autosave); the current version is the highest version number. (This replaces the "current-version pointer" in the earlier plan, which added a circular reference and a race for no benefit.) Rent changes, readiness changes and withdrawals are append-only events.

## EPC and compliance

- **Content ready** needs only that the EPC position has been read and shown to the reviewer. The **hard block is at Ready to advertise** (this matches the compliance plan; the earlier marketing plan put it one gate sooner).
- The listing **snapshots** the property's `epc_mees` position when reviewed and shows drift later. Compliance evidence stays owned by the property; a listing never holds a second copy.
- **Ready to advertise is satisfied by:** reviewed, unexpired EPC evidence; a recorded commissioned/awaiting state; or a **Does not apply** assessment with a reason. **Blocked by:** Not assessed or not requested, Needs specialist review, Action required, expired evidence, and a relied-on rating of F or G (unless Does not apply with a reason). No role can override.
- **CP12, EICR, alarms and licensing** are visible warnings during preparation and never block either state (owner decisions of 2026-10-20 stand).
- There is no separate "exemption recorded" state; the earlier marketing plan's list of EPC states is reduced to what the property compliance model can express. A proper exemption marker waits for the legal review.

## Permissions

| Permission        | Roles                                                   |
| ----------------- | ------------------------------------------------------- |
| `listing.read`    | All seven roles, within branch scope                    |
| `listing.prepare` | Account Owner, Agency Admin, Branch Manager, Negotiator |
| `listing.review`  | Account Owner, Agency Admin, Branch Manager, Negotiator |

Defined twice, as with every permission: in `core/access/domain/` and in SQL helpers (separate prepare and review helpers so the roles can diverge later).

## Media (staff-only, nothing public)

Two new document kinds, `listing_photo` (JPEG or PNG) and `listing_floorplan` (PDF, JPEG or PNG), up to 10 MB, 30 photos and 3 floorplans per listing, linked through a new `listing_media` table (position, caption used as alt text, add and remove audit). Uploads use the existing private route one file at a time (two in flight), so memory stays small on the Raspberry Pi demo host. Photos display to staff on the listing's Media tab and preview, through the existing download route, checked on every request. Floorplan PDFs are download-only.

**Deferred and stated on screen and in the ADRs:** public delivery or signed URLs, EXIF and location stripping (needed before any public use), malware scanning (controlled fictional files only), HEIC, and thumbnails (they need an image library, which needs approval; added only if the demo host struggles).

## Chunks

M0 design note (this file; done 2026-10-21) · M1 pure domain rules and permissions (**done 2026-10-21**: `core/listings/domain/*` with 32 unit tests, and `listing.read/prepare/review` in `core/access/domain/`; nothing uses them yet, and the source drift check compares the facts themselves rather than a hash, so no hashing is needed) · M2 listing core migration (**built and tested locally 2026-10-21**: `20261022100000_listings_core`, 27 database security tests, full suite 398 passing with no schema drift; independent `review-security` rated it **Amber** with no blocking findings, and its fixes are applied and tested: a listing can be reviewed only while its instruction is Ready to market and only on a version based on the latest agreed terms, an "edited after review" event must save a version, a listing has one "created" event, the "instruction ended" check is tied to the same transaction, and the EPC check fails closed if the evidence cannot be read. **Not yet applied to shared Supabase** (needs owner approval). Open question for the owner: should reviewed EPC evidence with no energy rating block Ready to advertise? It currently does not.) · M2 listing core migration · M3 services and the instruction coupling · M4 screens without media (staff can reach Content ready) · M5 media migrations and services · M6 media screens, the Ready to advertise unlock and a combined checkpoint. M2 and M5 each need an independent security review and the owner's separate approval before applying to shared Supabase. Details: the working plan above and `marketing-listings.md`'s corrected sections.

## Out of scope

AI-drafted copy; the government EPC lookup; a website feed; portals (access to Rightmove, Zoopla and OnTheMarket is unconfirmed); public image delivery; an Advertised state; applicants, property enquiries, viewings and offers; background jobs (ADR-009).
