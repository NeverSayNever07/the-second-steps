-- Chunk 6A: instructions and terms. Owner-approved design (2026-10-17) in
-- .cursor/plans/landlord-property-onboarding.md.
--
-- An instruction is created from a won landlord lead, covers one property,
-- and is Current until it records an ended date. One current instruction per
-- property. Landlord parties, whole terms versions, agreement events,
-- ownership checks, manager exceptions and journey changes are kept as
-- history: rows are added, never edited (parties are only removed), and the
-- app role can never delete. Ready to market is checked by the database at
-- commit, so no path can leave an incomplete property marked ready.
--
-- Deliberately not checked (ADR-0010, owner decision 2026-10-17): statutory
-- deposit or holding-deposit caps, fee legality, and whether ownership
-- evidence is sufficient. Amounts are stored as entered within sanity bounds.

CREATE TYPE "instruction_journey_stage" AS ENUM (
  'onboarding', 'ready_to_market', 'withdrawn'
);
CREATE TYPE "rent_period" AS ENUM ('month', 'week');
CREATE TYPE "fee_frequency" AS ENUM ('one_off', 'weekly', 'monthly');
-- Instruction terms also allow "No VAT" for agencies that are not registered.
-- The appraisal's two-value vat_treatment type is left unchanged.
CREATE TYPE "fee_vat_treatment" AS ENUM ('inclusive', 'exclusive', 'none');
CREATE TYPE "deposit_offering" AS ENUM ('standard', 'replacement', 'both');
CREATE TYPE "instruction_agreement_status" AS ENUM (
  'prepared', 'sent', 'signed'
);
CREATE TYPE "instruction_ownership_check_status" AS ENUM (
  'in_progress', 'verified', 'not_verified'
);
CREATE TYPE "instruction_exception_kind" AS ENUM (
  'agreement', 'ownership_check'
);

-- Helpers. They run as the caller, so they only ever see the caller's own
-- workspace, and pin the search path so temporary tables cannot stand in for
-- real ones.

-- Today's date in the UK.
CREATE FUNCTION "public"."uk_today"()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT (transaction_timestamp() AT TIME ZONE 'Europe/London')::date
$$;

-- True when the verified context's branch scope includes the branch.
CREATE FUNCTION "public"."instruction_branch_in_scope"("branch" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT current_setting('app.membership_scope_mode', true) = 'workspace'
    OR "branch" = ANY(
      COALESCE(
        NULLIF(current_setting('app.allowed_branch_ids', true), '')::uuid[],
        ARRAY[]::uuid[]
      )
    )
$$;

-- True when a member of the current workspace is active, holds one of the
-- roles, and (if a branch is given) can see that branch.
CREATE FUNCTION "public"."instruction_member_has_role"(
  "member" uuid,
  "branch" uuid,
  "roles" "membership_role_code"[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "memberships" AS m
    WHERE m."id" = "member"
      AND m."workspace_id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND m."status" = 'active'
      AND EXISTS (
        SELECT 1 FROM "membership_roles" AS r
        WHERE r."workspace_id" = m."workspace_id"
          AND r."membership_id" = m."id"
          AND r."role_code" = ANY("roles")
      )
      AND (
        "branch" IS NULL
        OR m."scope_mode" = 'workspace'
        OR EXISTS (
          SELECT 1 FROM "membership_branch_access" AS b
          WHERE b."workspace_id" = m."workspace_id"
            AND b."membership_id" = m."id"
            AND b."branch_id" = "branch"
        )
      )
  )
$$;

-- Ordinary instruction work: Account Owner, Agency Admin, Branch Manager,
-- Negotiator and Property Manager (not Accounts or Read Only).
CREATE FUNCTION "public"."instruction_member_can_work"(
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
      'workspace_owner', 'agency_admin', 'branch_manager',
      'negotiator', 'property_manager'
    ]::"membership_role_code"[]
  )
$$;

-- Agreement and ownership-check exceptions: Branch Manager or higher.
CREATE FUNCTION "public"."instruction_member_can_approve"(
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

CREATE TABLE "instructions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "reference" varchar(20) NOT NULL,
  "property_id" uuid NOT NULL,
  "enquiry_id" uuid NOT NULL,
  "appraisal_id" uuid,
  "responsible_branch_id" uuid NOT NULL,
  "lead_membership_id" uuid,
  "instructed_on" date NOT NULL,
  "journey_stage" "instruction_journey_stage" NOT NULL DEFAULT 'onboarding',
  -- Set by the database whenever the journey stage changes.
  "journey_changed_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_on" date,
  "ended_reason" varchar(500),
  -- Set by the database when the instruction is ended.
  "ended_at" timestamptz(6),
  "ended_by_membership_id" uuid,
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL,
  CONSTRAINT "instructions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instructions_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instructions_workspace_id_reference_key"
    UNIQUE ("workspace_id", "reference"),
  -- A landlord lead hands over to one instruction.
  CONSTRAINT "instructions_workspace_id_enquiry_id_key"
    UNIQUE ("workspace_id", "enquiry_id"),
  CONSTRAINT "instructions_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instructions_property_fkey"
    FOREIGN KEY ("workspace_id", "property_id")
    REFERENCES "properties"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instructions_enquiry_fkey"
    FOREIGN KEY ("workspace_id", "enquiry_id")
    REFERENCES "landlord_enquiries"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- The appraisal, when given, belongs to the same lead.
  CONSTRAINT "instructions_appraisal_fkey"
    FOREIGN KEY ("workspace_id", "enquiry_id", "appraisal_id")
    REFERENCES "appraisals"("workspace_id", "enquiry_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instructions_branch_fkey"
    FOREIGN KEY ("workspace_id", "responsible_branch_id")
    REFERENCES "branches"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instructions_lead_membership_fkey"
    FOREIGN KEY ("workspace_id", "lead_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instructions_ended_by_fkey"
    FOREIGN KEY ("workspace_id", "ended_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instructions_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instructions_reference_check" CHECK (
    "reference" ~ '^INS-[2-9A-HJ-NP-Z]{8}$'
  ),
  CONSTRAINT "instructions_instructed_on_check" CHECK (
    "instructed_on" >= DATE '2000-01-01'
  ),
  CONSTRAINT "instructions_ended_check" CHECK (
    (
      "ended_on" IS NULL
      AND "ended_reason" IS NULL
      AND "ended_at" IS NULL
      AND "ended_by_membership_id" IS NULL
    ) OR (
      "ended_on" IS NOT NULL
      AND "ended_on" >= "instructed_on"
      AND char_length(btrim("ended_reason")) BETWEEN 1 AND 500
      AND "ended_at" IS NOT NULL
      AND "ended_by_membership_id" IS NOT NULL
    )
  ),
  -- In this slice an instruction is withdrawn exactly when it is ended.
  CONSTRAINT "instructions_withdrawn_check" CHECK (
    ("journey_stage" = 'withdrawn') = ("ended_on" IS NOT NULL)
  )
);
-- One current instruction per property.
CREATE UNIQUE INDEX "instructions_one_current_per_property"
ON "instructions"("workspace_id", "property_id")
WHERE "ended_on" IS NULL;
CREATE INDEX "instructions_property_idx"
ON "instructions"("workspace_id", "property_id", "instructed_on");
CREATE INDEX "instructions_branch_idx"
ON "instructions"("workspace_id", "responsible_branch_id", "journey_stage");
CREATE INDEX "instructions_appraisal_idx"
ON "instructions"("workspace_id", "enquiry_id", "appraisal_id");
CREATE INDEX "instructions_lead_membership_idx"
ON "instructions"("workspace_id", "lead_membership_id");
CREATE INDEX "instructions_ended_by_idx"
ON "instructions"("workspace_id", "ended_by_membership_id");
CREATE INDEX "instructions_creator_idx"
ON "instructions"("workspace_id", "created_by_membership_id");

CREATE TABLE "instruction_journey_history" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "instruction_id" uuid NOT NULL,
  "from_stage" "instruction_journey_stage" NOT NULL,
  "to_stage" "instruction_journey_stage" NOT NULL,
  "reason" varchar(500),
  "changed_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_journey_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_journey_history_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instruction_journey_history_one_per_transaction"
    UNIQUE ("workspace_id", "instruction_id", "created_at"),
  CONSTRAINT "instruction_journey_history_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_journey_history_actor_fkey"
    FOREIGN KEY ("workspace_id", "changed_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_journey_history_change_check" CHECK (
    "from_stage" <> "to_stage" AND "from_stage" <> 'withdrawn'
  ),
  -- Only marking ready goes without a reason; moving back and withdrawing
  -- always need one.
  CONSTRAINT "instruction_journey_history_reason_check" CHECK (
    ("reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 500)
    AND (
      "reason" IS NOT NULL
      OR ("from_stage" = 'onboarding' AND "to_stage" = 'ready_to_market')
    )
  )
);
CREATE INDEX "instruction_journey_history_actor_idx"
ON "instruction_journey_history"("workspace_id", "changed_by_membership_id");

CREATE TABLE "instruction_parties" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "instruction_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "is_main_contact" boolean NOT NULL DEFAULT false,
  "added_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Set by the database when the party is removed.
  "removed_at" timestamptz(6),
  "removed_by_membership_id" uuid,
  "removed_reason" varchar(500),
  "updated_at" timestamptz(6) NOT NULL,
  CONSTRAINT "instruction_parties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_parties_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instruction_parties_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_parties_contact_fkey"
    FOREIGN KEY ("workspace_id", "contact_id")
    REFERENCES "contacts"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_parties_added_by_fkey"
    FOREIGN KEY ("workspace_id", "added_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_parties_removed_by_fkey"
    FOREIGN KEY ("workspace_id", "removed_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_parties_removed_check" CHECK (
    (
      "removed_at" IS NULL
      AND "removed_by_membership_id" IS NULL
      AND "removed_reason" IS NULL
    ) OR (
      "removed_at" IS NOT NULL
      AND "removed_by_membership_id" IS NOT NULL
      AND char_length(btrim("removed_reason")) BETWEEN 1 AND 500
      AND NOT "is_main_contact"
    )
  )
);
CREATE UNIQUE INDEX "instruction_parties_one_current_per_contact"
ON "instruction_parties"("workspace_id", "instruction_id", "contact_id")
WHERE "removed_at" IS NULL;
CREATE UNIQUE INDEX "instruction_parties_one_main_contact"
ON "instruction_parties"("workspace_id", "instruction_id")
WHERE "is_main_contact" AND "removed_at" IS NULL;
CREATE INDEX "instruction_parties_contact_idx"
ON "instruction_parties"("workspace_id", "contact_id", "removed_at");
CREATE INDEX "instruction_parties_added_by_idx"
ON "instruction_parties"("workspace_id", "added_by_membership_id");
CREATE INDEX "instruction_parties_removed_by_idx"
ON "instruction_parties"("workspace_id", "removed_by_membership_id");

CREATE TABLE "instruction_terms_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "instruction_id" uuid NOT NULL,
  "service" "letting_service_type" NOT NULL,
  "asking_rent_pence" integer,
  "rent_period" "rent_period",
  "fee_kind" "fee_kind",
  -- Basis points for a percentage fee (1250 = 12.5%); pence for a fixed fee.
  "fee_value" integer,
  "fee_frequency" "fee_frequency",
  "fee_vat" "fee_vat_treatment",
  "deposit_offering" "deposit_offering",
  "deposit_pence" integer,
  "holding_deposit_pence" integer,
  -- Required for every version after the first.
  "change_reason" varchar(500),
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_terms_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_terms_versions_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instruction_terms_versions_one_per_transaction"
    UNIQUE ("workspace_id", "instruction_id", "created_at"),
  CONSTRAINT "instruction_terms_versions_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_terms_versions_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_terms_versions_rent_check" CHECK (
    ("asking_rent_pence" IS NULL AND "rent_period" IS NULL)
    OR (
      "asking_rent_pence" BETWEEN 1 AND 10000000
      AND "rent_period" IS NOT NULL
    )
  ),
  CONSTRAINT "instruction_terms_versions_fee_check" CHECK (
    (
      "fee_kind" IS NULL
      AND "fee_value" IS NULL
      AND "fee_frequency" IS NULL
      AND "fee_vat" IS NULL
    ) OR (
      "fee_kind" = 'percentage'
      AND "fee_value" BETWEEN 1 AND 10000
      AND "fee_frequency" IS NULL
      AND "fee_vat" IS NOT NULL
    ) OR (
      "fee_kind" = 'fixed'
      AND "fee_value" BETWEEN 1 AND 10000000
      AND "fee_frequency" IS NOT NULL
      AND "fee_vat" IS NOT NULL
    )
  ),
  -- A deposit amount belongs to a standard deposit offering.
  CONSTRAINT "instruction_terms_versions_deposit_check" CHECK (
    "deposit_pence" IS NULL
    OR (
      "deposit_offering" IN ('standard', 'both')
      AND "deposit_pence" BETWEEN 1 AND 10000000
    )
  ),
  CONSTRAINT "instruction_terms_versions_holding_deposit_check" CHECK (
    "holding_deposit_pence" IS NULL
    OR "holding_deposit_pence" BETWEEN 1 AND 10000000
  ),
  CONSTRAINT "instruction_terms_versions_reason_check" CHECK (
    "change_reason" IS NULL
    OR char_length(btrim("change_reason")) BETWEEN 1 AND 500
  )
);
CREATE INDEX "instruction_terms_versions_created_by_idx"
ON "instruction_terms_versions"("workspace_id", "created_by_membership_id");

CREATE TABLE "instruction_terms_charges" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "terms_version_id" uuid NOT NULL,
  "name" varchar(80) NOT NULL,
  "amount_pence" integer NOT NULL,
  "vat" "fee_vat_treatment" NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_terms_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_terms_charges_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instruction_terms_charges_version_fkey"
    FOREIGN KEY ("workspace_id", "terms_version_id")
    REFERENCES "instruction_terms_versions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_terms_charges_name_check" CHECK (
    char_length(btrim("name")) BETWEEN 1 AND 80
  ),
  CONSTRAINT "instruction_terms_charges_amount_check" CHECK (
    "amount_pence" BETWEEN 1 AND 10000000
  )
);
CREATE INDEX "instruction_terms_charges_version_idx"
ON "instruction_terms_charges"("workspace_id", "terms_version_id");

CREATE TABLE "instruction_agreement_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "instruction_id" uuid NOT NULL,
  "to_status" "instruction_agreement_status" NOT NULL,
  "signed_on" date,
  -- Required when correcting (moving back or repeating a status).
  "reason" varchar(500),
  "recorded_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_agreement_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_agreement_events_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instruction_agreement_events_one_per_transaction"
    UNIQUE ("workspace_id", "instruction_id", "created_at"),
  CONSTRAINT "instruction_agreement_events_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreement_events_actor_fkey"
    FOREIGN KEY ("workspace_id", "recorded_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreement_events_signed_check" CHECK (
    ("to_status" = 'signed') = ("signed_on" IS NOT NULL)
    AND ("signed_on" IS NULL OR "signed_on" >= DATE '2000-01-01')
  ),
  CONSTRAINT "instruction_agreement_events_reason_check" CHECK (
    "reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 500
  )
);
CREATE INDEX "instruction_agreement_events_actor_idx"
ON "instruction_agreement_events"("workspace_id", "recorded_by_membership_id");

CREATE TABLE "instruction_ownership_checks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "instruction_id" uuid NOT NULL,
  "status" "instruction_ownership_check_status" NOT NULL,
  "checked_on" date,
  "method" varchar(200),
  "notes" varchar(2000),
  -- Required for Not verified, and when correcting an earlier result.
  "reason" varchar(500),
  "recorded_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_ownership_checks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_ownership_checks_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instruction_ownership_checks_one_per_transaction"
    UNIQUE ("workspace_id", "instruction_id", "created_at"),
  CONSTRAINT "instruction_ownership_checks_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_ownership_checks_actor_fkey"
    FOREIGN KEY ("workspace_id", "recorded_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- A result records when and how the check was done.
  CONSTRAINT "instruction_ownership_checks_result_check" CHECK (
    "status" = 'in_progress'
    OR ("checked_on" IS NOT NULL AND "method" IS NOT NULL)
  ),
  CONSTRAINT "instruction_ownership_checks_text_check" CHECK (
    ("checked_on" IS NULL OR "checked_on" >= DATE '2000-01-01')
    AND ("method" IS NULL OR char_length(btrim("method")) BETWEEN 1 AND 200)
    AND ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 1 AND 2000)
    AND ("reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 500)
    AND ("status" <> 'not_verified' OR "reason" IS NOT NULL)
  )
);
CREATE INDEX "instruction_ownership_checks_actor_idx"
ON "instruction_ownership_checks"("workspace_id", "recorded_by_membership_id");

-- Permanent in this slice (owner decision 2026-10-17).
CREATE TABLE "instruction_exceptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "instruction_id" uuid NOT NULL,
  "kind" "instruction_exception_kind" NOT NULL,
  "reason" varchar(500) NOT NULL,
  "approved_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_exceptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_exceptions_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instruction_exceptions_one_per_kind"
    UNIQUE ("workspace_id", "instruction_id", "kind"),
  CONSTRAINT "instruction_exceptions_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_exceptions_actor_fkey"
    FOREIGN KEY ("workspace_id", "approved_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_exceptions_reason_check" CHECK (
    char_length(btrim("reason")) BETWEEN 1 AND 500
  )
);
CREATE INDEX "instruction_exceptions_actor_idx"
ON "instruction_exceptions"("workspace_id", "approved_by_membership_id");

-- Counts of current instructions, so a property or landlord on one cannot be
-- archived even by someone who cannot see the instruction's branch. Kept by
-- the owner-run count triggers below, as for ownerships and open leads.
ALTER TABLE "properties"
ADD COLUMN "current_instruction_count" integer NOT NULL DEFAULT 0,
ADD CONSTRAINT "properties_instruction_count_check" CHECK (
  "current_instruction_count" >= 0
  AND ("status" = 'active' OR "current_instruction_count" = 0)
);

ALTER TABLE "contacts"
ADD COLUMN "current_instruction_party_count" integer NOT NULL DEFAULT 0,
ADD CONSTRAINT "contacts_instruction_party_count_check" CHECK (
  "current_instruction_party_count" >= 0
  AND ("status" = 'active' OR "current_instruction_party_count" = 0)
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
  "current_instruction_party_count"
ON "contacts"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_contact_ownership_count"();

CREATE OR REPLACE FUNCTION "public"."protect_property_enquiry_count"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (
    NEW."current_open_enquiry_count" <> 0
    OR NEW."current_instruction_count" <> 0
  ) THEN
    RAISE EXCEPTION 'a new property cannot start with linked records'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE'
    AND (
      NEW."current_open_enquiry_count" <> OLD."current_open_enquiry_count"
      OR NEW."current_instruction_count" <> OLD."current_instruction_count"
    )
    AND NOT "public"."is_link_count_maintainer"()
  THEN
    RAISE EXCEPTION 'linked record counts are maintained by the database'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER "properties_protect_enquiry_count" ON "properties";
CREATE TRIGGER "properties_protect_enquiry_count"
BEFORE INSERT OR UPDATE OF
  "current_open_enquiry_count", "current_instruction_count"
ON "properties"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_property_enquiry_count"();

-- A property with a current instruction keeps its branch: the instruction's
-- branch is fixed, so the two cannot drift apart. A joined transfer is later
-- work.
CREATE OR REPLACE FUNCTION "public"."enforce_property_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."reference" <> OLD."reference"
    OR NEW."created_by_membership_id" <> OLD."created_by_membership_id"
    OR NEW."created_at" <> OLD."created_at"
  THEN
    RAISE EXCEPTION 'immutable property fields cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."responsible_branch_id" <> OLD."responsible_branch_id" THEN
    IF OLD."current_instruction_count" > 0 THEN
      RAISE EXCEPTION 'a property with a current instruction cannot change branch'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "property_branch_transfers"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "property_id" = NEW."id"
        AND "from_branch_id" = OLD."responsible_branch_id"
        AND "to_branch_id" = NEW."responsible_branch_id"
        AND "transferred_by_membership_id" =
          NULLIF(current_setting('app.membership_id', true), '')::uuid
        AND "created_at" = transaction_timestamp()
    ) THEN
      RAISE EXCEPTION 'property branch changes require a transfer record'
        USING ERRCODE = '23514';
    END IF;
    NEW."branch_changed_at" := transaction_timestamp();
  ELSE
    NEW."branch_changed_at" := OLD."branch_changed_at";
  END IF;

  RETURN NEW;
END;
$$;

-- Keeps the property and landlord counts. Runs as its owner so the counts
-- stay right when the linked records are in a branch the user cannot update;
-- it stays inside the user's workspace, touches only the linked rows, and
-- changes only the counts (the pattern of maintain_enquiry_link_counts).
CREATE FUNCTION "public"."maintain_instruction_counts"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  saved_scope text := current_setting('app.membership_scope_mode', true);
  updated_rows integer;
  instruction_ended boolean;
BEGIN
  PERFORM set_config('app.membership_scope_mode', 'workspace', true);

  IF TG_TABLE_NAME = 'instructions' THEN
    IF TG_OP = 'INSERT' THEN
      -- Re-checked on the latest row, so a branch transfer or archive that
      -- committed meanwhile refuses the instruction instead of leaving the
      -- two records in different branches.
      UPDATE "properties"
      SET "current_instruction_count" = "current_instruction_count" + 1
      WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."property_id"
        AND "responsible_branch_id" = NEW."responsible_branch_id"
        AND "status" = 'active';
      GET DIAGNOSTICS updated_rows = ROW_COUNT;
      IF updated_rows <> 1 THEN
        RAISE EXCEPTION 'instruction property count could not be updated'
          USING ERRCODE = '42501';
      END IF;
    ELSIF OLD."ended_on" IS NULL AND NEW."ended_on" IS NOT NULL THEN
      UPDATE "properties"
      SET "current_instruction_count" = "current_instruction_count" - 1
      WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."property_id";
      GET DIAGNOSTICS updated_rows = ROW_COUNT;
      IF updated_rows <> 1 THEN
        RAISE EXCEPTION 'instruction property count could not be updated'
          USING ERRCODE = '42501';
      END IF;
      -- Its landlords are no longer on a current instruction.
      UPDATE "contacts" AS c
      SET "current_instruction_party_count" =
        c."current_instruction_party_count" - p."parties"
      FROM (
        SELECT "contact_id", count(*)::integer AS "parties"
        FROM "instruction_parties"
        WHERE "workspace_id" = NEW."workspace_id"
          AND "instruction_id" = NEW."id"
          AND "removed_at" IS NULL
        GROUP BY "contact_id"
      ) AS p
      WHERE c."workspace_id" = NEW."workspace_id" AND c."id" = p."contact_id";
    END IF;
  ELSE
    SELECT "ended_on" IS NOT NULL INTO instruction_ended
    FROM "instructions"
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."instruction_id";
    IF NOT instruction_ended AND (
      TG_OP = 'INSERT'
      OR (OLD."removed_at" IS NULL AND NEW."removed_at" IS NOT NULL)
    ) THEN
      UPDATE "contacts"
      SET "current_instruction_party_count" =
        "current_instruction_party_count"
        + (CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END)
      WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."contact_id";
      GET DIAGNOSTICS updated_rows = ROW_COUNT;
      IF updated_rows <> 1 THEN
        RAISE EXCEPTION 'instruction landlord count could not be updated'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  PERFORM set_config(
    'app.membership_scope_mode', COALESCE(saved_scope, ''), true
  );
  RETURN NEW;
END;
$$;

-- New instructions: in the property's branch, from a completed-appraisal
-- (or just won) lead for the same property, starting at Onboarding.
CREATE FUNCTION "public"."prepare_instruction"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."journey_stage" <> 'onboarding' OR NEW."ended_on" IS NOT NULL THEN
    RAISE EXCEPTION 'a new instruction starts at onboarding'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."instructed_on" > "public"."uk_today"() THEN
    RAISE EXCEPTION 'the instruction date cannot be in the future'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "properties"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."property_id"
      AND "status" = 'active'
      AND "responsible_branch_id" = NEW."responsible_branch_id"
  ) THEN
    RAISE EXCEPTION 'instruction property must be an active property in its branch'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "landlord_enquiries"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."enquiry_id"
      AND "property_id" = NEW."property_id"
      AND "stage" IN ('appraisal_completed', 'won')
  ) THEN
    RAISE EXCEPTION 'instruction lead must have a completed appraisal for this property'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."appraisal_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "appraisals"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "enquiry_id" = NEW."enquiry_id"
      AND "id" = NEW."appraisal_id"
      AND "status" = 'completed'
  ) THEN
    RAISE EXCEPTION 'instruction appraisal must be completed'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."lead_membership_id" IS NOT NULL
    AND NOT "public"."instruction_member_can_work"(
      NEW."lead_membership_id", NEW."responsible_branch_id"
    )
  THEN
    RAISE EXCEPTION 'the lead staff member cannot work on this instruction'
      USING ERRCODE = '23514';
  END IF;
  NEW."journey_changed_at" := transaction_timestamp();
  NEW."created_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instructions_prepare"
BEFORE INSERT ON "instructions"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction"();

-- Identity, property, lead, branch and instruction date are fixed; an ended
-- instruction cannot change; ending and journey times come from the
-- database; a journey change needs a history row by the same actor in the
-- same transaction.
CREATE FUNCTION "public"."enforce_instruction_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."reference" <> OLD."reference"
    OR NEW."property_id" <> OLD."property_id"
    OR NEW."enquiry_id" <> OLD."enquiry_id"
    OR NEW."appraisal_id" IS DISTINCT FROM OLD."appraisal_id"
    OR NEW."responsible_branch_id" <> OLD."responsible_branch_id"
    OR NEW."instructed_on" <> OLD."instructed_on"
    OR NEW."created_by_membership_id" <> OLD."created_by_membership_id"
    OR NEW."created_at" <> OLD."created_at"
  THEN
    RAISE EXCEPTION 'instruction identity cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."ended_on" IS NOT NULL THEN
    RAISE EXCEPTION 'an ended instruction cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."lead_membership_id" IS DISTINCT FROM OLD."lead_membership_id"
    AND NEW."lead_membership_id" IS NOT NULL
    AND NOT "public"."instruction_member_can_work"(
      NEW."lead_membership_id", NEW."responsible_branch_id"
    )
  THEN
    RAISE EXCEPTION 'the lead staff member cannot work on this instruction'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."ended_on" IS NOT NULL THEN
    IF NEW."ended_on" > "public"."uk_today"() THEN
      RAISE EXCEPTION 'the ended date cannot be in the future'
        USING ERRCODE = '23514';
    END IF;
    NEW."ended_at" := transaction_timestamp();
    NEW."ended_by_membership_id" :=
      NULLIF(current_setting('app.membership_id', true), '')::uuid;
  ELSE
    NEW."ended_at" := NULL;
    NEW."ended_by_membership_id" := NULL;
  END IF;

  IF NEW."journey_stage" <> OLD."journey_stage" THEN
    IF NOT EXISTS (
      SELECT 1 FROM "instruction_journey_history"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "instruction_id" = NEW."id"
        AND "from_stage" = OLD."journey_stage"
        AND "to_stage" = NEW."journey_stage"
        AND "changed_by_membership_id" =
          NULLIF(current_setting('app.membership_id', true), '')::uuid
        AND "created_at" = transaction_timestamp()
        -- Withdrawal records the same reason as the ending.
        AND (NEW."ended_on" IS NULL OR "reason" = NEW."ended_reason")
    ) THEN
      RAISE EXCEPTION 'instruction journey changes require a history record'
        USING ERRCODE = '23514';
    END IF;
    NEW."journey_changed_at" := transaction_timestamp();
  ELSE
    NEW."journey_changed_at" := OLD."journey_changed_at";
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "instructions_enforce_rules"
BEFORE UPDATE ON "instructions"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_instruction_rules"();

-- Not "UPDATE OF": the database itself sets some of these columns, and a
-- column list only sees what the statement named.
CREATE TRIGGER "instructions_maintain_counts"
AFTER INSERT OR UPDATE ON "instructions"
FOR EACH ROW EXECUTE FUNCTION "public"."maintain_instruction_counts"();

-- Every history row: its instruction is visible and still current, and its
-- time comes from the database. Its triggers are named *_check_instruction
-- so they run before each table's other checks (PostgreSQL runs triggers in
-- name order) and an unseen instruction is always refused as access denied.
CREATE FUNCTION "public"."prepare_instruction_record"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  row_ended date;
BEGIN
  -- FOR SHARE waits for any ending in progress, so nothing can be added to
  -- an instruction that another transaction is ending.
  SELECT "ended_on" INTO row_ended
  FROM "instructions"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."instruction_id"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'instruction records must belong to a visible instruction'
      USING ERRCODE = '42501';
  END IF;
  IF row_ended IS NOT NULL THEN
    RAISE EXCEPTION 'an ended instruction cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  NEW."created_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_journey_history_check_instruction"
BEFORE INSERT ON "instruction_journey_history"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_record"();
CREATE TRIGGER "instruction_exceptions_check_instruction"
BEFORE INSERT ON "instruction_exceptions"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_record"();

-- A journey record is kept only if the instruction really changed, so the
-- history cannot contain changes that never happened.
CREATE FUNCTION "public"."enforce_instruction_journey_applied"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "instructions"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."instruction_id"
      AND "journey_stage" = NEW."to_stage"
      AND "journey_changed_at" = NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'an instruction journey record must match the instruction'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "instruction_journey_history_require_change"
AFTER INSERT ON "instruction_journey_history"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_instruction_journey_applied"();

-- Landlords: an active contact the actor can see; removal is the only
-- change besides switching the main contact, and both stop when the
-- instruction ends.
CREATE FUNCTION "public"."prepare_instruction_party"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."removed_at" IS NOT NULL
    OR NEW."removed_by_membership_id" IS NOT NULL
    OR NEW."removed_reason" IS NOT NULL
  THEN
    RAISE EXCEPTION 'a new instruction landlord cannot start removed'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "contacts"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."contact_id"
      AND "status" = 'active'
  ) THEN
    RAISE EXCEPTION 'instruction landlord must be an active contact you can see'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_parties_check_instruction"
BEFORE INSERT ON "instruction_parties"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_record"();
CREATE TRIGGER "instruction_parties_prepare"
BEFORE INSERT ON "instruction_parties"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_party"();

CREATE FUNCTION "public"."enforce_instruction_party_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."instruction_id" <> OLD."instruction_id"
    OR NEW."contact_id" <> OLD."contact_id"
    OR NEW."added_by_membership_id" <> OLD."added_by_membership_id"
    OR NEW."created_at" <> OLD."created_at"
  THEN
    RAISE EXCEPTION 'instruction landlord identity cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."removed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a removed instruction landlord cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  -- FOR SHARE: a removal and an ending of the same instruction run one after
  -- the other, so a landlord is never subtracted twice.
  IF NOT EXISTS (
    SELECT 1 FROM "instructions"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."instruction_id"
      AND "ended_on" IS NULL
    FOR SHARE
  ) THEN
    RAISE EXCEPTION 'an ended instruction cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."removed_reason" IS NOT NULL THEN
    NEW."removed_at" := transaction_timestamp();
    NEW."removed_by_membership_id" :=
      NULLIF(current_setting('app.membership_id', true), '')::uuid;
  ELSE
    NEW."removed_at" := NULL;
    NEW."removed_by_membership_id" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_parties_enforce_rules"
BEFORE UPDATE ON "instruction_parties"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_instruction_party_rules"();

CREATE TRIGGER "instruction_parties_maintain_counts"
AFTER INSERT OR UPDATE ON "instruction_parties"
FOR EACH ROW EXECUTE FUNCTION "public"."maintain_instruction_counts"();

-- Terms: the first version has no reason; every later one needs one.
CREATE FUNCTION "public"."prepare_instruction_terms"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  has_earlier boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "instruction_terms_versions"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "instruction_id" = NEW."instruction_id"
  ) INTO has_earlier;
  IF has_earlier AND NEW."change_reason" IS NULL THEN
    RAISE EXCEPTION 'changed terms need a reason'
      USING ERRCODE = '23514';
  END IF;
  IF NOT has_earlier AND NEW."change_reason" IS NOT NULL THEN
    RAISE EXCEPTION 'the first terms version has no change reason'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_terms_versions_check_instruction"
BEFORE INSERT ON "instruction_terms_versions"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_record"();
CREATE TRIGGER "instruction_terms_versions_prepare"
BEFORE INSERT ON "instruction_terms_versions"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_terms"();

-- Charges belong to a version saved in the same transaction, so an earlier
-- version can never gain charges, and a version holds at most 20.
CREATE FUNCTION "public"."prepare_instruction_terms_charge"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "instruction_terms_versions"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."terms_version_id"
      AND "created_at" = transaction_timestamp()
  ) THEN
    RAISE EXCEPTION 'charges can only be added with their terms version'
      USING ERRCODE = '23514';
  END IF;
  IF (
    SELECT count(*) FROM "instruction_terms_charges"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "terms_version_id" = NEW."terms_version_id"
  ) >= 20 THEN
    RAISE EXCEPTION 'a terms version has at most 20 charges'
      USING ERRCODE = '23514';
  END IF;
  NEW."created_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_terms_charges_prepare"
BEFORE INSERT ON "instruction_terms_charges"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_terms_charge"();

-- Agreement: a signing date is not in the future; moving back or repeating a
-- status is a correction and needs a reason.
CREATE FUNCTION "public"."prepare_instruction_agreement_event"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  latest "instruction_agreement_status";
BEGIN
  IF NEW."signed_on" > "public"."uk_today"() THEN
    RAISE EXCEPTION 'the signing date cannot be in the future'
      USING ERRCODE = '23514';
  END IF;
  SELECT "to_status" INTO latest
  FROM "instruction_agreement_events"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "instruction_id" = NEW."instruction_id"
  ORDER BY "created_at" DESC, "id" DESC
  LIMIT 1;
  IF latest IS NOT NULL AND NEW."to_status" <= latest
    AND NEW."reason" IS NULL
  THEN
    RAISE EXCEPTION 'correcting the agreement progress needs a reason'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_agreement_events_check_instruction"
BEFORE INSERT ON "instruction_agreement_events"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_record"();
CREATE TRIGGER "instruction_agreement_events_prepare"
BEFORE INSERT ON "instruction_agreement_events"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_agreement_event"();

-- Ownership check: a check date is not in the future; any entry after a
-- result is a correction and needs a reason.
CREATE FUNCTION "public"."prepare_instruction_ownership_check"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."checked_on" > "public"."uk_today"() THEN
    RAISE EXCEPTION 'the check date cannot be in the future'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."reason" IS NULL AND EXISTS (
    SELECT 1 FROM "instruction_ownership_checks"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "instruction_id" = NEW."instruction_id"
      AND "status" IN ('verified', 'not_verified')
  ) THEN
    RAISE EXCEPTION 'correcting the ownership check needs a reason'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_ownership_checks_check_instruction"
BEFORE INSERT ON "instruction_ownership_checks"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_record"();
CREATE TRIGGER "instruction_ownership_checks_prepare"
BEFORE INSERT ON "instruction_ownership_checks"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_ownership_check"();

-- The Ready to market checklist (owner-approved 2026-10-16): lead staff
-- member; a main landlord contact; current terms with service, asking rent,
-- primary fee and VAT, a deposit offering and a deposit amount where a
-- standard deposit is offered; a signed agreement or a manager exception; a
-- verified ownership check or a manager exception. The instruction date,
-- property and branch are always present.
CREATE FUNCTION "public"."instruction_checklist_complete"(
  "workspace" uuid,
  "instruction" uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "workspace"
      AND i."id" = "instruction"
      AND i."ended_on" IS NULL
      AND i."lead_membership_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "instruction_parties" AS p
        WHERE p."workspace_id" = i."workspace_id"
          AND p."instruction_id" = i."id"
          AND p."removed_at" IS NULL
          AND p."is_main_contact"
      )
      AND EXISTS (
        SELECT 1 FROM (
          SELECT * FROM "instruction_terms_versions" AS t
          WHERE t."workspace_id" = i."workspace_id"
            AND t."instruction_id" = i."id"
          ORDER BY t."created_at" DESC, t."id" DESC
          LIMIT 1
        ) AS current_terms
        WHERE current_terms."asking_rent_pence" IS NOT NULL
          AND current_terms."fee_kind" IS NOT NULL
          AND current_terms."deposit_offering" IS NOT NULL
          AND (
            current_terms."deposit_offering" = 'replacement'
            OR current_terms."deposit_pence" IS NOT NULL
          )
      )
      AND (
        EXISTS (
          SELECT 1 FROM "instruction_exceptions" AS x
          WHERE x."workspace_id" = i."workspace_id"
            AND x."instruction_id" = i."id"
            AND x."kind" = 'agreement'
        )
        OR (
          SELECT a."to_status" FROM "instruction_agreement_events" AS a
          WHERE a."workspace_id" = i."workspace_id"
            AND a."instruction_id" = i."id"
          ORDER BY a."created_at" DESC, a."id" DESC
          LIMIT 1
        ) = 'signed'
      )
      AND (
        EXISTS (
          SELECT 1 FROM "instruction_exceptions" AS x
          WHERE x."workspace_id" = i."workspace_id"
            AND x."instruction_id" = i."id"
            AND x."kind" = 'ownership_check'
        )
        OR (
          SELECT o."status" FROM "instruction_ownership_checks" AS o
          WHERE o."workspace_id" = i."workspace_id"
            AND o."instruction_id" = i."id"
          ORDER BY o."created_at" DESC, o."id" DESC
          LIMIT 1
        ) = 'verified'
      )
  )
$$;

-- Checked at commit for every instruction a transaction touches: a current
-- instruction has a main landlord contact, every instruction has terms, and
-- Ready to market holds only while the checklist is complete. Reads only the
-- instruction's own records, which share its branch.
CREATE FUNCTION "public"."assert_instruction_consistent"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target uuid;
  row_ended date;
  row_stage "instruction_journey_stage";
BEGIN
  IF TG_TABLE_NAME = 'instructions' THEN
    target := NEW."id";
  ELSE
    target := NEW."instruction_id";
  END IF;

  SELECT "ended_on", "journey_stage" INTO row_ended, row_stage
  FROM "instructions"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'instruction records must belong to a visible instruction'
      USING ERRCODE = '42501';
  END IF;

  IF row_ended IS NULL AND NOT EXISTS (
    SELECT 1 FROM "instruction_parties"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "instruction_id" = target
      AND "removed_at" IS NULL
      AND "is_main_contact"
  ) THEN
    RAISE EXCEPTION 'an instruction needs a main landlord contact'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "instruction_terms_versions"
    WHERE "workspace_id" = NEW."workspace_id" AND "instruction_id" = target
  ) THEN
    RAISE EXCEPTION 'an instruction needs its terms'
      USING ERRCODE = '23514';
  END IF;

  IF row_stage = 'ready_to_market'
    AND NOT "public"."instruction_checklist_complete"(NEW."workspace_id", target)
  THEN
    RAISE EXCEPTION 'ready to market needs a complete checklist'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "instructions_assert_consistent"
AFTER INSERT OR UPDATE ON "instructions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_instruction_consistent"();
CREATE CONSTRAINT TRIGGER "instruction_parties_assert_consistent"
AFTER INSERT OR UPDATE ON "instruction_parties"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_instruction_consistent"();
CREATE CONSTRAINT TRIGGER "instruction_terms_versions_assert_consistent"
AFTER INSERT ON "instruction_terms_versions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_instruction_consistent"();
CREATE CONSTRAINT TRIGGER "instruction_agreement_events_assert_consistent"
AFTER INSERT ON "instruction_agreement_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_instruction_consistent"();
CREATE CONSTRAINT TRIGGER "instruction_ownership_checks_assert_consistent"
AFTER INSERT ON "instruction_ownership_checks"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_instruction_consistent"();

-- A lead is Instruction won together with its instruction, never alone.
-- Checked once, when the instruction is created (won is final), so later
-- changes never depend on the lead's branch.
CREATE FUNCTION "public"."assert_instruction_lead_won"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "landlord_enquiries"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."enquiry_id"
      AND "stage" = 'won'
  ) THEN
    RAISE EXCEPTION 'an instruction needs its lead marked as won'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "instructions_require_won_lead"
AFTER INSERT ON "instructions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_instruction_lead_won"();

CREATE FUNCTION "public"."assert_won_enquiry_has_instruction"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "instructions"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "enquiry_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'a lead is won only together with its instruction'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "landlord_enquiries_won_needs_instruction"
AFTER UPDATE OF "stage" ON "landlord_enquiries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."stage" = 'won' AND OLD."stage" <> 'won')
EXECUTE FUNCTION "public"."assert_won_enquiry_has_instruction"();

ALTER TABLE "instructions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instructions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "instruction_journey_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instruction_journey_history" FORCE ROW LEVEL SECURITY;
ALTER TABLE "instruction_parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instruction_parties" FORCE ROW LEVEL SECURITY;
ALTER TABLE "instruction_terms_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instruction_terms_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "instruction_terms_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instruction_terms_charges" FORCE ROW LEVEL SECURITY;
ALTER TABLE "instruction_agreement_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instruction_agreement_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "instruction_ownership_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instruction_ownership_checks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "instruction_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instruction_exceptions" FORCE ROW LEVEL SECURITY;

-- Every staff role sees instructions in its branch scope.
CREATE POLICY "instruction_select_in_scope" ON "instructions"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."instruction_branch_in_scope"("responsible_branch_id")
);

CREATE POLICY "instruction_insert_in_scope" ON "instructions"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND "journey_stage" = 'onboarding'
  AND "ended_on" IS NULL
  AND "public"."instruction_branch_in_scope"("responsible_branch_id")
  AND "public"."instruction_member_can_work"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid,
    "responsible_branch_id"
  )
);

CREATE POLICY "instruction_update_in_scope" ON "instructions"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."instruction_branch_in_scope"("responsible_branch_id")
  AND "public"."instruction_member_can_work"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid,
    "responsible_branch_id"
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."instruction_branch_in_scope"("responsible_branch_id")
);

-- Records of an instruction are visible with it, and written only by
-- someone who can work on it, as themselves.
CREATE POLICY "instruction_journey_history_select_in_scope"
ON "instruction_journey_history"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_journey_history"."workspace_id"
      AND i."id" = "instruction_journey_history"."instruction_id"
  )
);
CREATE POLICY "instruction_journey_history_insert_in_scope"
ON "instruction_journey_history"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "changed_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_journey_history"."workspace_id"
      AND i."id" = "instruction_journey_history"."instruction_id"
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);

CREATE POLICY "instruction_party_select_in_scope" ON "instruction_parties"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_parties"."workspace_id"
      AND i."id" = "instruction_parties"."instruction_id"
  )
);
CREATE POLICY "instruction_party_insert_in_scope" ON "instruction_parties"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "added_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_parties"."workspace_id"
      AND i."id" = "instruction_parties"."instruction_id"
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);
CREATE POLICY "instruction_party_update_in_scope" ON "instruction_parties"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_parties"."workspace_id"
      AND i."id" = "instruction_parties"."instruction_id"
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

CREATE POLICY "instruction_terms_select_in_scope"
ON "instruction_terms_versions"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_terms_versions"."workspace_id"
      AND i."id" = "instruction_terms_versions"."instruction_id"
  )
);
CREATE POLICY "instruction_terms_insert_in_scope"
ON "instruction_terms_versions"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_terms_versions"."workspace_id"
      AND i."id" = "instruction_terms_versions"."instruction_id"
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);

CREATE POLICY "instruction_charge_select_in_scope"
ON "instruction_terms_charges"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instruction_terms_versions" AS t
    WHERE t."workspace_id" = "instruction_terms_charges"."workspace_id"
      AND t."id" = "instruction_terms_charges"."terms_version_id"
  )
);
CREATE POLICY "instruction_charge_insert_in_scope"
ON "instruction_terms_charges"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "instruction_terms_versions" AS t
    JOIN "instructions" AS i
      ON i."workspace_id" = t."workspace_id" AND i."id" = t."instruction_id"
    WHERE t."workspace_id" = "instruction_terms_charges"."workspace_id"
      AND t."id" = "instruction_terms_charges"."terms_version_id"
      AND t."created_by_membership_id" =
        NULLIF(current_setting('app.membership_id', true), '')::uuid
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);

CREATE POLICY "instruction_agreement_select_in_scope"
ON "instruction_agreement_events"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_agreement_events"."workspace_id"
      AND i."id" = "instruction_agreement_events"."instruction_id"
  )
);
CREATE POLICY "instruction_agreement_insert_in_scope"
ON "instruction_agreement_events"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "recorded_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_agreement_events"."workspace_id"
      AND i."id" = "instruction_agreement_events"."instruction_id"
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);

CREATE POLICY "instruction_ownership_select_in_scope"
ON "instruction_ownership_checks"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_ownership_checks"."workspace_id"
      AND i."id" = "instruction_ownership_checks"."instruction_id"
  )
);
CREATE POLICY "instruction_ownership_insert_in_scope"
ON "instruction_ownership_checks"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "recorded_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_ownership_checks"."workspace_id"
      AND i."id" = "instruction_ownership_checks"."instruction_id"
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);

CREATE POLICY "instruction_exception_select_in_scope"
ON "instruction_exceptions"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_exceptions"."workspace_id"
      AND i."id" = "instruction_exceptions"."instruction_id"
  )
);
-- Only Branch Manager or higher, in the instruction's branch.
CREATE POLICY "instruction_exception_insert_in_scope"
ON "instruction_exceptions"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "approved_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_exceptions"."workspace_id"
      AND i."id" = "instruction_exceptions"."instruction_id"
      AND "public"."instruction_member_can_approve"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);

-- The app may add records and make the allowed changes; history is never
-- edited, and nothing is ever deleted.
GRANT SELECT, INSERT, UPDATE ON TABLE
  "instructions",
  "instruction_parties"
TO "zayto_app";
GRANT SELECT, INSERT ON TABLE
  "instruction_journey_history",
  "instruction_terms_versions",
  "instruction_terms_charges",
  "instruction_agreement_events",
  "instruction_ownership_checks",
  "instruction_exceptions"
TO "zayto_app";
REVOKE DELETE, TRUNCATE ON TABLE
  "instructions",
  "instruction_parties"
FROM "zayto_app";
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE
  "instruction_journey_history",
  "instruction_terms_versions",
  "instruction_terms_charges",
  "instruction_agreement_events",
  "instruction_ownership_checks",
  "instruction_exceptions"
FROM "zayto_app";
