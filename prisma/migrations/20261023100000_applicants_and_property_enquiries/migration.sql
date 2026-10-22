-- A2: applicants and property enquiries. Owner-approved design (2026-10-22)
-- in .cursor/plans/applicants-design.md, ADR-036 and ADR-037.
--
-- An applicant is one household led by one contact, with other adults as
-- linked contacts and non-sensitive requirements kept as append-only
-- versions. A property enquiry is one applicant's interest in one listing,
-- and can only be recorded while the listing is Ready to advertise (an
-- internal stage: nothing is published). Withdrawing a listing closes its
-- open enquiries in the same transaction, by a trigger, with history kept.
-- Every status or stage change is backed by a history row written in the
-- same transaction by the person making it, and nothing can be deleted.
-- Next actions reuse the actions table through two new optional links.
-- Viewings come in a later migration (B1).

CREATE TYPE "applicant_status" AS ENUM ('active', 'on_hold', 'closed');
CREATE TYPE "property_enquiry_stage" AS ENUM (
  'new', 'contacted', 'viewing_arranged', 'viewed', 'closed'
);
CREATE TYPE "property_enquiry_change_kind" AS ENUM ('staff', 'listing_withdrawn');
-- 'viewing' is used by the viewings migration for cancellation reasons.
CREATE TYPE "lettings_outcome_kind" AS ENUM (
  'applicant', 'property_enquiry', 'viewing'
);

-- Working with applicants and enquiries (owner decision 2026-10-22): Account
-- Owner, Agency Admin, Branch Manager and Negotiator. Reading: every staff
-- role except Accounts. Reopening a closed applicant: managers.
CREATE FUNCTION "public"."applicant_member_can_work"(
  "member" uuid,
  "branch" uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT "public"."instruction_member_has_role"(
    "member",
    "branch",
    ARRAY[
      'workspace_owner', 'agency_admin', 'branch_manager', 'negotiator'
    ]::"membership_role_code"[]
  )
$$;

CREATE FUNCTION "public"."applicant_member_can_read"(
  "member" uuid,
  "branch" uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT "public"."instruction_member_has_role"(
    "member",
    "branch",
    ARRAY[
      'workspace_owner', 'agency_admin', 'branch_manager', 'negotiator',
      'property_manager', 'read_only'
    ]::"membership_role_code"[]
  )
$$;

CREATE FUNCTION "public"."applicant_member_can_reopen"(
  "member" uuid,
  "branch" uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT "public"."instruction_member_has_role"(
    "member",
    "branch",
    ARRAY[
      'workspace_owner', 'agency_admin', 'branch_manager'
    ]::"membership_role_code"[]
  )
$$;

CREATE FUNCTION "public"."applicant_transition_allowed"(
  "from_status" "applicant_status",
  "to_status" "applicant_status"
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT ("from_status", "to_status") IN (
    ('active'::"applicant_status", 'on_hold'::"applicant_status"),
    ('active', 'closed'),
    ('on_hold', 'active'),
    ('on_hold', 'closed'),
    ('closed', 'active')
  )
$$;

-- One step forward or back, any open stage to closed, closed back to new.
CREATE FUNCTION "public"."property_enquiry_transition_allowed"(
  "from_stage" "property_enquiry_stage",
  "to_stage" "property_enquiry_stage"
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT ("from_stage", "to_stage") IN (
    ('new'::"property_enquiry_stage", 'contacted'::"property_enquiry_stage"),
    ('contacted', 'new'),
    ('contacted', 'viewing_arranged'),
    ('viewing_arranged', 'contacted'),
    ('viewing_arranged', 'viewed'),
    ('viewed', 'viewing_arranged'),
    ('new', 'closed'),
    ('contacted', 'closed'),
    ('viewing_arranged', 'closed'),
    ('viewed', 'closed'),
    ('closed', 'new')
  )
$$;

-- Agency list of reasons for closing applicants and enquiries (and, later,
-- cancelling viewings). Starter entries are added by the application.
CREATE TABLE "lettings_outcome_reasons" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "name" varchar(80) NOT NULL,
  "applies_to" "lettings_outcome_kind" NOT NULL,
  "status" "enquiry_list_item_status" NOT NULL DEFAULT 'active',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lettings_outcome_reasons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lettings_outcome_reasons_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "lettings_outcome_reasons_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lettings_outcome_reasons_name_check" CHECK (btrim("name") <> '')
);
CREATE UNIQUE INDEX "lettings_outcome_reasons_name_key"
ON "lettings_outcome_reasons"(
  "workspace_id", "applies_to", lower(btrim("name"))
);

-- A reason's kind is part of its meaning once records use it.
CREATE FUNCTION "public"."protect_lettings_outcome_reason"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."applies_to" <> OLD."applies_to"
    OR NEW."created_at" <> OLD."created_at"
  THEN
    RAISE EXCEPTION 'outcome reason identity cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  NEW."updated_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "lettings_outcome_reasons_protect_identity"
BEFORE UPDATE ON "lettings_outcome_reasons"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_lettings_outcome_reason"();

-- A reason used for a closure must be active and for that kind of record.
CREATE FUNCTION "public"."assert_lettings_reason"(
  "workspace" uuid,
  "reason" uuid,
  "kind" "lettings_outcome_kind"
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "lettings_outcome_reasons"
    WHERE "workspace_id" = "workspace"
      AND "id" = "reason"
      AND "applies_to" = "kind"
      AND "status" = 'active'
  ) THEN
    RAISE EXCEPTION 'this reason is not offered here'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "public"."assert_lead_source_offered"(
  "workspace" uuid,
  "source" uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "lead_sources"
    WHERE "workspace_id" = "workspace"
      AND "id" = "source"
      AND "status" = 'active'
  ) THEN
    RAISE EXCEPTION 'lead source is not offered'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- One household looking to rent, led by one contact.
CREATE TABLE "applicants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "reference" varchar(20) NOT NULL,
  "lead_contact_id" uuid NOT NULL,
  "responsible_branch_id" uuid NOT NULL,
  "lead_membership_id" uuid,
  "lead_source_id" uuid,
  "status" "applicant_status" NOT NULL DEFAULT 'active',
  "status_changed_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closure_reason_id" uuid,
  "closure_note" varchar(500),
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "applicants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applicants_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "applicants_reference_key" UNIQUE ("workspace_id", "reference"),
  CONSTRAINT "applicants_lead_contact_fkey"
    FOREIGN KEY ("workspace_id", "lead_contact_id")
    REFERENCES "contacts"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicants_branch_fkey"
    FOREIGN KEY ("workspace_id", "responsible_branch_id")
    REFERENCES "branches"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicants_lead_membership_fkey"
    FOREIGN KEY ("workspace_id", "lead_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicants_lead_source_fkey"
    FOREIGN KEY ("workspace_id", "lead_source_id")
    REFERENCES "lead_sources"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicants_closure_reason_fkey"
    FOREIGN KEY ("workspace_id", "closure_reason_id")
    REFERENCES "lettings_outcome_reasons"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicants_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicants_reference_check" CHECK (
    "reference" ~ '^APP-[2-9A-HJ-NP-Z]{8}$'
  ),
  -- Closed always has a reason; open never keeps a closure.
  CONSTRAINT "applicants_closure_check" CHECK (
    ("status" = 'closed') = ("closure_reason_id" IS NOT NULL)
    AND ("status" = 'closed' OR "closure_note" IS NULL)
  ),
  CONSTRAINT "applicants_closure_note_check" CHECK (
    "closure_note" IS NULL OR btrim("closure_note") <> ''
  )
);

-- One open applicant record per lead contact.
CREATE UNIQUE INDEX "applicants_one_open_per_lead"
ON "applicants"("workspace_id", "lead_contact_id")
WHERE "status" <> 'closed';
CREATE INDEX "applicants_branch_idx"
ON "applicants"("workspace_id", "responsible_branch_id", "status");
CREATE INDEX "applicants_lead_membership_idx"
ON "applicants"("workspace_id", "lead_membership_id", "status");
CREATE INDEX "applicants_lead_source_idx"
ON "applicants"("workspace_id", "lead_source_id");
CREATE INDEX "applicants_closure_reason_idx"
ON "applicants"("workspace_id", "closure_reason_id");
CREATE INDEX "applicants_created_by_idx"
ON "applicants"("workspace_id", "created_by_membership_id");

CREATE TABLE "applicant_status_history" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "applicant_id" uuid NOT NULL,
  "from_status" "applicant_status" NOT NULL,
  "to_status" "applicant_status" NOT NULL,
  "note" varchar(500),
  "actor_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "applicant_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applicant_status_history_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "applicant_status_history_applicant_fkey"
    FOREIGN KEY ("workspace_id", "applicant_id")
    REFERENCES "applicants"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicant_status_history_actor_fkey"
    FOREIGN KEY ("workspace_id", "actor_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicant_status_history_change_check" CHECK (
    "from_status" <> "to_status"
  )
);
-- One status change per applicant per transaction.
CREATE UNIQUE INDEX "applicant_status_history_once_per_transaction"
ON "applicant_status_history"("workspace_id", "applicant_id", "created_at");
CREATE INDEX "applicant_status_history_actor_idx"
ON "applicant_status_history"("workspace_id", "actor_membership_id");

CREATE TABLE "applicant_members" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "applicant_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "added_by_membership_id" uuid NOT NULL,
  "added_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" timestamptz(6),
  "ended_by_membership_id" uuid,
  CONSTRAINT "applicant_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applicant_members_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "applicant_members_applicant_fkey"
    FOREIGN KEY ("workspace_id", "applicant_id")
    REFERENCES "applicants"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicant_members_contact_fkey"
    FOREIGN KEY ("workspace_id", "contact_id")
    REFERENCES "contacts"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicant_members_added_by_fkey"
    FOREIGN KEY ("workspace_id", "added_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicant_members_ended_by_fkey"
    FOREIGN KEY ("workspace_id", "ended_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicant_members_ended_check" CHECK (
    ("ended_at" IS NULL) = ("ended_by_membership_id" IS NULL)
  )
);
CREATE UNIQUE INDEX "applicant_members_one_current"
ON "applicant_members"("workspace_id", "applicant_id", "contact_id")
WHERE "ended_at" IS NULL;
CREATE INDEX "applicant_members_contact_idx"
ON "applicant_members"("workspace_id", "contact_id");
CREATE INDEX "applicant_members_added_by_idx"
ON "applicant_members"("workspace_id", "added_by_membership_id");
CREATE INDEX "applicant_members_ended_by_idx"
ON "applicant_members"("workspace_id", "ended_by_membership_id");

-- What the household is looking for: append-only versions, the highest
-- version number is current. Deliberately no field for income, employment,
-- immigration, identity, benefits, children or any protected characteristic.
CREATE TABLE "applicant_requirement_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "applicant_id" uuid NOT NULL,
  -- Numbered by the database.
  "version_no" integer NOT NULL DEFAULT 0,
  "areas" varchar(60)[] NOT NULL DEFAULT '{}',
  "min_rent_pence" integer,
  "max_rent_pence" integer,
  "rent_period" "rent_period" NOT NULL DEFAULT 'month',
  "min_bedrooms" smallint,
  "max_bedrooms" smallint,
  "property_types" "property_type"[] NOT NULL DEFAULT '{}',
  "furnished" "furnished_status",
  "move_from" date,
  "move_by" date,
  "household_size" smallint,
  "has_pets" boolean NOT NULL DEFAULT false,
  "notes" varchar(500) NOT NULL DEFAULT '',
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "applicant_requirement_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applicant_requirement_versions_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "applicant_requirement_versions_number_key"
    UNIQUE ("workspace_id", "applicant_id", "version_no"),
  CONSTRAINT "applicant_requirement_versions_applicant_fkey"
    FOREIGN KEY ("workspace_id", "applicant_id")
    REFERENCES "applicants"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicant_requirement_versions_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applicant_requirement_versions_areas_check" CHECK (
    cardinality("areas") <= 10
  ),
  CONSTRAINT "applicant_requirement_versions_rent_check" CHECK (
    ("min_rent_pence" IS NULL OR "min_rent_pence" BETWEEN 100 AND 10000000)
    AND ("max_rent_pence" IS NULL OR "max_rent_pence" BETWEEN 100 AND 10000000)
    AND (
      "min_rent_pence" IS NULL OR "max_rent_pence" IS NULL
      OR "min_rent_pence" <= "max_rent_pence"
    )
  ),
  CONSTRAINT "applicant_requirement_versions_bedrooms_check" CHECK (
    ("min_bedrooms" IS NULL OR "min_bedrooms" BETWEEN 0 AND 20)
    AND ("max_bedrooms" IS NULL OR "max_bedrooms" BETWEEN 0 AND 20)
    AND (
      "min_bedrooms" IS NULL OR "max_bedrooms" IS NULL
      OR "min_bedrooms" <= "max_bedrooms"
    )
  ),
  CONSTRAINT "applicant_requirement_versions_move_check" CHECK (
    "move_from" IS NULL OR "move_by" IS NULL OR "move_from" <= "move_by"
  ),
  CONSTRAINT "applicant_requirement_versions_household_check" CHECK (
    "household_size" IS NULL OR "household_size" BETWEEN 1 AND 20
  )
);
CREATE INDEX "applicant_requirement_versions_created_by_idx"
ON "applicant_requirement_versions"("workspace_id", "created_by_membership_id");

-- One applicant's interest in one listing.
CREATE TABLE "property_enquiries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "applicant_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  -- Set by the database from the listing.
  "property_id" uuid NOT NULL,
  "responsible_branch_id" uuid NOT NULL,
  "stage" "property_enquiry_stage" NOT NULL DEFAULT 'new',
  "stage_changed_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_membership_id" uuid,
  "lead_source_id" uuid,
  "closure_reason_id" uuid,
  "closure_note" varchar(500),
  -- Closed by the database because the listing was withdrawn.
  "closed_by_listing" boolean NOT NULL DEFAULT false,
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_enquiries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_enquiries_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "property_enquiries_applicant_fkey"
    FOREIGN KEY ("workspace_id", "applicant_id")
    REFERENCES "applicants"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiries_listing_fkey"
    FOREIGN KEY ("workspace_id", "listing_id")
    REFERENCES "listings"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiries_property_fkey"
    FOREIGN KEY ("workspace_id", "property_id")
    REFERENCES "properties"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiries_branch_fkey"
    FOREIGN KEY ("workspace_id", "responsible_branch_id")
    REFERENCES "branches"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiries_assigned_fkey"
    FOREIGN KEY ("workspace_id", "assigned_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiries_lead_source_fkey"
    FOREIGN KEY ("workspace_id", "lead_source_id")
    REFERENCES "lead_sources"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiries_closure_reason_fkey"
    FOREIGN KEY ("workspace_id", "closure_reason_id")
    REFERENCES "lettings_outcome_reasons"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiries_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Closed always has a reason (staff) or was closed by the listing; open
  -- never keeps a closure.
  CONSTRAINT "property_enquiries_closure_check" CHECK (
    (
      "stage" = 'closed'
      AND ("closure_reason_id" IS NOT NULL OR "closed_by_listing")
    ) OR (
      "stage" <> 'closed'
      AND "closure_reason_id" IS NULL
      AND "closure_note" IS NULL
      AND NOT "closed_by_listing"
    )
  ),
  CONSTRAINT "property_enquiries_closure_note_check" CHECK (
    "closure_note" IS NULL OR btrim("closure_note") <> ''
  )
);
-- One open enquiry per applicant and listing.
CREATE UNIQUE INDEX "property_enquiries_one_open"
ON "property_enquiries"("workspace_id", "applicant_id", "listing_id")
WHERE "stage" <> 'closed';
CREATE INDEX "property_enquiries_listing_idx"
ON "property_enquiries"("workspace_id", "listing_id", "stage");
CREATE INDEX "property_enquiries_branch_idx"
ON "property_enquiries"("workspace_id", "responsible_branch_id", "stage");
CREATE INDEX "property_enquiries_assigned_idx"
ON "property_enquiries"("workspace_id", "assigned_membership_id", "stage");
CREATE INDEX "property_enquiries_property_idx"
ON "property_enquiries"("workspace_id", "property_id");
CREATE INDEX "property_enquiries_lead_source_idx"
ON "property_enquiries"("workspace_id", "lead_source_id");
CREATE INDEX "property_enquiries_closure_reason_idx"
ON "property_enquiries"("workspace_id", "closure_reason_id");
CREATE INDEX "property_enquiries_created_by_idx"
ON "property_enquiries"("workspace_id", "created_by_membership_id");

CREATE TABLE "property_enquiry_stage_history" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "property_enquiry_id" uuid NOT NULL,
  "from_stage" "property_enquiry_stage" NOT NULL,
  "to_stage" "property_enquiry_stage" NOT NULL,
  "kind" "property_enquiry_change_kind" NOT NULL DEFAULT 'staff',
  "note" varchar(500),
  "actor_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_enquiry_stage_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_enquiry_stage_history_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "property_enquiry_stage_history_enquiry_fkey"
    FOREIGN KEY ("workspace_id", "property_enquiry_id")
    REFERENCES "property_enquiries"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiry_stage_history_actor_fkey"
    FOREIGN KEY ("workspace_id", "actor_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_enquiry_stage_history_change_check" CHECK (
    "from_stage" <> "to_stage"
  ),
  CONSTRAINT "property_enquiry_stage_history_kind_check" CHECK (
    "kind" = 'staff' OR "to_stage" = 'closed'
  )
);
-- One stage change per enquiry per transaction.
CREATE UNIQUE INDEX "property_enquiry_stage_history_once_per_transaction"
ON "property_enquiry_stage_history"(
  "workspace_id", "property_enquiry_id", "created_at"
);
CREATE INDEX "property_enquiry_stage_history_actor_idx"
ON "property_enquiry_stage_history"("workspace_id", "actor_membership_id");

-- Next actions for applicants and enquiries reuse the actions table.
ALTER TABLE "actions"
  ADD COLUMN "applicant_id" uuid,
  ADD COLUMN "property_enquiry_id" uuid,
  ADD CONSTRAINT "actions_applicant_fkey"
    FOREIGN KEY ("workspace_id", "applicant_id")
    REFERENCES "applicants"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "actions_property_enquiry_fkey"
    FOREIGN KEY ("workspace_id", "property_enquiry_id")
    REFERENCES "property_enquiries"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "actions_enquiry_needs_applicant_check" CHECK (
    "property_enquiry_id" IS NULL OR "applicant_id" IS NOT NULL
  );
CREATE INDEX "actions_applicant_idx"
ON "actions"("workspace_id", "applicant_id");
CREATE INDEX "actions_property_enquiry_idx"
ON "actions"("workspace_id", "property_enquiry_id");

-- A contact leading or belonging to an open applicant cannot be archived;
-- the count is kept by the database, like the other linked-record counts.
ALTER TABLE "contacts"
  ADD COLUMN "current_open_applicant_count" integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT "contacts_open_applicant_count_check" CHECK (
    "current_open_applicant_count" >= 0
    AND ("status" = 'active' OR "current_open_applicant_count" = 0)
  );

CREATE OR REPLACE FUNCTION "public"."protect_contact_ownership_count"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (
    NEW."current_property_ownership_count" <> 0
    OR NEW."current_open_enquiry_count" <> 0
    OR NEW."current_instruction_party_count" <> 0
    OR NEW."current_open_applicant_count" <> 0
  ) THEN
    RAISE EXCEPTION 'a new contact cannot start with linked records'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW."current_property_ownership_count" <>
        OLD."current_property_ownership_count"
      OR NEW."current_open_enquiry_count" <> OLD."current_open_enquiry_count"
      OR NEW."current_instruction_party_count" <>
        OLD."current_instruction_party_count"
      OR NEW."current_open_applicant_count" <>
        OLD."current_open_applicant_count"
    )
    AND NOT "public"."is_link_count_maintainer"()
  THEN
    RAISE EXCEPTION 'linked record counts are maintained by the database'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER "contacts_protect_ownership_count" ON "contacts";
CREATE TRIGGER "contacts_protect_ownership_count"
BEFORE INSERT OR UPDATE OF
  "current_property_ownership_count",
  "current_open_enquiry_count",
  "current_instruction_party_count",
  "current_open_applicant_count"
ON "contacts"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_contact_ownership_count"();

-- The lead and each current member count while the applicant is open. The
-- contacts may be outside the user's branches, so the count updates run with
-- agency-wide scope; they stay inside the user's agency, touch only the
-- linked contacts and change only the count. Trigger functions cannot be
-- called directly, so the app cannot use them to change counts.
CREATE FUNCTION "public"."maintain_applicant_contact_counts"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  new_open boolean := NEW."status" <> 'closed';
  old_open boolean := TG_OP = 'UPDATE' AND OLD."status" <> 'closed';
  delta integer;
  expected integer;
  updated_rows integer;
  saved_scope text := current_setting('app.membership_scope_mode', true);
BEGIN
  delta := (CASE WHEN new_open THEN 1 ELSE 0 END)
    - (CASE WHEN old_open THEN 1 ELSE 0 END);
  IF delta = 0 THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.membership_scope_mode', 'workspace', true);
  SELECT 1 + count(*) INTO expected
  FROM "applicant_members"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "applicant_id" = NEW."id"
    AND "ended_at" IS NULL;
  UPDATE "contacts"
  SET "current_open_applicant_count" = "current_open_applicant_count" + delta
  WHERE "workspace_id" = NEW."workspace_id"
    AND (
      "id" = NEW."lead_contact_id"
      OR "id" IN (
        SELECT "contact_id" FROM "applicant_members"
        WHERE "workspace_id" = NEW."workspace_id"
          AND "applicant_id" = NEW."id"
          AND "ended_at" IS NULL
      )
    );
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  PERFORM set_config(
    'app.membership_scope_mode', COALESCE(saved_scope, ''), true
  );
  IF updated_rows <> expected THEN
    RAISE EXCEPTION 'applicant contact counts could not be updated'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION "public"."maintain_applicant_member_counts"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  applicant_open boolean;
  delta integer := 0;
  updated_rows integer;
  saved_scope text := current_setting('app.membership_scope_mode', true);
BEGIN
  IF TG_OP = 'INSERT' AND NEW."ended_at" IS NULL THEN
    delta := 1;
  ELSIF TG_OP = 'UPDATE' AND OLD."ended_at" IS NULL
    AND NEW."ended_at" IS NOT NULL
  THEN
    delta := -1;
  END IF;
  IF delta = 0 THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.membership_scope_mode', 'workspace', true);
  SELECT "status" <> 'closed' INTO applicant_open
  FROM "applicants"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."applicant_id";
  IF COALESCE(applicant_open, false) THEN
    UPDATE "contacts"
    SET "current_open_applicant_count" =
      "current_open_applicant_count" + delta
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."contact_id";
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    IF updated_rows <> 1 THEN
      RAISE EXCEPTION 'member contact count could not be updated'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  PERFORM set_config(
    'app.membership_scope_mode', COALESCE(saved_scope, ''), true
  );
  RETURN NULL;
END;
$$;

-- --- Applicants ---

CREATE FUNCTION "public"."prepare_applicant"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."status" <> 'active' THEN
    RAISE EXCEPTION 'a new applicant starts active'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "contacts"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."lead_contact_id"
      AND "status" = 'active'
  ) THEN
    RAISE EXCEPTION 'the lead must be an active contact you can see'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."lead_membership_id" IS NOT NULL
    AND NOT "public"."applicant_member_can_work"(
      NEW."lead_membership_id", NEW."responsible_branch_id"
    )
  THEN
    RAISE EXCEPTION 'the owner cannot work with applicants in this branch'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."lead_source_id" IS NOT NULL THEN
    PERFORM "public"."assert_lead_source_offered"(
      NEW."workspace_id", NEW."lead_source_id"
    );
  END IF;
  NEW."created_at" := transaction_timestamp();
  NEW."status_changed_at" := transaction_timestamp();
  NEW."updated_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "applicants_prepare"
BEFORE INSERT ON "applicants"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_applicant"();

CREATE FUNCTION "public"."enforce_applicant_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."reference" <> OLD."reference"
    OR NEW."lead_contact_id" <> OLD."lead_contact_id"
    OR NEW."responsible_branch_id" <> OLD."responsible_branch_id"
    OR NEW."created_by_membership_id" <> OLD."created_by_membership_id"
    OR NEW."created_at" <> OLD."created_at"
  THEN
    RAISE EXCEPTION 'an applicant''s identity cannot change'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" <> OLD."status" THEN
    IF NOT "public"."applicant_transition_allowed"(OLD."status", NEW."status")
    THEN
      RAISE EXCEPTION 'this applicant change is not allowed'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "applicant_status_history"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "applicant_id" = NEW."id"
        AND "from_status" = OLD."status"
        AND "to_status" = NEW."status"
        AND "actor_membership_id" = actor
        AND "created_at" = transaction_timestamp()
    ) THEN
      RAISE EXCEPTION 'applicant changes require a history record'
        USING ERRCODE = '23514';
    END IF;
    IF OLD."status" = 'closed'
      AND NOT "public"."applicant_member_can_reopen"(
        actor, NEW."responsible_branch_id"
      )
    THEN
      RAISE EXCEPTION 'only a manager can reopen an applicant'
        USING ERRCODE = '42501';
    END IF;
    IF OLD."status" = 'closed' THEN
      NEW."closure_reason_id" := NULL;
      NEW."closure_note" := NULL;
    END IF;
    NEW."status_changed_at" := transaction_timestamp();
  ELSE
    -- A closure is recorded by the change that closes, never rewritten later.
    IF NEW."closure_reason_id" IS DISTINCT FROM OLD."closure_reason_id"
      OR NEW."closure_note" IS DISTINCT FROM OLD."closure_note"
    THEN
      RAISE EXCEPTION 'a closure cannot be changed afterwards'
        USING ERRCODE = '23514';
    END IF;
    NEW."status_changed_at" := OLD."status_changed_at";
  END IF;

  IF NEW."closure_reason_id" IS NOT NULL
    AND NEW."closure_reason_id" IS DISTINCT FROM OLD."closure_reason_id"
  THEN
    PERFORM "public"."assert_lettings_reason"(
      NEW."workspace_id", NEW."closure_reason_id", 'applicant'
    );
  END IF;
  IF NEW."lead_membership_id" IS NOT NULL
    AND NEW."lead_membership_id" IS DISTINCT FROM OLD."lead_membership_id"
    AND NOT "public"."applicant_member_can_work"(
      NEW."lead_membership_id", NEW."responsible_branch_id"
    )
  THEN
    RAISE EXCEPTION 'the owner cannot work with applicants in this branch'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."lead_source_id" IS NOT NULL
    AND NEW."lead_source_id" IS DISTINCT FROM OLD."lead_source_id"
  THEN
    PERFORM "public"."assert_lead_source_offered"(
      NEW."workspace_id", NEW."lead_source_id"
    );
  END IF;
  NEW."updated_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "applicants_enforce_rules"
BEFORE UPDATE ON "applicants"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_applicant_rules"();

CREATE TRIGGER "applicants_maintain_contact_counts"
AFTER INSERT OR UPDATE OF "status" ON "applicants"
FOR EACH ROW EXECUTE FUNCTION "public"."maintain_applicant_contact_counts"();

-- A status change starts from the applicant's real current status, timed by
-- the database. FOR UPDATE serialises changes to one applicant.
CREATE FUNCTION "public"."prepare_applicant_status_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_status "applicant_status";
BEGIN
  SELECT "status" INTO current_status
  FROM "applicants"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."applicant_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a status change must belong to a visible applicant'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."from_status" <> current_status THEN
    RAISE EXCEPTION 'the applicant has moved on since this was started'
      USING ERRCODE = '23514';
  END IF;
  NEW."created_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "applicant_status_history_prepare"
BEFORE INSERT ON "applicant_status_history"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_applicant_status_change"();

CREATE FUNCTION "public"."enforce_applicant_status_applied"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "applicants"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."applicant_id"
      AND "status" = NEW."to_status"
      AND "status_changed_at" = NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'an applicant status record must match the applicant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "applicant_status_history_require_change"
AFTER INSERT ON "applicant_status_history"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_applicant_status_applied"();

-- --- Household members ---

CREATE FUNCTION "public"."prepare_applicant_member"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  applicant_status "applicant_status";
  lead uuid;
BEGIN
  SELECT "status", "lead_contact_id" INTO applicant_status, lead
  FROM "applicants"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."applicant_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a member must belong to a visible applicant'
      USING ERRCODE = '42501';
  END IF;
  IF applicant_status = 'closed' THEN
    RAISE EXCEPTION 'a closed applicant cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."contact_id" = lead THEN
    RAISE EXCEPTION 'the lead is already part of the household'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "contacts"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."contact_id"
      AND "status" = 'active'
  ) THEN
    RAISE EXCEPTION 'a member must be an active contact you can see'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."ended_at" IS NOT NULL OR NEW."ended_by_membership_id" IS NOT NULL THEN
    RAISE EXCEPTION 'a new member cannot start ended'
      USING ERRCODE = '23514';
  END IF;
  NEW."added_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "applicant_members_prepare"
BEFORE INSERT ON "applicant_members"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_applicant_member"();

-- Ending is the only change, once, by the current member at the database's
-- time.
CREATE FUNCTION "public"."enforce_applicant_member_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."applicant_id" <> OLD."applicant_id"
    OR NEW."contact_id" <> OLD."contact_id"
    OR NEW."added_by_membership_id" <> OLD."added_by_membership_id"
    OR NEW."added_at" <> OLD."added_at"
  THEN
    RAISE EXCEPTION 'a household member''s details cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."ended_at" IS NOT NULL THEN
    RAISE EXCEPTION 'an ended member cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."ended_at" IS NOT NULL THEN
    IF actor IS NULL THEN
      RAISE EXCEPTION 'a member is ended by the current member'
        USING ERRCODE = '42501';
    END IF;
    -- Waits for a status change of the applicant in progress, so ending a
    -- member and closing the applicant never both take the member off.
    PERFORM 1 FROM "applicants"
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."applicant_id"
    FOR UPDATE;
    NEW."ended_at" := transaction_timestamp();
    NEW."ended_by_membership_id" := actor;
  ELSE
    NEW."ended_by_membership_id" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "applicant_members_enforce_rules"
BEFORE UPDATE ON "applicant_members"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_applicant_member_rules"();

CREATE TRIGGER "applicant_members_maintain_contact_counts"
AFTER INSERT OR UPDATE OF "ended_at" ON "applicant_members"
FOR EACH ROW EXECUTE FUNCTION "public"."maintain_applicant_member_counts"();

-- --- Requirements ---

-- Numbered by the database on an open applicant; FOR UPDATE serialises
-- versions. Areas must not be blank.
CREATE FUNCTION "public"."prepare_applicant_requirement_version"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  applicant_status "applicant_status";
BEGIN
  SELECT "status" INTO applicant_status
  FROM "applicants"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."applicant_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'requirements must belong to a visible applicant'
      USING ERRCODE = '42501';
  END IF;
  IF applicant_status = 'closed' THEN
    RAISE EXCEPTION 'a closed applicant cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW."areas") AS area WHERE btrim(area) = ''
  ) THEN
    RAISE EXCEPTION 'an area cannot be blank'
      USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(max("version_no"), 0) + 1 INTO NEW."version_no"
  FROM "applicant_requirement_versions"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "applicant_id" = NEW."applicant_id";
  NEW."created_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "applicant_requirement_versions_prepare"
BEFORE INSERT ON "applicant_requirement_versions"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_applicant_requirement_version"();

-- --- Property enquiries ---

-- Only on a Ready to advertise listing (ADR-037), for an open applicant. The
-- property and branch come from the listing; FOR SHARE waits for a listing
-- change in progress.
CREATE FUNCTION "public"."prepare_property_enquiry"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  listing_state "listing_state";
  listing_property uuid;
  listing_branch uuid;
  applicant_status "applicant_status";
BEGIN
  IF NEW."stage" <> 'new' OR NEW."closed_by_listing"
    OR NEW."closure_reason_id" IS NOT NULL OR NEW."closure_note" IS NOT NULL
  THEN
    RAISE EXCEPTION 'a new enquiry starts as New'
      USING ERRCODE = '23514';
  END IF;
  SELECT l."state", l."property_id", i."responsible_branch_id"
  INTO listing_state, listing_property, listing_branch
  FROM "listings" AS l
  JOIN "instructions" AS i
    ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
  WHERE l."workspace_id" = NEW."workspace_id" AND l."id" = NEW."listing_id"
  FOR SHARE OF l;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an enquiry must be for a visible listing'
      USING ERRCODE = '42501';
  END IF;
  IF listing_state <> 'ready_to_advertise' THEN
    RAISE EXCEPTION 'an enquiry can only be recorded on a Ready to advertise listing'
      USING ERRCODE = '23514';
  END IF;
  SELECT "status" INTO applicant_status
  FROM "applicants"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."applicant_id"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an enquiry must belong to a visible applicant'
      USING ERRCODE = '42501';
  END IF;
  IF applicant_status = 'closed' THEN
    RAISE EXCEPTION 'a closed applicant cannot make an enquiry'
      USING ERRCODE = '23514';
  END IF;
  NEW."property_id" := listing_property;
  NEW."responsible_branch_id" := listing_branch;
  IF NEW."assigned_membership_id" IS NOT NULL
    AND NOT "public"."applicant_member_can_work"(
      NEW."assigned_membership_id", listing_branch
    )
  THEN
    RAISE EXCEPTION 'the assignee cannot work with enquiries in this branch'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."lead_source_id" IS NOT NULL THEN
    PERFORM "public"."assert_lead_source_offered"(
      NEW."workspace_id", NEW."lead_source_id"
    );
  END IF;
  NEW."created_at" := transaction_timestamp();
  NEW."stage_changed_at" := transaction_timestamp();
  NEW."updated_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "property_enquiries_prepare"
BEFORE INSERT ON "property_enquiries"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_property_enquiry"();

-- Legal moves only, each backed by a history row from the current member in
-- this transaction. Someone who may not work with applicants (a listing
-- reviewer or instruction worker, through the listing withdrawal cascade)
-- may only close it because the listing was withdrawn.
CREATE FUNCTION "public"."enforce_property_enquiry_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
  listing_state "listing_state";
  change_kind "property_enquiry_change_kind";
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."applicant_id" <> OLD."applicant_id"
    OR NEW."listing_id" <> OLD."listing_id"
    OR NEW."property_id" <> OLD."property_id"
    OR NEW."responsible_branch_id" <> OLD."responsible_branch_id"
    OR NEW."created_by_membership_id" <> OLD."created_by_membership_id"
    OR NEW."created_at" <> OLD."created_at"
  THEN
    RAISE EXCEPTION 'an enquiry''s identity cannot change'
      USING ERRCODE = '23514';
  END IF;

  IF NOT "public"."applicant_member_can_work"(actor, NEW."responsible_branch_id")
    AND NOT (
      OLD."stage" <> 'closed'
      AND NEW."stage" = 'closed'
      AND NEW."closed_by_listing"
      AND NEW."assigned_membership_id" IS NOT DISTINCT FROM OLD."assigned_membership_id"
      AND NEW."lead_source_id" IS NOT DISTINCT FROM OLD."lead_source_id"
      AND NEW."closure_reason_id" IS NULL
    )
  THEN
    RAISE EXCEPTION 'you cannot change this enquiry'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."stage" <> OLD."stage" THEN
    IF NOT "public"."property_enquiry_transition_allowed"(
      OLD."stage", NEW."stage"
    ) THEN
      RAISE EXCEPTION 'this enquiry change is not allowed'
        USING ERRCODE = '23514';
    END IF;
    SELECT "kind" INTO change_kind
    FROM "property_enquiry_stage_history"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "property_enquiry_id" = NEW."id"
      AND "from_stage" = OLD."stage"
      AND "to_stage" = NEW."stage"
      AND "actor_membership_id" = actor
      AND "created_at" = transaction_timestamp();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'enquiry changes require a history record'
        USING ERRCODE = '23514';
    END IF;
    SELECT "state" INTO listing_state
    FROM "listings"
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."listing_id";
    -- Reopening clears the closure first (and is refused on a withdrawn
    -- listing).
    IF OLD."stage" = 'closed' THEN
      IF listing_state IS DISTINCT FROM 'ready_to_advertise' THEN
        RAISE EXCEPTION 'an enquiry can only be reopened while the listing is Ready to advertise'
          USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "applicants"
        WHERE "workspace_id" = NEW."workspace_id"
          AND "id" = NEW."applicant_id"
          AND "status" <> 'closed'
      ) THEN
        RAISE EXCEPTION 'a closed applicant''s enquiry cannot be reopened'
          USING ERRCODE = '23514';
      END IF;
      NEW."closure_reason_id" := NULL;
      NEW."closure_note" := NULL;
      NEW."closed_by_listing" := false;
    END IF;
    -- Closed by the listing only when it really is withdrawn, and only
    -- through a withdrawal record.
    IF NEW."closed_by_listing" <> (change_kind = 'listing_withdrawn') THEN
      RAISE EXCEPTION 'a withdrawal closure must come from the listing'
        USING ERRCODE = '23514';
    END IF;
    IF NEW."closed_by_listing"
      AND listing_state IS DISTINCT FROM 'withdrawn'
    THEN
      RAISE EXCEPTION 'the listing has not been withdrawn'
        USING ERRCODE = '23514';
    END IF;
    NEW."stage_changed_at" := transaction_timestamp();
  ELSE
    IF NEW."closed_by_listing" <> OLD."closed_by_listing" THEN
      RAISE EXCEPTION 'a withdrawal closure must come from the listing'
        USING ERRCODE = '23514';
    END IF;
    -- A closure is recorded by the change that closes, never rewritten later.
    IF NEW."closure_reason_id" IS DISTINCT FROM OLD."closure_reason_id"
      OR NEW."closure_note" IS DISTINCT FROM OLD."closure_note"
    THEN
      RAISE EXCEPTION 'a closure cannot be changed afterwards'
        USING ERRCODE = '23514';
    END IF;
    NEW."stage_changed_at" := OLD."stage_changed_at";
  END IF;

  IF NEW."closure_reason_id" IS NOT NULL
    AND NEW."closure_reason_id" IS DISTINCT FROM OLD."closure_reason_id"
  THEN
    PERFORM "public"."assert_lettings_reason"(
      NEW."workspace_id", NEW."closure_reason_id", 'property_enquiry'
    );
  END IF;
  IF NEW."assigned_membership_id" IS NOT NULL
    AND NEW."assigned_membership_id" IS DISTINCT FROM OLD."assigned_membership_id"
    AND NOT "public"."applicant_member_can_work"(
      NEW."assigned_membership_id", NEW."responsible_branch_id"
    )
  THEN
    RAISE EXCEPTION 'the assignee cannot work with enquiries in this branch'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."lead_source_id" IS NOT NULL
    AND NEW."lead_source_id" IS DISTINCT FROM OLD."lead_source_id"
  THEN
    PERFORM "public"."assert_lead_source_offered"(
      NEW."workspace_id", NEW."lead_source_id"
    );
  END IF;
  NEW."updated_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "property_enquiries_enforce_rules"
BEFORE UPDATE ON "property_enquiries"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_property_enquiry_rules"();

CREATE FUNCTION "public"."prepare_property_enquiry_stage_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_stage "property_enquiry_stage";
BEGIN
  SELECT "stage" INTO current_stage
  FROM "property_enquiries"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "id" = NEW."property_enquiry_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a stage change must belong to a visible enquiry'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."from_stage" <> current_stage THEN
    RAISE EXCEPTION 'the enquiry has moved on since this was started'
      USING ERRCODE = '23514';
  END IF;
  NEW."created_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "property_enquiry_stage_history_prepare"
BEFORE INSERT ON "property_enquiry_stage_history"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_property_enquiry_stage_change"();

CREATE FUNCTION "public"."enforce_property_enquiry_stage_applied"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "property_enquiries"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."property_enquiry_id"
      AND "stage" = NEW."to_stage"
      AND "stage_changed_at" = NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'an enquiry stage record must match the enquiry'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "property_enquiry_stage_history_require_change"
AFTER INSERT ON "property_enquiry_stage_history"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_property_enquiry_stage_applied"();

-- Withdrawing a listing (including when its instruction ends) closes its
-- open enquiries in the same transaction, by the same person, with history.
CREATE FUNCTION "public"."cascade_listing_to_property_enquiries"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
  enquiry record;
BEGIN
  FOR enquiry IN
    SELECT "id", "stage" FROM "property_enquiries"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "listing_id" = NEW."id"
      AND "stage" <> 'closed'
    FOR UPDATE
  LOOP
    INSERT INTO "property_enquiry_stage_history" (
      "workspace_id", "property_enquiry_id", "from_stage", "to_stage",
      "kind", "note", "actor_membership_id"
    ) VALUES (
      NEW."workspace_id", enquiry."id", enquiry."stage", 'closed',
      'listing_withdrawn', 'Home no longer available', actor
    );
    UPDATE "property_enquiries"
    SET "stage" = 'closed',
      "closed_by_listing" = true,
      "closure_note" = 'Home no longer available'
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = enquiry."id";
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "listings_cascade_to_property_enquiries"
AFTER UPDATE ON "listings"
FOR EACH ROW
WHEN (OLD."state" <> 'withdrawn' AND NEW."state" = 'withdrawn')
EXECUTE FUNCTION "public"."cascade_listing_to_property_enquiries"();

-- --- Actions: links to applicants and enquiries ---

CREATE OR REPLACE FUNCTION "public"."enforce_action_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  is_new boolean := TG_OP = 'INSERT';
BEGIN
  IF NOT is_new THEN
    IF NEW."id" <> OLD."id"
      OR NEW."workspace_id" <> OLD."workspace_id"
      OR NEW."responsible_branch_id" <> OLD."responsible_branch_id"
      OR NEW."created_by_membership_id" <> OLD."created_by_membership_id"
      OR NEW."created_at" <> OLD."created_at"
    THEN
      RAISE EXCEPTION 'action identity cannot be changed'
        USING ERRCODE = '23514';
    END IF;
    IF OLD."status" <> 'open' THEN
      RAISE EXCEPTION 'a closed action cannot be changed'
        USING ERRCODE = '23514';
    END IF;
    IF (OLD."contact_id" IS NOT NULL
        AND NEW."contact_id" IS DISTINCT FROM OLD."contact_id")
      OR (OLD."property_id" IS NOT NULL
        AND NEW."property_id" IS DISTINCT FROM OLD."property_id")
      OR (OLD."applicant_id" IS NOT NULL
        AND NEW."applicant_id" IS DISTINCT FROM OLD."applicant_id")
      OR (OLD."property_enquiry_id" IS NOT NULL
        AND NEW."property_enquiry_id" IS DISTINCT FROM OLD."property_enquiry_id")
    THEN
      RAISE EXCEPTION 'a linked action record cannot be replaced'
        USING ERRCODE = '23514';
    END IF;
    -- Outside the action's branch (an assignee who has lost access), the only
    -- changes allowed are finishing, cancelling and handing it over.
    IF NOT (
      current_setting('app.membership_scope_mode', true) = 'workspace'
      OR OLD."responsible_branch_id" = ANY(
        COALESCE(
          NULLIF(current_setting('app.allowed_branch_ids', true), '')::uuid[],
          ARRAY[]::uuid[]
        )
      )
    ) AND (
      NEW."title" IS DISTINCT FROM OLD."title"
      OR NEW."kind" IS DISTINCT FROM OLD."kind"
      OR NEW."due_on" IS DISTINCT FROM OLD."due_on"
      OR NEW."planned_for" IS DISTINCT FROM OLD."planned_for"
      OR NEW."contact_id" IS DISTINCT FROM OLD."contact_id"
      OR NEW."property_id" IS DISTINCT FROM OLD."property_id"
      OR NEW."applicant_id" IS DISTINCT FROM OLD."applicant_id"
      OR NEW."property_enquiry_id" IS DISTINCT FROM OLD."property_enquiry_id"
    ) THEN
      RAISE EXCEPTION 'outside its branch an action can only be finished or handed over'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Who handed it over always comes from the database.
  IF is_new THEN
    NEW."handed_over_by_membership_id" := NULL;
  ELSIF NEW."assigned_membership_id" <> OLD."assigned_membership_id" THEN
    NEW."handed_over_by_membership_id" :=
      NULLIF(current_setting('app.membership_id', true), '')::uuid;
  ELSE
    NEW."handed_over_by_membership_id" := OLD."handed_over_by_membership_id";
  END IF;

  IF (is_new OR NEW."assigned_membership_id" <> OLD."assigned_membership_id")
    AND NOT "public"."action_member_can_work"(
      NEW."assigned_membership_id", NEW."responsible_branch_id"
    )
  THEN
    RAISE EXCEPTION 'the assignee cannot work on this action'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."contact_id" IS NOT NULL AND (is_new OR OLD."contact_id" IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM "contacts"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "id" = NEW."contact_id"
        AND "status" = 'active'
    )
  THEN
    RAISE EXCEPTION 'action contact must be an active contact you can see'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."property_id" IS NOT NULL AND (is_new OR OLD."property_id" IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM "properties"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "id" = NEW."property_id"
        AND "status" = 'active'
    )
  THEN
    RAISE EXCEPTION 'action property must be an active property you can see'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."applicant_id" IS NOT NULL AND (is_new OR OLD."applicant_id" IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM "applicants"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "id" = NEW."applicant_id"
        AND "status" <> 'closed'
    )
  THEN
    RAISE EXCEPTION 'action applicant must be an open applicant you can see'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."property_enquiry_id" IS NOT NULL
    AND (is_new OR OLD."property_enquiry_id" IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM "property_enquiries"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "id" = NEW."property_enquiry_id"
        AND "applicant_id" = NEW."applicant_id"
        AND "stage" <> 'closed'
    )
  THEN
    RAISE EXCEPTION 'action enquiry must be an open enquiry of that applicant'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."status" <> 'open' THEN
    NEW."closed_at" := transaction_timestamp();
  END IF;

  RETURN NEW;
END;
$$;

-- --- Row-level security ---

ALTER TABLE "lettings_outcome_reasons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lettings_outcome_reasons" FORCE ROW LEVEL SECURITY;
ALTER TABLE "applicants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "applicants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "applicant_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "applicant_status_history" FORCE ROW LEVEL SECURITY;
ALTER TABLE "applicant_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "applicant_members" FORCE ROW LEVEL SECURITY;
ALTER TABLE "applicant_requirement_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "applicant_requirement_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "property_enquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_enquiries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "property_enquiry_stage_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_enquiry_stage_history" FORCE ROW LEVEL SECURITY;

-- The reasons list: staff of the agency. Settings screens add the
-- permission check.
CREATE POLICY "lettings_outcome_reason_select_in_workspace"
ON "lettings_outcome_reasons"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."document_member_is_staff"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  )
);
CREATE POLICY "lettings_outcome_reason_insert_in_workspace"
ON "lettings_outcome_reasons"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."applicant_member_can_work"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid, NULL
  )
);
CREATE POLICY "lettings_outcome_reason_update_in_workspace"
ON "lettings_outcome_reasons"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."applicant_member_can_work"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid, NULL
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

-- An applicant is visible to staff who may read applicants and can see its
-- branch, or the branch of any of its enquiries (whose own policy supplies
-- that scope).
CREATE POLICY "applicant_select_in_scope" ON "applicants"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."applicant_member_can_read"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid, NULL
  )
  AND (
    "public"."instruction_branch_in_scope"("responsible_branch_id")
    OR EXISTS (
      SELECT 1 FROM "property_enquiries" AS e
      WHERE e."workspace_id" = "applicants"."workspace_id"
        AND e."applicant_id" = "applicants"."id"
    )
  )
);
CREATE POLICY "applicant_insert_in_scope" ON "applicants"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND "public"."applicant_member_can_work"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid,
    "responsible_branch_id"
  )
);
CREATE POLICY "applicant_update_in_scope" ON "applicants"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."applicant_member_can_work"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid,
    "responsible_branch_id"
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

-- History, members and requirements follow the applicant: visible with it,
-- and added by someone who works with applicants in its branch, as themselves.
CREATE POLICY "applicant_status_select_in_scope" ON "applicant_status_history"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "applicants" AS a
    WHERE a."workspace_id" = "applicant_status_history"."workspace_id"
      AND a."id" = "applicant_status_history"."applicant_id"
  )
);
CREATE POLICY "applicant_status_insert_in_scope" ON "applicant_status_history"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "actor_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "applicants" AS a
    WHERE a."workspace_id" = "applicant_status_history"."workspace_id"
      AND a."id" = "applicant_status_history"."applicant_id"
      AND "public"."applicant_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        a."responsible_branch_id"
      )
  )
);

CREATE POLICY "applicant_member_select_in_scope" ON "applicant_members"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "applicants" AS a
    WHERE a."workspace_id" = "applicant_members"."workspace_id"
      AND a."id" = "applicant_members"."applicant_id"
  )
);
CREATE POLICY "applicant_member_insert_in_scope" ON "applicant_members"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "added_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "applicants" AS a
    WHERE a."workspace_id" = "applicant_members"."workspace_id"
      AND a."id" = "applicant_members"."applicant_id"
      AND "public"."applicant_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        a."responsible_branch_id"
      )
  )
);
CREATE POLICY "applicant_member_update_in_scope" ON "applicant_members"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "applicants" AS a
    WHERE a."workspace_id" = "applicant_members"."workspace_id"
      AND a."id" = "applicant_members"."applicant_id"
      AND "public"."applicant_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        a."responsible_branch_id"
      )
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

CREATE POLICY "applicant_requirement_select_in_scope"
ON "applicant_requirement_versions"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "applicants" AS a
    WHERE a."workspace_id" = "applicant_requirement_versions"."workspace_id"
      AND a."id" = "applicant_requirement_versions"."applicant_id"
  )
);
CREATE POLICY "applicant_requirement_insert_in_scope"
ON "applicant_requirement_versions"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "applicants" AS a
    WHERE a."workspace_id" = "applicant_requirement_versions"."workspace_id"
      AND a."id" = "applicant_requirement_versions"."applicant_id"
      AND "public"."applicant_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        a."responsible_branch_id"
      )
  )
);

-- An enquiry belongs to its listing's branch.
CREATE POLICY "property_enquiry_select_in_scope" ON "property_enquiries"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."applicant_member_can_read"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid,
    "responsible_branch_id"
  )
);
CREATE POLICY "property_enquiry_insert_in_scope" ON "property_enquiries"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND "public"."applicant_member_can_work"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid,
    "responsible_branch_id"
  )
);
-- Changed by those who work with enquiries in the branch, or (only to close
-- it when the listing is withdrawn: see enforce_property_enquiry_rules) by
-- whoever withdrew the listing or ended its instruction.
CREATE POLICY "property_enquiry_update_in_scope" ON "property_enquiries"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND (
    "public"."applicant_member_can_work"(
      NULLIF(current_setting('app.membership_id', true), '')::uuid,
      "responsible_branch_id"
    )
    OR "public"."listing_member_can_review"(
      NULLIF(current_setting('app.membership_id', true), '')::uuid,
      "responsible_branch_id"
    )
    OR "public"."instruction_member_can_work"(
      NULLIF(current_setting('app.membership_id', true), '')::uuid,
      "responsible_branch_id"
    )
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

CREATE POLICY "property_enquiry_stage_select_in_scope"
ON "property_enquiry_stage_history"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "property_enquiries" AS e
    WHERE e."workspace_id" = "property_enquiry_stage_history"."workspace_id"
      AND e."id" = "property_enquiry_stage_history"."property_enquiry_id"
  )
);
CREATE POLICY "property_enquiry_stage_insert_in_scope"
ON "property_enquiry_stage_history"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "actor_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "property_enquiries" AS e
    WHERE e."workspace_id" = "property_enquiry_stage_history"."workspace_id"
      AND e."id" = "property_enquiry_stage_history"."property_enquiry_id"
      AND CASE "property_enquiry_stage_history"."kind"
        WHEN 'staff' THEN "public"."applicant_member_can_work"(
          NULLIF(current_setting('app.membership_id', true), '')::uuid,
          e."responsible_branch_id"
        )
        WHEN 'listing_withdrawn' THEN (
          "public"."listing_member_can_review"(
            NULLIF(current_setting('app.membership_id', true), '')::uuid,
            e."responsible_branch_id"
          )
          OR "public"."instruction_member_can_work"(
            NULLIF(current_setting('app.membership_id', true), '')::uuid,
            e."responsible_branch_id"
          )
        )
        ELSE false
      END
  )
);

-- --- Grants: read and add; change only the named columns; never delete ---

REVOKE ALL ON TABLE
  "lettings_outcome_reasons",
  "applicants",
  "applicant_status_history",
  "applicant_members",
  "applicant_requirement_versions",
  "property_enquiries",
  "property_enquiry_stage_history"
FROM "zayto_app";

GRANT SELECT, INSERT ON TABLE
  "lettings_outcome_reasons",
  "applicants",
  "applicant_status_history",
  "applicant_members",
  "applicant_requirement_versions",
  "property_enquiries",
  "property_enquiry_stage_history"
TO "zayto_app";
GRANT UPDATE ("name", "status", "sort_order", "updated_at")
ON TABLE "lettings_outcome_reasons" TO "zayto_app";
GRANT UPDATE (
  "status", "lead_membership_id", "lead_source_id", "closure_reason_id",
  "closure_note", "updated_at"
) ON TABLE "applicants" TO "zayto_app";
GRANT UPDATE ("ended_at") ON TABLE "applicant_members" TO "zayto_app";
GRANT UPDATE (
  "stage", "assigned_membership_id", "lead_source_id", "closure_reason_id",
  "closure_note", "closed_by_listing", "updated_at"
) ON TABLE "property_enquiries" TO "zayto_app";
