-- M5 part 2: listing photos and floorplans. Owner-approved design
-- (2026-10-21) in .cursor/plans/marketing-m0-design.md; ADR-008 amendment
-- (staff-only preview, nothing public).
--
-- A listing's photos and floorplans are private documents of two new kinds,
-- each belonging to one listing. Their order, caption and removal live in
-- listing_media, because the document rows themselves never change. Media
-- cannot change while a listing is Ready to advertise (return it to Draft
-- first), so what was reviewed is what it holds. A file that backs listing
-- media can be removed only after its media row is removed. Ready to
-- advertise now needs at least 5 photos and 1 floorplan.
--
-- The shared document rules are recreated with listing arms; every earlier
-- rule for agreements and compliance evidence is kept unchanged.

CREATE TYPE "listing_media_role" AS ENUM ('photo', 'floorplan');

ALTER TABLE "documents" ADD COLUMN "listing_id" uuid;
ALTER TABLE "documents" ADD CONSTRAINT "documents_listing_fkey"
  FOREIGN KEY ("workspace_id", "listing_id")
  REFERENCES "listings"("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "documents_listing_idx"
ON "documents"("workspace_id", "listing_id");

-- Each kind belongs to exactly one kind of record: an agreement to an
-- instruction and is a PDF; compliance evidence to a property; a listing
-- photo to a listing and is JPEG or PNG; a floorplan to a listing.
ALTER TABLE "documents" DROP CONSTRAINT "documents_kind_check";
ALTER TABLE "documents" ADD CONSTRAINT "documents_kind_check" CHECK (
  (
    "kind" = 'instruction_agreement'
    AND "instruction_id" IS NOT NULL
    AND "property_id" IS NULL
    AND "listing_id" IS NULL
    AND "media_type" = 'pdf'
  )
  OR (
    "kind" = 'compliance_evidence'
    AND "property_id" IS NOT NULL
    AND "instruction_id" IS NULL
    AND "listing_id" IS NULL
  )
  OR (
    "kind" = 'listing_photo'
    AND "listing_id" IS NOT NULL
    AND "instruction_id" IS NULL
    AND "property_id" IS NULL
    AND "media_type" IN ('jpeg', 'png')
  )
  OR (
    "kind" = 'listing_floorplan'
    AND "listing_id" IS NOT NULL
    AND "instruction_id" IS NULL
    AND "property_id" IS NULL
  )
);

-- A listing that media may be added to: visible and not withdrawn, and not
-- Ready to advertise. FOR SHARE waits for a state change in progress.
CREATE FUNCTION "public"."assert_listing_media_open"(
  "workspace" uuid,
  "listing" uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_state "listing_state";
BEGIN
  SELECT "state" INTO current_state
  FROM "listings"
  WHERE "workspace_id" = "workspace" AND "id" = "listing"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing media must belong to a visible listing'
      USING ERRCODE = '42501';
  END IF;
  IF current_state = 'withdrawn' THEN
    RAISE EXCEPTION 'a withdrawn listing cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF current_state = 'ready_to_advertise' THEN
    RAISE EXCEPTION 'return the listing to Draft before changing its media'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- C1's rule for a new document, with a listing arm.
CREATE OR REPLACE FUNCTION "public"."prepare_document"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."status" <> 'pending' THEN
    RAISE EXCEPTION 'a new document starts as pending'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."listing_id" IS NOT NULL THEN
    PERFORM "public"."assert_listing_media_open"(
      NEW."workspace_id", NEW."listing_id"
    );
  ELSE
    PERFORM "public"."assert_document_record_open"(
      NEW."workspace_id", NEW."instruction_id", NEW."property_id"
    );
  END IF;
  NEW."created_at" := transaction_timestamp();
  NEW."stored_at" := NULL;
  NEW."ended_at" := NULL;
  RETURN NEW;
END;
$$;

-- C1, C2 and C3's document rules, with: the listing never changes, a
-- listing file is stored only while its listing takes media, and a listing
-- file is removed only once its media row is removed.
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
    OR NEW."listing_id" IS DISTINCT FROM OLD."listing_id"
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
    IF OLD."listing_id" IS NOT NULL THEN
      PERFORM "public"."assert_listing_media_open"(
        OLD."workspace_id", OLD."listing_id"
      );
    ELSE
      PERFORM "public"."assert_document_record_open"(
        OLD."workspace_id", OLD."instruction_id", OLD."property_id"
      );
    END IF;
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
    -- The remover can work on the instruction, property or listing (update
    -- policy), so can see its agreements, compliance records and media:
    -- these checks are never blind.
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
    IF EXISTS (
      SELECT 1 FROM "listing_media"
      WHERE "workspace_id" = OLD."workspace_id"
        AND "document_id" = OLD."id"
        AND "removed_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'remove the listing photo or floorplan first'
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

CREATE TABLE "listing_media" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  -- Set by the database from the document's kind.
  "role" "listing_media_role" NOT NULL,
  "position" integer NOT NULL,
  -- Shown as the image's alternative text.
  "caption" varchar(200) NOT NULL DEFAULT '',
  "added_by_membership_id" uuid NOT NULL,
  "added_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_at" timestamptz(6),
  "removed_by_membership_id" uuid,
  "removed_reason" varchar(500),
  CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_media_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "listing_media_document_key" UNIQUE ("workspace_id", "document_id"),
  CONSTRAINT "listing_media_listing_fkey"
    FOREIGN KEY ("workspace_id", "listing_id")
    REFERENCES "listings"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_media_document_fkey"
    FOREIGN KEY ("workspace_id", "document_id")
    REFERENCES "documents"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_media_added_by_fkey"
    FOREIGN KEY ("workspace_id", "added_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_media_removed_by_fkey"
    FOREIGN KEY ("workspace_id", "removed_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listing_media_position_check" CHECK ("position" BETWEEN 1 AND 1000),
  CONSTRAINT "listing_media_caption_check" CHECK (
    "caption" !~ '[[:cntrl:]]'
  ),
  CONSTRAINT "listing_media_removed_check" CHECK (
    (
      "removed_at" IS NULL
      AND "removed_by_membership_id" IS NULL
      AND "removed_reason" IS NULL
    ) OR (
      "removed_at" IS NOT NULL
      AND "removed_by_membership_id" IS NOT NULL
      AND char_length(btrim("removed_reason")) BETWEEN 1 AND 500
    )
  )
);

CREATE INDEX "listing_media_order_idx"
ON "listing_media"("workspace_id", "listing_id", "role", "position", "id");
CREATE INDEX "listing_media_added_by_idx"
ON "listing_media"("workspace_id", "added_by_membership_id");
CREATE INDEX "listing_media_removed_by_idx"
ON "listing_media"("workspace_id", "removed_by_membership_id");

-- New media: the uploader's own stored listing file for this listing, on a
-- listing that takes media, within the caps (30 photos, 3 floorplans). The
-- role comes from the document's kind. FOR UPDATE on the listing serialises
-- additions, so the caps hold.
CREATE FUNCTION "public"."prepare_listing_media"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  file_kind "document_kind";
  current_count integer;
BEGIN
  PERFORM "public"."assert_listing_media_open"(
    NEW."workspace_id", NEW."listing_id"
  );
  PERFORM 1 FROM "listings"
  WHERE "workspace_id" = NEW."workspace_id" AND "id" = NEW."listing_id"
  FOR UPDATE;

  SELECT "kind" INTO file_kind
  FROM "documents"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "id" = NEW."document_id"
    AND "listing_id" = NEW."listing_id"
    AND "status" = 'stored'
    AND "uploaded_by_membership_id" = NEW."added_by_membership_id"
  FOR SHARE;
  IF file_kind IS NULL THEN
    RAISE EXCEPTION 'listing media needs its own stored file on this listing'
      USING ERRCODE = '23514';
  END IF;
  NEW."role" := CASE file_kind
    WHEN 'listing_photo' THEN 'photo'::"listing_media_role"
    ELSE 'floorplan'::"listing_media_role"
  END;

  SELECT count(*) INTO current_count
  FROM "listing_media"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "listing_id" = NEW."listing_id"
    AND "role" = NEW."role"
    AND "removed_at" IS NULL;
  IF (NEW."role" = 'photo' AND current_count >= 30)
    OR (NEW."role" = 'floorplan' AND current_count >= 3)
  THEN
    RAISE EXCEPTION 'this listing already has the most media allowed'
      USING ERRCODE = '23514';
  END IF;

  NEW."added_at" := transaction_timestamp();
  NEW."removed_at" := NULL;
  NEW."removed_by_membership_id" := NULL;
  NEW."removed_reason" := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listing_media_prepare"
BEFORE INSERT ON "listing_media"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_listing_media"();

-- Only the order, the caption and a one-way removal change, while the
-- listing takes media. A removed row is final.
CREATE FUNCTION "public"."enforce_listing_media_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."workspace_id" <> OLD."workspace_id"
    OR NEW."listing_id" <> OLD."listing_id"
    OR NEW."document_id" <> OLD."document_id"
    OR NEW."role" <> OLD."role"
    OR NEW."added_by_membership_id" <> OLD."added_by_membership_id"
    OR NEW."added_at" <> OLD."added_at"
  THEN
    RAISE EXCEPTION 'listing media details cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."removed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'removed listing media cannot change'
      USING ERRCODE = '23514';
  END IF;
  PERFORM "public"."assert_listing_media_open"(
    OLD."workspace_id", OLD."listing_id"
  );
  IF NEW."removed_reason" IS NOT NULL THEN
    IF actor IS NULL THEN
      RAISE EXCEPTION 'listing media is removed by the current member'
        USING ERRCODE = '42501';
    END IF;
    NEW."removed_at" := transaction_timestamp();
    NEW."removed_by_membership_id" := actor;
  ELSE
    NEW."removed_at" := NULL;
    NEW."removed_by_membership_id" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listing_media_enforce_rules"
BEFORE UPDATE ON "listing_media"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_listing_media_rules"();

-- Ready to advertise needs at least 5 photos and 1 floorplan whose files
-- are still stored (owner decision 2026-10-21). Mirrors MEDIA_RULES in
-- core/listings/domain/listing-rules.ts. Replaces the M2 placeholder.
CREATE OR REPLACE FUNCTION "public"."listing_media_complete"(
  "workspace" uuid,
  "listing" uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    (
      SELECT count(*) FROM "listing_media" AS m
      JOIN "documents" AS d
        ON d."workspace_id" = m."workspace_id" AND d."id" = m."document_id"
      WHERE m."workspace_id" = "workspace" AND m."listing_id" = "listing"
        AND m."role" = 'photo' AND m."removed_at" IS NULL
        AND d."status" = 'stored'
    ) >= 5
    AND (
      SELECT count(*) FROM "listing_media" AS m
      JOIN "documents" AS d
        ON d."workspace_id" = m."workspace_id" AND d."id" = m."document_id"
      WHERE m."workspace_id" = "workspace" AND m."listing_id" = "listing"
        AND m."role" = 'floorplan' AND m."removed_at" IS NULL
        AND d."status" = 'stored'
    ) >= 1
$$;

ALTER TABLE "listing_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_media" FORCE ROW LEVEL SECURITY;

-- Visible with the listing; added and changed only by someone who can
-- prepare listings on its branch, as themselves.
CREATE POLICY "listing_media_select_in_scope" ON "listing_media"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "listings" AS l
    WHERE l."workspace_id" = "listing_media"."workspace_id"
      AND l."id" = "listing_media"."listing_id"
  )
);
CREATE POLICY "listing_media_insert_in_scope" ON "listing_media"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "added_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "listings" AS l
    JOIN "instructions" AS i
      ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
    WHERE l."workspace_id" = "listing_media"."workspace_id"
      AND l."id" = "listing_media"."listing_id"
      AND "public"."listing_member_can_prepare"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);
CREATE POLICY "listing_media_update_in_scope" ON "listing_media"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "listings" AS l
    JOIN "instructions" AS i
      ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
    WHERE l."workspace_id" = "listing_media"."workspace_id"
      AND l."id" = "listing_media"."listing_id"
      AND "public"."listing_member_can_prepare"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

-- The documents policies again, each with a listing arm: staff who can see
-- the listing see its files; only someone who can prepare listings on its
-- branch uploads or changes them.
DROP POLICY "document_select_in_scope" ON "documents";
DROP POLICY "document_insert_in_scope" ON "documents";
DROP POLICY "document_update_in_scope" ON "documents";

CREATE POLICY "document_select_in_scope" ON "documents"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "public"."document_member_is_staff"(
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  )
  AND (
    (
      "kind" = 'instruction_agreement'
      AND EXISTS (
        SELECT 1 FROM "instructions" AS i
        WHERE i."workspace_id" = "documents"."workspace_id"
          AND i."id" = "documents"."instruction_id"
      )
    )
    OR (
      "kind" = 'compliance_evidence'
      AND EXISTS (
        SELECT 1 FROM "properties" AS p
        WHERE p."workspace_id" = "documents"."workspace_id"
          AND p."id" = "documents"."property_id"
      )
    )
    OR (
      "kind" IN ('listing_photo', 'listing_floorplan')
      AND EXISTS (
        SELECT 1 FROM "listings" AS l
        WHERE l."workspace_id" = "documents"."workspace_id"
          AND l."id" = "documents"."listing_id"
      )
    )
  )
);

CREATE POLICY "document_insert_in_scope" ON "documents"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "uploaded_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND (
    (
      "kind" = 'instruction_agreement'
      AND EXISTS (
        SELECT 1 FROM "instructions" AS i
        WHERE i."workspace_id" = "documents"."workspace_id"
          AND i."id" = "documents"."instruction_id"
          AND "public"."instruction_member_can_work"(
            NULLIF(current_setting('app.membership_id', true), '')::uuid,
            i."responsible_branch_id"
          )
      )
    )
    OR (
      "kind" = 'compliance_evidence'
      AND EXISTS (
        SELECT 1 FROM "properties" AS p
        WHERE p."workspace_id" = "documents"."workspace_id"
          AND p."id" = "documents"."property_id"
          AND "public"."property_compliance_member_can_work"(
            NULLIF(current_setting('app.membership_id', true), '')::uuid,
            p."responsible_branch_id"
          )
      )
    )
    OR (
      "kind" IN ('listing_photo', 'listing_floorplan')
      AND EXISTS (
        SELECT 1
        FROM "listings" AS l
        JOIN "instructions" AS i
          ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
        WHERE l."workspace_id" = "documents"."workspace_id"
          AND l."id" = "documents"."listing_id"
          AND "public"."listing_member_can_prepare"(
            NULLIF(current_setting('app.membership_id', true), '')::uuid,
            i."responsible_branch_id"
          )
      )
    )
  )
);

CREATE POLICY "document_update_in_scope" ON "documents"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND (
    (
      "kind" = 'instruction_agreement'
      AND EXISTS (
        SELECT 1 FROM "instructions" AS i
        WHERE i."workspace_id" = "documents"."workspace_id"
          AND i."id" = "documents"."instruction_id"
          AND "public"."instruction_member_can_work"(
            NULLIF(current_setting('app.membership_id', true), '')::uuid,
            i."responsible_branch_id"
          )
      )
    )
    OR (
      "kind" = 'compliance_evidence'
      AND EXISTS (
        SELECT 1 FROM "properties" AS p
        WHERE p."workspace_id" = "documents"."workspace_id"
          AND p."id" = "documents"."property_id"
          AND "public"."property_compliance_member_can_work"(
            NULLIF(current_setting('app.membership_id', true), '')::uuid,
            p."responsible_branch_id"
          )
      )
    )
    OR (
      "kind" IN ('listing_photo', 'listing_floorplan')
      AND EXISTS (
        SELECT 1
        FROM "listings" AS l
        JOIN "instructions" AS i
          ON i."workspace_id" = l."workspace_id" AND i."id" = l."instruction_id"
        WHERE l."workspace_id" = "documents"."workspace_id"
          AND l."id" = "documents"."listing_id"
          AND "public"."listing_member_can_prepare"(
            NULLIF(current_setting('app.membership_id', true), '')::uuid,
            i."responsible_branch_id"
          )
      )
    )
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

-- The app adds media and changes only its order, caption and removal
-- reason; the database sets the rest. Rows are never deleted.
REVOKE ALL ON TABLE "listing_media" FROM "zayto_app";
GRANT SELECT, INSERT ON TABLE "listing_media" TO "zayto_app";
GRANT UPDATE ("position", "caption", "removed_reason")
ON TABLE "listing_media" TO "zayto_app";
