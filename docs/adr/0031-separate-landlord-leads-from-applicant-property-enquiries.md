# ADR-031: Separate landlord leads from applicant property enquiries

- **Status:** Accepted (owner decision, 2026-10-16)
- **Context:** Chunk 5 implemented a workflow labelled “Enquiries” for a landlord considering an agency: capture, appraisal, and instruction won/lost/postponed. The product roadmap also used “enquiry” for a prospective renter's interest in an advertised property. The shared label obscured two different journeys, stages, records, and staff tasks.
- **Decision:** The implemented workflow is a **Landlord lead**. A person or household looking to rent is an **Applicant**; their interest in one listing is a **Property enquiry**. One applicant may enquire about several listings, and one listing may receive enquiries from many applicants. Viewings, offers, applications, and tenancies remain separate connected records with preserved history.
- **Navigation:** Rename the current staff-facing Enquiries area to **Landlord leads**. When applicant work is added, use a **Pipeline** work area with distinct views for Landlord leads, Applicants, Property enquiries, Viewings, Offers, and Applications rather than one mixed record table. A mixed New enquiries inbox may be considered later for real inbound triage.
- **Implementation boundary:** This decision confirms product language and record boundaries. It does not rename existing database objects or authorise the applicant schema. The current UI rename is a separate small implementation task; applicant/household privacy, statuses, assignments, viewings, and offers require their planned approval gates.
- **Plan:** `.cursor/plans/enquiry-workflows-and-fluidity.md`
- **Date:** 2026-10-16
