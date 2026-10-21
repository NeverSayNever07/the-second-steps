-- M2: listings core. Owner-approved design (2026-10-21) in
-- .cursor/plans/marketing-m0-design.md and ADR-034.
--
-- A listing is an advert prepared inside Zayto from a Ready to market
-- instruction. Nothing here publishes anything: Ready to advertise is an
-- internal state. One current (not withdrawn) listing per instruction.
--
-- The listing's content is a series of immutable versions; the highest
-- version number is current. The advertised rent and deposit are copied by
-- the database from the instruction's latest terms when a version is saved,
-- so the app can never supply a different rent. Every state change is backed
-- by an event written in the same transaction (the instruction journey's
-- pattern), and the database itself enforces the hard rules: legal moves
-- only, the reviewed version stays current, the EPC position at Ready to
-- advertise, and (until listing media exists, in M5) that Ready to advertise
-- cannot be reached at all.
--
-- Ending an instruction withdraws its current listing, and returning it to
-- Onboarding takes a reviewed listing back to Draft, in the same
-- transaction, by a trigger on instructions, so no caller can forget it.
--
-- The app may only read and add rows, and change a listing's state.

CREATE TYPE "listing_state" AS ENUM (
  'draft', 'content_ready', 'ready_to_advertise', 'withdrawn'
);
CREATE TYPE "listing_event_kind" AS ENUM (
  'created', 'version_saved', 'marked_content_ready',
  'marked_ready_to_advertise', 'returned_to_draft', 'edited_after_review',
  'withdrawn', 'instruction_returned', 'instruction_ended'
);
CREATE TYPE "listing_epc_position" AS ENUM (
  'evidence_reviewed', 'commissioned_awaiting', 'does_not_apply',
  'specialist_review', 'action_required', 'not_assessed', 'evidence_missing',
  'expired'
);

-- Preparing and reviewing listings (owner decision 2026-10-21): Account
-- Owner, Agency Admin, Branch Manager and Negotiator. Two functions so the
-- roles can diverge later without touching every policy.
CREATE FUNCTION "public"."listing_member_can_prepare"(
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

CREATE FUNCTION "public"."listing_member_can_review"(
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

-- The moves a listing may make. Withdrawn is final.
CREATE FUNCTION "public"."listing_transition_allowed"(
  "from_state" "listing_state",
  "to_state" "listing_state"
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT ("from_state", "to_state") IN (
    ('draft'::"listing_state", 'content_ready'::"listing_state"),
    ('draft', 'withdrawn'),
    ('content_ready', 'draft'),
    ('content_ready', 'ready_to_advertise'),
    ('content_ready', 'withdrawn'),
    ('ready_to_advertise', 'draft'),
    ('ready_to_advertise', 'withdrawn')
  )
$$;

CREATE TABLE "listings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "instruction_id" uuid NOT NULL,
  -- Set by the database from the instruction.
  "property_id" uuid NOT NULL,
  "state" "listing_state" NOT NULL DEFAULT 'draft',
  "state_changed_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listings_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "listings_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listings_property_fkey"
    FOREIGN KEY ("workspace_id", "property_id")
    REFERENCES "properties"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listings_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- One current listing per instruction; withdrawn ones stay as history.
CREATE UNIQUE INDEX "listings_one_current_per_instruction"
ON "listings"("workspace_id", "instruction_id")
WHERE "state" <> 'withdrawn';
CREATE INDEX "listings_instruction_idx"
ON "listings"("workspace_id", "instruction_id", "created_at");
CREATE INDEX "listings_property_idx"
ON "listings"("workspace_id", "property_id");
CREATE INDEX "listings_state_idx"
ON "listings"("workspace_id", "state", "state_changed_at" DESC);
CREATE INDEX "listings_created_by_idx"
ON "listings"("workspace_id", "created_by_membership_id");

CREATE TABLE "listing_content_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  -- Set by the database: the next number for the listing.
  "version_no" integer NOT NULL,
  -- Set by the database from the instruction's latest terms.
  "source_terms_version_id" uuid NOT NULL,
  "advertised_rent_pence" integer,
  "rent_period" "rent_period",
  "deposit_offering" "deposit_offering",
  "deposit_pence" integer,
  "holding_deposit_pence" integer,
  -- Written by staff.
  "headline" varchar(120) NOT NULL DEFAULT '',
  "summary" varchar(400) NOT NULL DEFAULT '',
  "description" varchar(4000) NOT NULL DEFAULT '',
  "highlights" varchar(120)[] NOT NULL DEFAULT ARRAY[]::varchar(120)[],
  "available_from" date,
  "availability_note" varchar(300) NOT NULL DEFAULT '',
  "deposit_note" varchar(500) NOT NULL DEFAULT '',
  "material_information" varchar(4000) NOT NULL DEFAULT '',
  "material_information_not_applicable" boolean NOT NULL DEFAULT false,
  -- The reviewed property facts for this advert (an allowlisted copy) and
  -- the facts marked not applicable, such as bedrooms for a room.
  "property_facts" jsonb NOT NULL,
  "not_applicable" varchar(40)[] NOT NULL DEFAULT ARRAY[]::varchar(40)[],
  -- Where each field came from: copied, edited, not supplied, and so on.
  "field_origins" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_content_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_content_versions_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "listing_content_versions_number_key"
    UNIQUE ("workspace_id", "listing_id", "version_no"),
  CONSTRAINT "listing_content_versions_listing_fkey"
    FOREIGN KEY ("workspace_id", "listing_id")
    REFERENCES "listings"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_content_versions_terms_fkey"
    FOREIGN KEY ("workspace_id", "source_terms_version_id")
    REFERENCES "instruction_terms_versions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_content_versions_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_content_versions_number_check" CHECK ("version_no" >= 1),
  CONSTRAINT "listing_content_versions_highlights_check" CHECK (
    cardinality("highlights") <= 8
    AND array_position("highlights", NULL) IS NULL
  ),
  CONSTRAINT "listing_content_versions_not_applicable_check" CHECK (
    "not_applicable" <@ ARRAY['bedrooms', 'bathrooms']::varchar(40)[]
  ),
  CONSTRAINT "listing_content_versions_json_check" CHECK (
    jsonb_typeof("property_facts") = 'object'
    AND octet_length("property_facts"::text) <= 20000
    AND jsonb_typeof("field_origins") = 'object'
    AND octet_length("field_origins"::text) <= 4000
  ),
  CONSTRAINT "listing_content_versions_available_check" CHECK (
    "available_from" IS NULL OR "available_from" >= DATE '2000-01-01'
  )
);

CREATE INDEX "listing_content_versions_latest_idx"
ON "listing_content_versions"("workspace_id", "listing_id", "version_no" DESC);
CREATE INDEX "listing_content_versions_terms_idx"
ON "listing_content_versions"("workspace_id", "source_terms_version_id");
CREATE INDEX "listing_content_versions_created_by_idx"
ON "listing_content_versions"("workspace_id", "created_by_membership_id");

CREATE TABLE "listing_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "kind" "listing_event_kind" NOT NULL,
  "from_state" "listing_state",
  "to_state" "listing_state",
  -- The version saved or reviewed.
  "version_no" integer,
  "reason" varchar(500),
  -- What the reviewer saw of the property's EPC evidence (a snapshot; the
  -- evidence itself stays owned by the property).
  "epc_position" "listing_epc_position",
  "epc_rating" char(1),
  "epc_evidence_id" uuid,
  "epc_event_on" date,
  "epc_expires_on" date,
  "epc_reference" varchar(120),
  -- The photos and floorplans as reviewed (from M5).
  "media_fingerprint" varchar(4000),
  "actor_membership_id" uuid NOT NULL,
  "recorded_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_events_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "listing_events_listing_fkey"
    FOREIGN KEY ("workspace_id", "listing_id")
    REFERENCES "listings"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_events_epc_evidence_fkey"
    FOREIGN KEY ("workspace_id", "epc_evidence_id")
    REFERENCES "property_compliance_evidence"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_events_actor_fkey"
    FOREIGN KEY ("workspace_id", "actor_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_events_reason_check" CHECK (
    "reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 500
  ),
  CONSTRAINT "listing_events_epc_rating_check" CHECK (
    "epc_rating" IS NULL OR "epc_rating" ~ '^[A-G]$'
  ),
  -- Each kind carries exactly what it needs. COALESCE because a CHECK that
  -- evaluates to NULL would pass.
  CONSTRAINT "listing_events_shape_check" CHECK (
    COALESCE(
      CASE "kind"
        WHEN 'created' THEN
          "from_state" IS NULL AND "to_state" IS NULL
        WHEN 'version_saved' THEN
          "from_state" IS NULL AND "to_state" IS NULL
          AND "version_no" IS NOT NULL
        WHEN 'marked_content_ready' THEN
          "from_state" = 'draft' AND "to_state" = 'content_ready'
          AND "version_no" IS NOT NULL AND "epc_position" IS NOT NULL
        WHEN 'marked_ready_to_advertise' THEN
          "from_state" = 'content_ready' AND "to_state" = 'ready_to_advertise'
          AND "version_no" IS NOT NULL AND "epc_position" IS NOT NULL
          AND "media_fingerprint" IS NOT NULL
        WHEN 'returned_to_draft' THEN
          "from_state" IN ('content_ready', 'ready_to_advertise')
          AND "to_state" = 'draft' AND "reason" IS NOT NULL
        WHEN 'edited_after_review' THEN
          "from_state" IN ('content_ready', 'ready_to_advertise')
          AND "to_state" = 'draft' AND "version_no" IS NOT NULL
        WHEN 'withdrawn' THEN
          "from_state" IS NOT NULL AND "from_state" <> 'withdrawn'
          AND "to_state" = 'withdrawn' AND "reason" IS NOT NULL
        WHEN 'instruction_returned' THEN
          "from_state" IN ('content_ready', 'ready_to_advertise')
          AND "to_state" = 'draft' AND "reason" IS NOT NULL
        WHEN 'instruction_ended' THEN
          "from_state" IS NOT NULL AND "from_state" <> 'withdrawn'
          AND "to_state" = 'withdrawn' AND "reason" IS NOT NULL
      END,
      false
    )
  )
);

CREATE INDEX "listing_events_latest_idx"
ON "listing_events"("workspace_id", "listing_id", "recorded_at" DESC, "id" DESC);
CREATE INDEX "listing_events_actor_idx"
ON "listing_events"("workspace_id", "actor_membership_id");
CREATE INDEX "listing_events_epc_evidence_idx"
ON "listing_events"("workspace_id", "epc_evidence_id");
-- At most one state change per listing per transaction, so "the event that
-- made this change" is unambiguous.
-- A listing is created once.
CREATE UNIQUE INDEX "listing_events_created_once"
ON "listing_events"("workspace_id", "listing_id")
WHERE "kind" = 'created';
CREATE UNIQUE INDEX "listing_events_one_state_change_per_transaction"
ON "listing_events"("workspace_id", "listing_id", "recorded_at")
WHERE "to_state" IS NOT NULL;

-- Whether the property's EPC position lets a listing become Ready to
-- advertise (owner decisions 2026-10-20 and 2026-10-21, pending legal
-- validation): reviewed unexpired evidence not rated F or G, a commissioned
-- (awaiting evidence) state, or Does not apply with a reason. Everything
-- else blocks, and no role overrides it. Mirrors epcAdvertisingCheck in
-- core/listings/domain/listing-epc.ts. Read through the caller's row
-- security.
CREATE FUNCTION "public"."listing_epc_allows_advertising"(
  "workspace" uuid,
  "property" uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  item uuid;
  latest_applicability "compliance_applicability";
  latest_reason text;
  latest_status "compliance_evidence_status";
  relied uuid;
  rating char(1);
  expires date;
BEGIN
  SELECT "id" INTO item
  FROM "property_compliance_items"
  WHERE "workspace_id" = "workspace"
    AND "property_id" = "property"
    AND "area" = 'epc_mees';
  IF item IS NULL THEN
    RETURN false;
  END IF;

  SELECT "applicability", "reason" INTO latest_applicability, latest_reason
  FROM "property_compliance_assessments"
  WHERE "workspace_id" = "workspace" AND "item_id" = item
  ORDER BY "recorded_at" DESC, "id" DESC
  LIMIT 1;
  IF latest_applicability IS NULL
    OR latest_applicability = 'needs_specialist_review'
  THEN
    RETURN false;
  END IF;
  IF latest_applicability = 'does_not_apply' THEN
    RETURN COALESCE(btrim(latest_reason), '') <> '';
  END IF;

  SELECT "status", "evidence_id" INTO latest_status, relied
  FROM "property_compliance_status_events"
  WHERE "workspace_id" = "workspace" AND "item_id" = item
  ORDER BY "recorded_at" DESC, "id" DESC
  LIMIT 1;
  IF latest_status = 'awaiting_evidence' THEN
    RETURN true;
  END IF;
  IF latest_status = 'reviewed' AND relied IS NOT NULL THEN
    SELECT "epc_rating", "expires_on" INTO rating, expires
    FROM "property_compliance_evidence"
    WHERE "workspace_id" = "workspace" AND "id" = relied;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    IF expires IS NOT NULL AND expires < "public"."uk_today"() THEN
      RETURN false;
    END IF;
    RETURN rating IS NULL OR upper(rating) NOT IN ('F', 'G');
  END IF;
  RETURN false;
END;
$$;

-- Whether the listing has the minimum photos and floorplan. Listing media
-- does not exist until M5, which replaces this function; until then Ready
-- to advertise cannot be reached.
CREATE FUNCTION "public"."listing_media_complete"(
  "workspace" uuid,
  "listing" uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT false
$$;

-- A new listing starts as a draft on a visible, current, Ready to market
-- instruction. FOR SHARE waits for an ending or move in progress.
CREATE FUNCTION "public"."prepare_listing"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  instruction_property uuid;
  instruction_stage "instruction_journey_stage";
  instruction_ended date;
BEGIN
  IF NEW."state" <> 'draft' THEN
    RAISE EXCEPTION 'a new listing starts as a draft'
      USING ERRCODE = '23514';
  END IF;
  SELECT "property_id", "journey_stage", "ended_on"
  INTO instruction_property, instruction_stage, instruction_ended
  FROM "instructions"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."instruction_id"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a listing must belong to a visible instruction'
      USING ERRCODE = '42501';
  END IF;
  IF instruction_ended IS NOT NULL
    OR instruction_stage <> 'ready_to_market'
  THEN
    RAISE EXCEPTION 'a listing is prepared from a Ready to market instruction'
      USING ERRCODE = '23514';
  END IF;
  NEW."property_id" := instruction_property;
  NEW."created_at" := transaction_timestamp();
  NEW."state_changed_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listings_prepare"
BEFORE INSERT ON "listings"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_listing"();

-- Only the state moves: a legal move, backed by its event in this
-- transaction by the current member. A review needs the instruction to be
-- Ready to market and the version to be based on its latest terms; Ready to
-- advertise also needs the EPC position and the media to allow it.
CREATE FUNCTION "public"."enforce_listing_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  instruction_stage "instruction_journey_stage";
  instruction_ended date;
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."instruction_id" <> OLD."instruction_id"
    OR NEW."property_id" <> OLD."property_id"
    OR NEW."created_by_membership_id" <> OLD."created_by_membership_id"
    OR NEW."created_at" <> OLD."created_at"
  THEN
    RAISE EXCEPTION 'a listing''s identity cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."state" = OLD."state" THEN
    NEW."state_changed_at" := OLD."state_changed_at";
    RETURN NEW;
  END IF;
  IF NOT "public"."listing_transition_allowed"(OLD."state", NEW."state") THEN
    RAISE EXCEPTION 'this listing change is not allowed'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "listing_events"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "listing_id" = NEW."id"
      AND "from_state" = OLD."state"
      AND "to_state" = NEW."state"
      AND "actor_membership_id" =
        NULLIF(current_setting('app.membership_id', true), '')::uuid
      AND "recorded_at" = transaction_timestamp()
  ) THEN
    RAISE EXCEPTION 'listing changes require an event record'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."state" IN ('content_ready', 'ready_to_advertise') THEN
    -- FOR SHARE waits for a move of the instruction in progress, so a review
    -- cannot slip in beside a return to Onboarding.
    SELECT "journey_stage", "ended_on" INTO instruction_stage, instruction_ended
    FROM "instructions"
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."instruction_id"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a listing must belong to a visible instruction'
        USING ERRCODE = '42501';
    END IF;
    IF instruction_ended IS NOT NULL
      OR instruction_stage <> 'ready_to_market'
    THEN
      RAISE EXCEPTION 'a listing is reviewed only while its instruction is Ready to market'
        USING ERRCODE = '23514';
    END IF;
    IF (
      SELECT v."source_terms_version_id"
      FROM "listing_content_versions" AS v
      WHERE v."workspace_id" = NEW."workspace_id" AND v."listing_id" = NEW."id"
      ORDER BY v."version_no" DESC
      LIMIT 1
    ) IS DISTINCT FROM (
      SELECT t."id"
      FROM "instruction_terms_versions" AS t
      WHERE t."workspace_id" = NEW."workspace_id"
        AND t."instruction_id" = NEW."instruction_id"
      ORDER BY t."created_at" DESC, t."id" DESC
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'the agreed terms changed: save a new version first'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."state" = 'ready_to_advertise' THEN
    IF NOT "public"."listing_epc_allows_advertising"(
      NEW."workspace_id", NEW."property_id"
    ) THEN
      RAISE EXCEPTION 'the EPC position does not allow advertising'
        USING ERRCODE = '23514';
    END IF;
    IF NOT "public"."listing_media_complete"(NEW."workspace_id", NEW."id") THEN
      RAISE EXCEPTION 'the listing does not have the minimum media'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW."state_changed_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listings_enforce_rules"
BEFORE UPDATE ON "listings"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_listing_rules"();

-- A new version: on a visible listing that is not withdrawn, numbered by
-- the database, with the rent and deposit copied from the instruction's
-- latest terms. FOR UPDATE on the listing serialises versions.
CREATE FUNCTION "public"."prepare_listing_version"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  listing_state "listing_state";
  listing_instruction uuid;
BEGIN
  SELECT "state", "instruction_id" INTO listing_state, listing_instruction
  FROM "listings"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."listing_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a version must belong to a visible listing'
      USING ERRCODE = '42501';
  END IF;
  IF listing_state = 'withdrawn' THEN
    RAISE EXCEPTION 'a withdrawn listing cannot change'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(max("version_no"), 0) + 1 INTO NEW."version_no"
  FROM "listing_content_versions"
  WHERE "workspace_id" = NEW."workspace_id" AND "listing_id" = NEW."listing_id";

  SELECT "id", "asking_rent_pence", "rent_period", "deposit_offering",
    "deposit_pence", "holding_deposit_pence"
  INTO NEW."source_terms_version_id", NEW."advertised_rent_pence",
    NEW."rent_period", NEW."deposit_offering", NEW."deposit_pence",
    NEW."holding_deposit_pence"
  FROM "instruction_terms_versions"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "instruction_id" = listing_instruction
  ORDER BY "created_at" DESC, "id" DESC
  LIMIT 1;
  IF NEW."source_terms_version_id" IS NULL THEN
    RAISE EXCEPTION 'the instruction has no terms'
      USING ERRCODE = '23514';
  END IF;

  NEW."created_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listing_content_versions_prepare"
BEFORE INSERT ON "listing_content_versions"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_listing_version"();

-- A new event: on a visible listing, from the state it is really in, never
-- adding to a withdrawn listing. The database sets the time.
CREATE FUNCTION "public"."prepare_listing_event"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  listing_state "listing_state";
  listing_property uuid;
BEGIN
  SELECT "state", "property_id" INTO listing_state, listing_property
  FROM "listings"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."listing_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an event must belong to a visible listing'
      USING ERRCODE = '42501';
  END IF;
  -- A recorded EPC snapshot points at this property's own EPC evidence.
  IF NEW."epc_evidence_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "property_compliance_evidence" AS e
    JOIN "property_compliance_items" AS c
      ON c."workspace_id" = e."workspace_id" AND c."id" = e."item_id"
    WHERE e."workspace_id" = NEW."workspace_id"
      AND e."id" = NEW."epc_evidence_id"
      AND c."property_id" = listing_property
      AND c."area" = 'epc_mees'
  ) THEN
    RAISE EXCEPTION 'the EPC evidence must belong to this property'
      USING ERRCODE = '23514';
  END IF;
  IF listing_state = 'withdrawn' THEN
    RAISE EXCEPTION 'a withdrawn listing cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."to_state" IS NOT NULL AND NEW."from_state" <> listing_state THEN
    RAISE EXCEPTION 'the listing has moved on since this was started'
      USING ERRCODE = '23514';
  END IF;
  NEW."recorded_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listing_events_prepare"
BEFORE INSERT ON "listing_events"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_listing_event"();

-- At commit, every event matches what really happened: a state change was
-- applied, a saved version exists, a reviewed version is the current one,
-- and an instruction-driven change followed a real instruction change.
CREATE FUNCTION "public"."enforce_listing_event_applied"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  latest_version integer;
BEGIN
  IF NEW."to_state" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "listings"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."listing_id"
      AND "state" = NEW."to_state"
      AND "state_changed_at" = NEW."recorded_at"
  ) THEN
    RAISE EXCEPTION 'a listing event must match the listing'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."version_no" IS NOT NULL THEN
    SELECT max("version_no") INTO latest_version
    FROM "listing_content_versions"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "listing_id" = NEW."listing_id";
    IF NEW."kind" = 'version_saved' AND NOT EXISTS (
      SELECT 1 FROM "listing_content_versions"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "listing_id" = NEW."listing_id"
        AND "version_no" = NEW."version_no"
        AND "created_at" = NEW."recorded_at"
    ) THEN
      RAISE EXCEPTION 'a saved-version event must match its version'
        USING ERRCODE = '23514';
    END IF;
    -- An edit after review really saved a version in this transaction.
    IF NEW."kind" = 'edited_after_review' AND NOT EXISTS (
      SELECT 1 FROM "listing_content_versions"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "listing_id" = NEW."listing_id"
        AND "version_no" = NEW."version_no"
        AND "created_at" = NEW."recorded_at"
    ) THEN
      RAISE EXCEPTION 'an edit after review must save a version'
        USING ERRCODE = '23514';
    END IF;
    IF NEW."kind" IN ('marked_content_ready', 'marked_ready_to_advertise')
      AND NEW."version_no" IS DISTINCT FROM latest_version
    THEN
      RAISE EXCEPTION 'a review must be of the current version'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- A created event belongs to the listing's own creation.
  IF NEW."kind" = 'created' AND NOT EXISTS (
    SELECT 1 FROM "listings"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."listing_id"
      AND "created_at" = NEW."recorded_at"
  ) THEN
    RAISE EXCEPTION 'a created event belongs to the listing''s creation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."kind" = 'instruction_ended' AND NOT EXISTS (
    SELECT 1 FROM "listings" AS l
    JOIN "instructions" AS i
      ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
    WHERE l."workspace_id" = NEW."workspace_id"
      AND l."id" = NEW."listing_id"
      AND i."ended_on" IS NOT NULL
      AND i."ended_at" = NEW."recorded_at"
  ) THEN
    RAISE EXCEPTION 'the instruction did not end'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."kind" = 'instruction_returned' AND NOT EXISTS (
    SELECT 1 FROM "listings" AS l
    JOIN "instructions" AS i
      ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
    WHERE l."workspace_id" = NEW."workspace_id"
      AND l."id" = NEW."listing_id"
      AND i."journey_stage" = 'onboarding'
      AND i."journey_changed_at" = NEW."recorded_at"
  ) THEN
    RAISE EXCEPTION 'the instruction did not return to Onboarding'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "listing_events_require_applied"
AFTER INSERT ON "listing_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_listing_event_applied"();

-- At commit, a listing has its first version, and a reviewed listing is
-- still on the version that was reviewed: saving a new version means going
-- back to Draft in the same transaction.
CREATE FUNCTION "public"."assert_listing_consistent"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target uuid;
  current_state "listing_state";
  latest_version integer;
  reviewed_version integer;
BEGIN
  IF TG_TABLE_NAME = 'listings' THEN
    target := NEW."id";
  ELSE
    target := NEW."listing_id";
  END IF;

  SELECT "state" INTO current_state
  FROM "listings"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing records must belong to a visible listing'
      USING ERRCODE = '42501';
  END IF;

  SELECT max("version_no") INTO latest_version
  FROM "listing_content_versions"
  WHERE "workspace_id" = NEW."workspace_id" AND "listing_id" = target;
  IF latest_version IS NULL THEN
    RAISE EXCEPTION 'a listing needs its first version'
      USING ERRCODE = '23514';
  END IF;

  IF current_state IN ('content_ready', 'ready_to_advertise') THEN
    SELECT "version_no" INTO reviewed_version
    FROM "listing_events"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "listing_id" = target
      AND "to_state" = current_state
    ORDER BY "recorded_at" DESC, "id" DESC
    LIMIT 1;
    IF reviewed_version IS DISTINCT FROM latest_version THEN
      RAISE EXCEPTION 'an edited listing must return to Draft'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "listings_assert_consistent"
AFTER INSERT OR UPDATE ON "listings"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_listing_consistent"();
CREATE CONSTRAINT TRIGGER "listing_content_versions_assert_consistent"
AFTER INSERT ON "listing_content_versions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_listing_consistent"();

-- Ending an instruction withdraws its current listing; returning it to
-- Onboarding takes a reviewed listing back to Draft. Same transaction, same
-- person, with the instruction's reason, so no caller can forget it.
CREATE FUNCTION "public"."cascade_instruction_to_listing"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
  current_id uuid;
  current_state "listing_state";
  why text;
BEGIN
  SELECT "id", "state" INTO current_id, current_state
  FROM "listings"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "instruction_id" = NEW."id"
    AND "state" <> 'withdrawn'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NEW."journey_stage" = 'withdrawn' THEN
    INSERT INTO "listing_events" (
      "workspace_id", "listing_id", "kind", "from_state", "to_state",
      "reason", "actor_membership_id"
    ) VALUES (
      NEW."workspace_id", current_id, 'instruction_ended', current_state,
      'withdrawn', NEW."ended_reason", actor
    );
    UPDATE "listings" SET "state" = 'withdrawn'
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = current_id;
  ELSIF OLD."journey_stage" = 'ready_to_market'
    AND NEW."journey_stage" = 'onboarding'
    AND current_state IN ('content_ready', 'ready_to_advertise')
  THEN
    SELECT "reason" INTO why
    FROM "instruction_journey_history"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "instruction_id" = NEW."id"
      AND "to_stage" = 'onboarding'
      AND "created_at" = transaction_timestamp()
    LIMIT 1;
    INSERT INTO "listing_events" (
      "workspace_id", "listing_id", "kind", "from_state", "to_state",
      "reason", "actor_membership_id"
    ) VALUES (
      NEW."workspace_id", current_id, 'instruction_returned', current_state,
      'draft',
      COALESCE(NULLIF(btrim(why), ''), 'The instruction returned to Onboarding'),
      actor
    );
    UPDATE "listings" SET "state" = 'draft'
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = current_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Not "UPDATE OF": the WHEN clause sees every change to the stage.
CREATE TRIGGER "instructions_cascade_to_listing"
AFTER UPDATE ON "instructions"
FOR EACH ROW
WHEN (OLD."journey_stage" IS DISTINCT FROM NEW."journey_stage")
EXECUTE FUNCTION "public"."cascade_instruction_to_listing"();

ALTER TABLE "listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "listing_content_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_content_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "listing_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_events" FORCE ROW LEVEL SECURITY;

-- Staff who can see the instruction see its listings; the instruction's own
-- policy supplies the branch scope. Staff-only, so a future participant who
-- can see an instruction never gains its listings.
CREATE POLICY "listing_select_in_scope" ON "listings"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."document_member_is_staff"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  )
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "listings"."workspace_id"
      AND i."id" = "listings"."instruction_id"
  )
);
CREATE POLICY "listing_insert_in_scope" ON "listings"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "listings"."workspace_id"
      AND i."id" = "listings"."instruction_id"
      AND "public"."listing_member_can_prepare"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);
-- State changes by a reviewer, or by someone working on the instruction
-- (whose only possible changes are the instruction-driven ones: the event
-- policy and the commit checks allow nothing else).
CREATE POLICY "listing_update_in_scope" ON "listings"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "listings"."workspace_id"
      AND i."id" = "listings"."instruction_id"
      AND (
        "public"."listing_member_can_review"(
          NULLIF(current_setting('app.membership_id', true), '')::uuid,
          i."responsible_branch_id"
        )
        OR "public"."instruction_member_can_work"(
          NULLIF(current_setting('app.membership_id', true), '')::uuid,
          i."responsible_branch_id"
        )
      )
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

CREATE POLICY "listing_version_select_in_scope" ON "listing_content_versions"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "listings" AS l
    WHERE l."workspace_id" = "listing_content_versions"."workspace_id"
      AND l."id" = "listing_content_versions"."listing_id"
  )
);
CREATE POLICY "listing_version_insert_in_scope" ON "listing_content_versions"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "listings" AS l
    JOIN "instructions" AS i
      ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
    WHERE l."workspace_id" = "listing_content_versions"."workspace_id"
      AND l."id" = "listing_content_versions"."listing_id"
      AND "public"."listing_member_can_prepare"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);

CREATE POLICY "listing_event_select_in_scope" ON "listing_events"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "listings" AS l
    WHERE l."workspace_id" = "listing_events"."workspace_id"
      AND l."id" = "listing_events"."listing_id"
  )
);
-- Each kind of event by the people allowed to cause it, as themselves.
CREATE POLICY "listing_event_insert_in_scope" ON "listing_events"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "actor_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "listings" AS l
    JOIN "instructions" AS i
      ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
    WHERE l."workspace_id" = "listing_events"."workspace_id"
      AND l."id" = "listing_events"."listing_id"
      AND CASE
        WHEN "listing_events"."kind" IN (
          'created', 'version_saved', 'edited_after_review'
        ) THEN "public"."listing_member_can_prepare"(
          NULLIF(current_setting('app.membership_id', true), '')::uuid,
          i."responsible_branch_id"
        )
        WHEN "listing_events"."kind" IN (
          'marked_content_ready', 'marked_ready_to_advertise',
          'returned_to_draft', 'withdrawn'
        ) THEN "public"."listing_member_can_review"(
          NULLIF(current_setting('app.membership_id', true), '')::uuid,
          i."responsible_branch_id"
        )
        WHEN "listing_events"."kind" IN (
          'instruction_returned', 'instruction_ended'
        ) THEN "public"."instruction_member_can_work"(
          NULLIF(current_setting('app.membership_id', true), '')::uuid,
          i."responsible_branch_id"
        )
        ELSE false
      END
  )
);

-- Read and add, and change only a listing's state. Revoking the default
-- privileges first leaves exactly these grants.
REVOKE ALL ON TABLE "listings", "listing_content_versions", "listing_events"
FROM "zayto_app";
GRANT SELECT, INSERT ON TABLE "listings" TO "zayto_app";
GRANT UPDATE ("state") ON TABLE "listings" TO "zayto_app";
GRANT SELECT, INSERT ON TABLE "listing_content_versions", "listing_events"
TO "zayto_app";
