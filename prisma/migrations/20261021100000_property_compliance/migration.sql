-- C3: manual property compliance. Owner-approved design (2026-10-21) in
-- .cursor/plans/c3-design-property-compliance.md.
--
-- Five areas per property, each an item created the first time staff record
-- something (the migration cannot create rows for existing properties: the
-- tables are forced RLS and the migrator has no bypass). Under each item,
-- three append-only histories: applicability, evidence (staff-entered facts
-- and an optional C1 file) and evidence status (which evidence is relied on).
-- The current value of each is its latest row. Not assessed, Not requested,
-- Expired and Superseded are derived, never stored. Zayto records what staff
-- typed from the evidence; it never calculates a deadline or a verdict.
--
-- The app may only read and add rows here. Nothing is updated or deleted.

CREATE TYPE "compliance_area" AS ENUM (
  'epc_mees', 'gas_safety', 'electrical_safety', 'smoke_co_alarms',
  'licensing'
);
CREATE TYPE "compliance_applicability" AS ENUM (
  'applies', 'does_not_apply', 'needs_specialist_review'
);
CREATE TYPE "compliance_evidence_status" AS ENUM (
  'awaiting_evidence', 'reviewed', 'action_required'
);

-- System definitions, the same for every workspace. A rule change adds a
-- version; old versions are never edited.
CREATE TABLE "compliance_requirements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "area" "compliance_area" NOT NULL,
  "version" integer NOT NULL,
  "jurisdiction" varchar(20) NOT NULL,
  "label" varchar(80) NOT NULL,
  "effective_from" date NOT NULL,
  "review_by" date NOT NULL,
  "source_url" varchar(500) NOT NULL,
  -- Owner decision 1 (2026-10-21): evidence needs a file, except alarms.
  "is_file_required" boolean NOT NULL,
  CONSTRAINT "compliance_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "compliance_requirements_id_area_key" UNIQUE ("id", "area"),
  CONSTRAINT "compliance_requirements_area_version_key"
    UNIQUE ("area", "version"),
  CONSTRAINT "compliance_requirements_version_check" CHECK ("version" >= 1),
  CONSTRAINT "compliance_requirements_jurisdiction_check" CHECK (
    "jurisdiction" = 'england'
  ),
  CONSTRAINT "compliance_requirements_source_check" CHECK (
    "source_url" ~ '^https://'
  )
);

INSERT INTO "compliance_requirements" (
  "area", "version", "jurisdiction", "label", "effective_from", "review_by",
  "source_url", "is_file_required"
) VALUES
  ('epc_mees', 1, 'england', 'EPC and minimum energy efficiency',
    DATE '2026-10-21', DATE '2027-04-21',
    'https://www.gov.uk/guidance/domestic-private-rented-property-minimum-energy-efficiency-standard-landlord-guidance',
    true),
  ('gas_safety', 1, 'england', 'Gas safety record (CP12)',
    DATE '2026-10-21', DATE '2027-04-21',
    'https://www.hse.gov.uk/gas/landlords/who.htm',
    true),
  ('electrical_safety', 1, 'england', 'Electrical safety (EICR)',
    DATE '2026-10-21', DATE '2027-04-21',
    'https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance',
    true),
  ('smoke_co_alarms', 1, 'england', 'Smoke and carbon monoxide alarms',
    DATE '2026-10-21', DATE '2027-04-21',
    'https://www.legislation.gov.uk/uksi/2015/1693/body?view=plain',
    false),
  ('licensing', 1, 'england', 'Property licensing',
    DATE '2026-10-21', DATE '2027-04-21',
    'https://www.gov.uk/find-licences/house-in-multiple-occupation-licence',
    true);

CREATE TABLE "property_compliance_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "property_id" uuid NOT NULL,
  "area" "compliance_area" NOT NULL,
  "requirement_id" uuid NOT NULL,
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_compliance_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_compliance_items_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "property_compliance_items_property_area_key"
    UNIQUE ("workspace_id", "property_id", "area"),
  CONSTRAINT "property_compliance_items_property_fkey"
    FOREIGN KEY ("workspace_id", "property_id")
    REFERENCES "properties"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_items_requirement_fkey"
    FOREIGN KEY ("requirement_id", "area")
    REFERENCES "compliance_requirements"("id", "area")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_items_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "property_compliance_items_requirement_idx"
ON "property_compliance_items"("requirement_id", "area");
CREATE INDEX "property_compliance_items_created_by_idx"
ON "property_compliance_items"("workspace_id", "created_by_membership_id");

CREATE TABLE "property_compliance_assessments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "applicability" "compliance_applicability" NOT NULL,
  "reason" varchar(1000),
  "source_note" varchar(500),
  "recorded_by_membership_id" uuid NOT NULL,
  "recorded_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_compliance_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_compliance_assessments_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "property_compliance_assessments_item_fkey"
    FOREIGN KEY ("workspace_id", "item_id")
    REFERENCES "property_compliance_items"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_assessments_recorded_by_fkey"
    FOREIGN KEY ("workspace_id", "recorded_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Does not apply and Needs specialist review need a written reason.
  CONSTRAINT "property_compliance_assessments_reason_check" CHECK (
    ("reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 1000)
    AND ("applicability" = 'applies' OR "reason" IS NOT NULL)
  ),
  CONSTRAINT "property_compliance_assessments_source_check" CHECK (
    "source_note" IS NULL
    OR char_length(btrim("source_note")) BETWEEN 1 AND 500
  )
);

CREATE INDEX "property_compliance_assessments_latest_idx"
ON "property_compliance_assessments"(
  "workspace_id", "item_id", "recorded_at" DESC, "id" DESC
);
CREATE INDEX "property_compliance_assessments_recorded_by_idx"
ON "property_compliance_assessments"(
  "workspace_id", "recorded_by_membership_id"
);

CREATE TABLE "property_compliance_evidence" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "document_id" uuid,
  "reference" varchar(120),
  "provider" varchar(160),
  "event_on" date NOT NULL,
  "expires_on" date,
  "epc_rating" char(1),
  "notes" varchar(1000),
  "recorded_by_membership_id" uuid NOT NULL,
  "recorded_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_compliance_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_compliance_evidence_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "property_compliance_evidence_document_key"
    UNIQUE ("workspace_id", "document_id"),
  CONSTRAINT "property_compliance_evidence_item_fkey"
    FOREIGN KEY ("workspace_id", "item_id")
    REFERENCES "property_compliance_items"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_evidence_document_fkey"
    FOREIGN KEY ("workspace_id", "document_id")
    REFERENCES "documents"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_evidence_recorded_by_fkey"
    FOREIGN KEY ("workspace_id", "recorded_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_evidence_text_check" CHECK (
    ("reference" IS NULL OR char_length(btrim("reference")) BETWEEN 1 AND 120)
    AND ("provider" IS NULL OR char_length(btrim("provider")) BETWEEN 1 AND 160)
    AND ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 1 AND 1000)
  ),
  -- As written on the evidence; Zayto never calculates it.
  CONSTRAINT "property_compliance_evidence_dates_check" CHECK (
    "expires_on" IS NULL OR "expires_on" >= "event_on"
  ),
  CONSTRAINT "property_compliance_evidence_epc_rating_check" CHECK (
    "epc_rating" IS NULL OR "epc_rating" ~ '^[A-G]$'
  )
);

CREATE INDEX "property_compliance_evidence_item_idx"
ON "property_compliance_evidence"(
  "workspace_id", "item_id", "recorded_at" DESC, "id" DESC
);
CREATE INDEX "property_compliance_evidence_recorded_by_idx"
ON "property_compliance_evidence"("workspace_id", "recorded_by_membership_id");

CREATE TABLE "property_compliance_status_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "status" "compliance_evidence_status" NOT NULL,
  "evidence_id" uuid,
  "note" varchar(1000),
  "recorded_by_membership_id" uuid NOT NULL,
  "recorded_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_compliance_status_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_compliance_status_events_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "property_compliance_status_events_item_fkey"
    FOREIGN KEY ("workspace_id", "item_id")
    REFERENCES "property_compliance_items"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_status_events_evidence_fkey"
    FOREIGN KEY ("workspace_id", "evidence_id")
    REFERENCES "property_compliance_evidence"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_status_events_recorded_by_fkey"
    FOREIGN KEY ("workspace_id", "recorded_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_compliance_status_events_note_check" CHECK (
    "note" IS NULL OR char_length(btrim("note")) BETWEEN 1 AND 1000
  ),
  -- Awaiting evidence relies on nothing; Reviewed and Action required name
  -- the evidence relied on, and Action required says what is needed.
  CONSTRAINT "property_compliance_status_events_shape_check" CHECK (
    CASE "status"
      WHEN 'awaiting_evidence' THEN "evidence_id" IS NULL
      WHEN 'reviewed' THEN "evidence_id" IS NOT NULL
      WHEN 'action_required' THEN
        "evidence_id" IS NOT NULL AND "note" IS NOT NULL
    END
  )
);

CREATE INDEX "property_compliance_status_events_latest_idx"
ON "property_compliance_status_events"(
  "workspace_id", "item_id", "recorded_at" DESC, "id" DESC
);
CREATE INDEX "property_compliance_status_events_evidence_idx"
ON "property_compliance_status_events"("workspace_id", "evidence_id");
CREATE INDEX "property_compliance_status_events_recorded_by_idx"
ON "property_compliance_status_events"(
  "workspace_id", "recorded_by_membership_id"
);

-- The caller can work on the property's compliance and it is active. The
-- permission is checked here as well as in the policies so that a member
-- without it is refused plainly, before any later check runs. FOR SHARE
-- waits for an archiving in progress, so nothing is added to a property
-- being archived.
CREATE FUNCTION "public"."assert_compliance_property_open"(
  "workspace" uuid,
  "property" uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  property_state "property_status";
  property_branch uuid;
BEGIN
  SELECT "status", "responsible_branch_id"
  INTO property_state, property_branch
  FROM "properties"
  WHERE "workspace_id" = "workspace" AND "id" = "property"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compliance records must belong to a visible property'
      USING ERRCODE = '42501';
  END IF;
  IF NOT "public"."property_compliance_member_can_work"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid,
    property_branch
  ) THEN
    RAISE EXCEPTION 'this member cannot record compliance on this property'
      USING ERRCODE = '42501';
  END IF;
  IF property_state <> 'active' THEN
    RAISE EXCEPTION 'an archived property cannot gain compliance records'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- An item uses the area's current requirement version, chosen here.
CREATE FUNCTION "public"."prepare_property_compliance_item"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM "public"."assert_compliance_property_open"(
    NEW."workspace_id", NEW."property_id"
  );
  SELECT "id" INTO NEW."requirement_id"
  FROM "compliance_requirements"
  WHERE "area" = NEW."area"
    AND "effective_from" <= "public"."uk_today"()
  ORDER BY "version" DESC
  LIMIT 1;
  IF NEW."requirement_id" IS NULL THEN
    RAISE EXCEPTION 'this compliance area has no current requirement'
      USING ERRCODE = '23514';
  END IF;
  NEW."created_at" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "property_compliance_items_prepare"
BEFORE INSERT ON "property_compliance_items"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_property_compliance_item"();

-- Every history row: the item's property is visible and active, and the
-- database sets the time. The clock time, not the transaction's, so rows
-- added in one transaction keep their order and "latest" is unambiguous.
CREATE FUNCTION "public"."prepare_property_compliance_record"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  item_property uuid;
BEGIN
  SELECT "property_id" INTO item_property
  FROM "property_compliance_items"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."item_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compliance records must belong to a visible item'
      USING ERRCODE = '42501';
  END IF;
  PERFORM "public"."assert_compliance_property_open"(
    NEW."workspace_id", item_property
  );
  NEW."recorded_at" := clock_timestamp();
  RETURN NEW;
END;
$$;

-- *_check_item runs first (name order).
CREATE TRIGGER "property_compliance_assessments_check_item"
BEFORE INSERT ON "property_compliance_assessments"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_property_compliance_record"();
CREATE TRIGGER "property_compliance_evidence_check_item"
BEFORE INSERT ON "property_compliance_evidence"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_property_compliance_record"();
CREATE TRIGGER "property_compliance_status_events_check_item"
BEFORE INSERT ON "property_compliance_status_events"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_property_compliance_record"();

-- Evidence: a date not in the future; a file where the requirement needs one,
-- which must be the recorder's own stored compliance file for this property;
-- an EPC rating only on EPC evidence.
CREATE FUNCTION "public"."prepare_property_compliance_evidence"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  item_property uuid;
  item_area "compliance_area";
  needs_file boolean;
BEGIN
  SELECT i."property_id", i."area", r."is_file_required"
  INTO item_property, item_area, needs_file
  FROM "property_compliance_items" AS i
  JOIN "compliance_requirements" AS r ON r."id" = i."requirement_id"
  WHERE i."workspace_id" = NEW."workspace_id" AND i."id" = NEW."item_id";

  IF NEW."event_on" > "public"."uk_today"() THEN
    RAISE EXCEPTION 'the evidence date cannot be in the future'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."epc_rating" IS NOT NULL AND item_area <> 'epc_mees' THEN
    RAISE EXCEPTION 'only EPC evidence has an energy rating'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."document_id" IS NULL THEN
    IF needs_file THEN
      RAISE EXCEPTION 'this evidence needs an uploaded file'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    PERFORM 1 FROM "documents"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "id" = NEW."document_id"
      AND "kind" = 'compliance_evidence'
      AND "property_id" = item_property
      AND "status" = 'stored'
      AND "uploaded_by_membership_id" = NEW."recorded_by_membership_id"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'evidence needs its own stored file on this property'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "property_compliance_evidence_prepare"
BEFORE INSERT ON "property_compliance_evidence"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_property_compliance_evidence"();

-- A status is recorded only while the area currently Applies, and relies on
-- evidence from the same item whose file (if any) is still stored. FOR SHARE
-- on the file waits for a removal in progress, so nothing relies on a file
-- that is being removed.
CREATE FUNCTION "public"."prepare_property_compliance_status_event"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_applicability "compliance_applicability";
  evidence_item uuid;
  evidence_document uuid;
BEGIN
  SELECT "applicability" INTO current_applicability
  FROM "property_compliance_assessments"
  WHERE "workspace_id" = NEW."workspace_id" AND "item_id" = NEW."item_id"
  ORDER BY "recorded_at" DESC, "id" DESC
  LIMIT 1;
  IF current_applicability IS DISTINCT FROM 'applies' THEN
    RAISE EXCEPTION 'evidence status is recorded only when the area applies'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."evidence_id" IS NOT NULL THEN
    SELECT "item_id", "document_id" INTO evidence_item, evidence_document
    FROM "property_compliance_evidence"
    WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."evidence_id";
    IF evidence_item IS DISTINCT FROM NEW."item_id" THEN
      RAISE EXCEPTION 'the evidence relied on must belong to this area'
        USING ERRCODE = '23514';
    END IF;
    IF evidence_document IS NOT NULL THEN
      PERFORM 1 FROM "documents"
      WHERE "workspace_id" = NEW."workspace_id"
        AND "id" = evidence_document
        AND "status" = 'stored'
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'evidence whose file was removed cannot be relied on'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "property_compliance_status_events_prepare"
BEFORE INSERT ON "property_compliance_status_events"
FOR EACH ROW EXECUTE FUNCTION
  "public"."prepare_property_compliance_status_event"();

-- C1 and C2's document rules, plus: a compliance file that any status has
-- relied on can never be removed.
CREATE OR REPLACE FUNCTION "public"."enforce_document_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."instruction_id" IS DISTINCT FROM OLD."instruction_id"
    OR NEW."property_id" IS DISTINCT FROM OLD."property_id"
    OR NEW."display_name" IS DISTINCT FROM OLD."display_name"
    OR NEW."media_type" IS DISTINCT FROM OLD."media_type"
    OR NEW."byte_size" IS DISTINCT FROM OLD."byte_size"
    OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
    OR NEW."uploaded_by_membership_id"
      IS DISTINCT FROM OLD."uploaded_by_membership_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'a document''s file details cannot change'
      USING ERRCODE = '23514';
  END IF;

  NEW."stored_at" := OLD."stored_at";
  NEW."ended_at" := OLD."ended_at";

  IF OLD."status" = 'pending' AND NEW."status" = 'stored' THEN
    IF actor IS DISTINCT FROM OLD."uploaded_by_membership_id" THEN
      RAISE EXCEPTION 'only the uploader can complete an upload'
        USING ERRCODE = '42501';
    END IF;
    PERFORM "public"."assert_document_record_open"(
      OLD."workspace_id", OLD."instruction_id", OLD."property_id"
    );
    NEW."stored_at" := transaction_timestamp();
  ELSIF OLD."status" = 'pending' AND NEW."status" = 'failed' THEN
    IF actor IS DISTINCT FROM OLD."uploaded_by_membership_id"
      AND NOT (
        NEW."failure_code" = 'abandoned'
        AND OLD."created_at" < transaction_timestamp() - interval '1 hour'
      )
    THEN
      RAISE EXCEPTION 'only an abandoned upload can be failed by another member'
        USING ERRCODE = '42501';
    END IF;
    NEW."ended_at" := transaction_timestamp();
  ELSIF OLD."status" = 'stored' AND NEW."status" = 'removed' THEN
    IF actor IS NULL
      OR NEW."removed_by_membership_id" IS DISTINCT FROM actor
    THEN
      RAISE EXCEPTION 'a document is removed by the current member'
        USING ERRCODE = '42501';
    END IF;
    -- The remover can work on the instruction or property (update policy),
    -- so can see its agreements and compliance records: these checks are
    -- never blind.
    IF EXISTS (
      SELECT 1 FROM "instruction_agreements"
      WHERE "workspace_id" = OLD."workspace_id"
        AND "document_id" = OLD."id"
        AND "state" <> 'discarded'
    ) THEN
      RAISE EXCEPTION 'a document backing an agreement cannot be removed'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM "property_compliance_evidence" AS e
      JOIN "property_compliance_status_events" AS s
        ON s."workspace_id" = e."workspace_id" AND s."evidence_id" = e."id"
      WHERE e."workspace_id" = OLD."workspace_id"
        AND e."document_id" = OLD."id"
    ) THEN
      RAISE EXCEPTION 'evidence that has been relied on cannot be removed'
        USING ERRCODE = '23514';
    END IF;
    NEW."ended_at" := transaction_timestamp();
  ELSE
    RAISE EXCEPTION 'this document status change is not allowed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE "compliance_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_requirements" FORCE ROW LEVEL SECURITY;
ALTER TABLE "property_compliance_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_compliance_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "property_compliance_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_compliance_assessments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "property_compliance_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_compliance_evidence" FORCE ROW LEVEL SECURITY;
ALTER TABLE "property_compliance_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_compliance_status_events" FORCE ROW LEVEL SECURITY;

-- System definitions hold no workspace data; anyone with table access reads
-- them.
CREATE POLICY "compliance_requirement_select_all"
ON "compliance_requirements"
FOR SELECT USING (true);

-- Staff who can see the property see its compliance records; the property's
-- own policy supplies the branch scope. Staff-only, like the documents, so a
-- future participant who can see a property never gains them.
CREATE POLICY "property_compliance_item_select_in_scope"
ON "property_compliance_items"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."document_member_is_staff"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  )
  AND EXISTS (
    SELECT 1 FROM "properties" AS p
    WHERE p."workspace_id" = "property_compliance_items"."workspace_id"
      AND p."id" = "property_compliance_items"."property_id"
  )
);
CREATE POLICY "property_compliance_item_insert_in_scope"
ON "property_compliance_items"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "properties" AS p
    WHERE p."workspace_id" = "property_compliance_items"."workspace_id"
      AND p."id" = "property_compliance_items"."property_id"
      AND "public"."property_compliance_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        p."responsible_branch_id"
      )
  )
);

-- The three histories: visible with their item; added only by someone who
-- can work on the item's property, as themselves.
CREATE POLICY "property_compliance_assessment_select_in_scope"
ON "property_compliance_assessments"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "property_compliance_items" AS i
    WHERE i."workspace_id" = "property_compliance_assessments"."workspace_id"
      AND i."id" = "property_compliance_assessments"."item_id"
  )
);
CREATE POLICY "property_compliance_assessment_insert_in_scope"
ON "property_compliance_assessments"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "recorded_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "property_compliance_items" AS i
    JOIN "properties" AS p
      ON p."workspace_id" = i."workspace_id" AND p."id" = i."property_id"
    WHERE i."workspace_id" = "property_compliance_assessments"."workspace_id"
      AND i."id" = "property_compliance_assessments"."item_id"
      AND "public"."property_compliance_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        p."responsible_branch_id"
      )
  )
);

CREATE POLICY "property_compliance_evidence_select_in_scope"
ON "property_compliance_evidence"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "property_compliance_items" AS i
    WHERE i."workspace_id" = "property_compliance_evidence"."workspace_id"
      AND i."id" = "property_compliance_evidence"."item_id"
  )
);
CREATE POLICY "property_compliance_evidence_insert_in_scope"
ON "property_compliance_evidence"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "recorded_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "property_compliance_items" AS i
    JOIN "properties" AS p
      ON p."workspace_id" = i."workspace_id" AND p."id" = i."property_id"
    WHERE i."workspace_id" = "property_compliance_evidence"."workspace_id"
      AND i."id" = "property_compliance_evidence"."item_id"
      AND "public"."property_compliance_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        p."responsible_branch_id"
      )
  )
);

CREATE POLICY "property_compliance_status_event_select_in_scope"
ON "property_compliance_status_events"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "property_compliance_items" AS i
    WHERE i."workspace_id" = "property_compliance_status_events"."workspace_id"
      AND i."id" = "property_compliance_status_events"."item_id"
  )
);
CREATE POLICY "property_compliance_status_event_insert_in_scope"
ON "property_compliance_status_events"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "recorded_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "property_compliance_items" AS i
    JOIN "properties" AS p
      ON p."workspace_id" = i."workspace_id" AND p."id" = i."property_id"
    WHERE i."workspace_id" = "property_compliance_status_events"."workspace_id"
      AND i."id" = "property_compliance_status_events"."item_id"
      AND "public"."property_compliance_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        p."responsible_branch_id"
      )
  )
);

-- Read and add only. Revoking the default privileges first leaves exactly
-- these grants.
REVOKE ALL ON TABLE
  "compliance_requirements",
  "property_compliance_items",
  "property_compliance_assessments",
  "property_compliance_evidence",
  "property_compliance_status_events"
FROM "zayto_app";
GRANT SELECT ON TABLE "compliance_requirements" TO "zayto_app";
GRANT SELECT, INSERT ON TABLE
  "property_compliance_items",
  "property_compliance_assessments",
  "property_compliance_evidence",
  "property_compliance_status_events"
TO "zayto_app";
