# ADR-037: Property enquiries and viewings need a Ready to advertise listing

- **Status:** Proposed (the Ready to advertise rule was confirmed by the owner on 2026-10-22; the rest awaits acceptance)
- **Context:** A property enquiry links an applicant to one listing (ADR-031). Listings only reach an internal Ready to advertise and nothing is published (ADR-034), so enquiries arrive by phone, walk-in or email and are recorded by staff. It had to be decided which listings can take an enquiry or a viewing, and what happens to them when a listing is withdrawn or paused. Design: `.cursor/plans/applicants-design.md`.
- **Decision:**
  - **An enquiry can only be recorded on a listing that is Ready to advertise**, refused by the database otherwise, so Zayto never looks as if it markets a home that has not passed its EPC and media checks. Interest in a home that is not ready is captured through the applicant's requirements; the home appears in their suggested matches once it is ready.
  - **One open enquiry per applicant and listing.** It belongs to the listing's branch, and the applicant's lead contact is shared with that branch. Stages: New, Contacted, Viewing arranged, Viewed, Closed (with a reason); history is append-only.
  - **Viewings** belong to a property enquiry and need the listing to be Ready to advertise when booked. Start and end times are entered by staff (no invented default length). Booking moves the enquiry to Viewing arranged and completing it moves it to Viewed. Viewings appear in the staff calendar as their own source, with the viewing as the source of truth. Outcomes never use offer wording.
  - **Withdrawn listing** (including when its instruction ends): a database trigger closes open enquiries and cancels scheduled viewings with the protected reason "Home no longer available", writing history; nothing is deleted, and staff are prompted to tell the applicant. **Back to Draft:** enquiries and viewings stay open and new ones wait until the listing is ready again.
  - **Next actions** reuse the existing actions, with optional links to an applicant and a property enquiry.
  - **Offers are not part of this decision.** They wait for a legal check of the rental-bidding and advertised-rent rules.
- **Rules out:**
  - Enquiries on Draft or Content ready listings: close to marketing a home before it is compliant.
  - Deleting or silently leaving open enquiries when a listing is withdrawn: loses history or leaves applicants waiting.
  - A separate calendar table or a copy of viewings: the calendar stays a view over its source records.
- **Trade-offs:** An agency cannot log interest against a specific home until it is ready; requirements cover the gap. Portal or website enquiries cannot be imported until a provider exists; capture is manual and screens never claim portal leads.
- **Open:** offer rules; portal and website intake; whether landlords ever see viewing feedback (internal only for now).
- **Date:** 2026-10-22
