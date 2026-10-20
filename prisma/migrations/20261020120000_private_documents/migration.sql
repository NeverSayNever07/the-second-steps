-- C1: private documents. Owner-approved design (2026-10-20) in
-- .cursor/plans/c0-design-private-documents.md.
--
-- One row is one immutable file in the private documents bucket. The row is
-- written before the file is stored, so a file can never exist without a
-- record. The file's object key is built in code from this row's workspace,
-- id and media type, never from user input. Business history (which agreement
-- or evidence a file backs, replacements, supersession) belongs to the
-- agreement and compliance records added in C2 and C3, not to this table.
--
-- Only the status moves, one way: pending -> stored or failed, and
-- stored -> removed. Every other column is fixed once written. The app role
-- can never delete a row.

CREATE TYPE "document_kind" AS ENUM (
  'instruction_agreement', 'compliance_evidence'
);
CREATE TYPE "document_media" AS ENUM ('pdf', 'jpeg', 'png');
CREATE TYPE "document_status" AS ENUM (
  'pending', 'stored', 'failed', 'removed'
);

-- Routine compliance work (owner decision 2026-10-20): Account Owner, Agency
-- Admin, Branch Manager, Negotiator and Property Manager, not Accounts or
-- Read Only. Kept separate from property.update, which Accounts holds.
CREATE FUNCTION "public"."property_compliance_member_can_work"(
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

-- True for an active member holding any staff role. Documents are staff-only
-- until an explicit document grant exists, so a future landlord, contractor
-- or participant who can see a property never gains its files.
CREATE FUNCTION "public"."document_member_is_staff"("member" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT "public"."instruction_member_has_role"(
    "member",
    NULL,
    ARRAY[
      'workspace_owner', 'agency_admin', 'branch_manager', 'negotiator',
      'property_manager', 'accounts', 'read_only'
    ]::"membership_role_code"[]
  )
$$;

CREATE TABLE "documents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "kind" "document_kind" NOT NULL,
  "instruction_id" uuid,
  "property_id" uuid,
  "display_name" varchar(120) NOT NULL,
  "media_type" "document_media" NOT NULL,
  "byte_size" integer NOT NULL,
  "sha256" char(64) NOT NULL,
  "status" "document_status" NOT NULL DEFAULT 'pending',
  "failure_code" varchar(40),
  "removal_reason" varchar(500),
  "uploaded_by_membership_id" uuid NOT NULL,
  "removed_by_membership_id" uuid,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stored_at" timestamptz(6),
  "ended_at" timestamptz(6),
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documents_workspace_id_id_key" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "documents_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documents_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documents_property_fkey"
    FOREIGN KEY ("workspace_id", "property_id")
    REFERENCES "properties"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documents_uploaded_by_fkey"
    FOREIGN KEY ("workspace_id", "uploaded_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documents_removed_by_fkey"
    FOREIGN KEY ("workspace_id", "removed_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- An agreement belongs to an instruction and is a PDF (owner decision 8);
  -- compliance evidence belongs to a property.
  CONSTRAINT "documents_kind_check" CHECK (
    (
      "kind" = 'instruction_agreement'
      AND "instruction_id" IS NOT NULL
      AND "property_id" IS NULL
      AND "media_type" = 'pdf'
    )
    OR (
      "kind" = 'compliance_evidence'
      AND "property_id" IS NOT NULL
      AND "instruction_id" IS NULL
    )
  ),
  -- Already cleaned by the server; checked again so no path can store a
  -- name that breaks a download header.
  CONSTRAINT "documents_display_name_check" CHECK (
    char_length(btrim("display_name")) BETWEEN 5 AND 120
    AND "display_name" !~ '[[:cntrl:]";\\]'
  ),
  CONSTRAINT "documents_byte_size_check" CHECK (
    "byte_size" BETWEEN 1 AND 10485760
  ),
  CONSTRAINT "documents_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "documents_failure_code_check" CHECK (
    "failure_code" IS NULL OR "failure_code" ~ '^[a-z_]{1,40}$'
  ),
  CONSTRAINT "documents_removal_reason_check" CHECK (
    "removal_reason" IS NULL
    OR char_length(btrim("removal_reason")) BETWEEN 1 AND 500
  ),
  -- Each status carries exactly the columns it needs.
  CONSTRAINT "documents_status_check" CHECK (
    CASE "status"
      WHEN 'pending' THEN
        "stored_at" IS NULL AND "ended_at" IS NULL
        AND "failure_code" IS NULL AND "removal_reason" IS NULL
        AND "removed_by_membership_id" IS NULL
      WHEN 'stored' THEN
        "stored_at" IS NOT NULL AND "ended_at" IS NULL
        AND "failure_code" IS NULL AND "removal_reason" IS NULL
        AND "removed_by_membership_id" IS NULL
      WHEN 'failed' THEN
        "stored_at" IS NULL AND "ended_at" IS NOT NULL
        AND "failure_code" IS NOT NULL AND "removal_reason" IS NULL
        AND "removed_by_membership_id" IS NULL
      WHEN 'removed' THEN
        "stored_at" IS NOT NULL AND "ended_at" IS NOT NULL
        AND "failure_code" IS NULL AND "removal_reason" IS NOT NULL
        AND "removed_by_membership_id" IS NOT NULL
    END
  )
);

CREATE INDEX "documents_instruction_idx"
ON "documents"("workspace_id", "instruction_id");
CREATE INDEX "documents_property_idx"
ON "documents"("workspace_id", "property_id");
CREATE INDEX "documents_status_idx"
ON "documents"("workspace_id", "status", "created_at");
CREATE INDEX "documents_uploaded_by_idx"
ON "documents"("workspace_id", "uploaded_by_membership_id");
CREATE INDEX "documents_removed_by_idx"
ON "documents"("workspace_id", "removed_by_membership_id");

-- The linked record is visible and still open: a current instruction, or an
-- active property. FOR SHARE waits for an ending or archiving in progress, so
-- nothing attaches to a record another transaction is closing.
CREATE FUNCTION "public"."assert_document_record_open"(
  "workspace" uuid,
  "instruction" uuid,
  "property" uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  instruction_ended date;
  property_state "property_status";
BEGIN
  IF "instruction" IS NOT NULL THEN
    SELECT "ended_on" INTO instruction_ended
    FROM "instructions"
    WHERE "workspace_id" = "workspace" AND "id" = "instruction"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'documents must belong to a visible instruction'
        USING ERRCODE = '42501';
    END IF;
    IF instruction_ended IS NOT NULL THEN
      RAISE EXCEPTION 'an ended instruction cannot gain documents'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT "status" INTO property_state
    FROM "properties"
    WHERE "workspace_id" = "workspace" AND "id" = "property"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'documents must belong to a visible property'
        USING ERRCODE = '42501';
    END IF;
    IF property_state <> 'active' THEN
      RAISE EXCEPTION 'an archived property cannot gain documents'
        USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$$;

-- A new document starts pending, on an open record, with database times.
CREATE FUNCTION "public"."prepare_document"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."status" <> 'pending' THEN
    RAISE EXCEPTION 'a new document starts as pending'
      USING ERRCODE = '23514';
  END IF;
  PERFORM "public"."assert_document_record_open"(
    NEW."workspace_id", NEW."instruction_id", NEW."property_id"
  );
  NEW."created_at" := transaction_timestamp();
  NEW."stored_at" := NULL;
  NEW."ended_at" := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "documents_prepare"
BEFORE INSERT ON "documents"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_document"();

-- Only the status moves, and each change has its own rule:
--   pending -> stored   the uploader, while the record is still open
--   pending -> failed   the uploader; or another member who can work on the
--                       record, only as 'abandoned' after an hour
--   stored  -> removed  the current member, as remover, with a reason
-- The database sets the times.
CREATE FUNCTION "public"."enforce_document_rules"()
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
    NEW."ended_at" := transaction_timestamp();
  ELSE
    RAISE EXCEPTION 'this document status change is not allowed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "documents_enforce_rules"
BEFORE UPDATE ON "documents"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_document_rules"();

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;

-- Staff who can see the instruction or property can see its documents
-- (owner decisions 13 and 27). The linked tables' own policies supply the
-- branch scope.
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
  )
);

-- Uploaded by the current member, who can work on the linked record.
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
  )
);

-- Status changes by a member who can work on the linked record; the trigger
-- decides which change that member may make.
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
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

-- The app may add documents and change only the status columns. Revoking the
-- table-wide UPDATE from the default privileges first leaves only the
-- column grant. Rows are never deleted by the app.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "documents" FROM "zayto_app";
GRANT SELECT, INSERT ON TABLE "documents" TO "zayto_app";
GRANT UPDATE (
  "status", "failure_code", "removal_reason", "removed_by_membership_id"
) ON TABLE "documents" TO "zayto_app";
