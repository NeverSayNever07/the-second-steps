-- C2: externally signed landlord agreements. Owner-approved design
-- (2026-10-20) in .cursor/plans/c2-design-landlord-agreements.md.
--
-- One row is one uploaded agreement PDF (a C1 document) for an instruction.
-- The database records which terms version, material terms and landlords the
-- PDF covers when it is uploaded; the app never supplies them. A draft is
-- completed (signatures confirmed, signed date entered) or discarded, and
-- nothing else: a completed agreement never changes. A later completed
-- agreement supersedes the earlier one by linking to it.
--
-- Ready to market now needs a completed agreement whose material terms and
-- landlords still match the instruction's current ones. A hand-recorded
-- Signed milestone and the manager agreement exception no longer count, and
-- neither can be added. Existing rows are not changed here (owner decision 4,
-- revised 2026-10-20): Ready-to-market instructions are moved back by hand.

CREATE TYPE "instruction_agreement_state" AS ENUM (
  'draft', 'completed', 'discarded'
);

-- What an agreement must match (owner decision 1): service, the management
-- fee (kind, value, frequency, VAT), the extra charges and the set of current
-- landlords. Asking rent, rent period and deposits are deliberately left out.
-- Read through the caller's row security, like the checklist.
CREATE FUNCTION "public"."instruction_material_fingerprint"(
  "workspace" uuid,
  "instruction" uuid
)
RETURNS char(64)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT encode(
    sha256(convert_to(jsonb_build_object(
      'service', t."service",
      'fee_kind', t."fee_kind",
      'fee_value', t."fee_value",
      'fee_frequency', t."fee_frequency",
      'fee_vat', t."fee_vat",
      'charges', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_array(c."name", c."amount_pence", c."vat")
          ORDER BY c."name", c."amount_pence", c."vat"
        )
        FROM "instruction_terms_charges" AS c
        WHERE c."workspace_id" = t."workspace_id"
          AND c."terms_version_id" = t."id"
      ), '[]'::jsonb),
      'landlords', COALESCE((
        SELECT jsonb_agg(p."contact_id" ORDER BY p."contact_id")
        FROM "instruction_parties" AS p
        WHERE p."workspace_id" = "workspace"
          AND p."instruction_id" = "instruction"
          AND p."removed_at" IS NULL
      ), '[]'::jsonb)
    )::text, 'UTF8')),
    'hex'
  )
  FROM (
    SELECT * FROM "instruction_terms_versions"
    WHERE "workspace_id" = "workspace" AND "instruction_id" = "instruction"
    ORDER BY "created_at" DESC, "id" DESC
    LIMIT 1
  ) AS t
$$;

CREATE TABLE "instruction_agreements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "instruction_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "terms_version_id" uuid NOT NULL,
  "material_fingerprint" char(64) NOT NULL,
  -- The landlords who must have signed (owner decision 2), sorted.
  "signatory_contact_ids" uuid[] NOT NULL,
  "state" "instruction_agreement_state" NOT NULL DEFAULT 'draft',
  "signed_on" date,
  "completed_by_membership_id" uuid,
  "completed_at" timestamptz(6),
  "supersedes_agreement_id" uuid,
  "discarded_by_membership_id" uuid,
  "discarded_at" timestamptz(6),
  "discard_reason" varchar(500),
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_agreements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_agreements_workspace_id_id_key"
    UNIQUE ("workspace_id", "id"),
  CONSTRAINT "instruction_agreements_document_key"
    UNIQUE ("workspace_id", "document_id"),
  CONSTRAINT "instruction_agreements_instruction_fkey"
    FOREIGN KEY ("workspace_id", "instruction_id")
    REFERENCES "instructions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreements_document_fkey"
    FOREIGN KEY ("workspace_id", "document_id")
    REFERENCES "documents"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreements_terms_fkey"
    FOREIGN KEY ("workspace_id", "terms_version_id")
    REFERENCES "instruction_terms_versions"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreements_supersedes_fkey"
    FOREIGN KEY ("workspace_id", "supersedes_agreement_id")
    REFERENCES "instruction_agreements"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreements_created_by_fkey"
    FOREIGN KEY ("workspace_id", "created_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreements_completed_by_fkey"
    FOREIGN KEY ("workspace_id", "completed_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreements_discarded_by_fkey"
    FOREIGN KEY ("workspace_id", "discarded_by_membership_id")
    REFERENCES "memberships"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instruction_agreements_fingerprint_check" CHECK (
    "material_fingerprint" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "instruction_agreements_signatories_check" CHECK (
    cardinality("signatory_contact_ids") >= 1
    AND array_position("signatory_contact_ids", NULL) IS NULL
  ),
  CONSTRAINT "instruction_agreements_discard_reason_check" CHECK (
    "discard_reason" IS NULL
    OR char_length(btrim("discard_reason")) BETWEEN 1 AND 500
  ),
  -- Each state carries exactly the columns it needs.
  CONSTRAINT "instruction_agreements_state_check" CHECK (
    CASE "state"
      WHEN 'draft' THEN
        "signed_on" IS NULL AND "completed_by_membership_id" IS NULL
        AND "completed_at" IS NULL AND "supersedes_agreement_id" IS NULL
        AND "discarded_by_membership_id" IS NULL AND "discarded_at" IS NULL
        AND "discard_reason" IS NULL
      WHEN 'completed' THEN
        "signed_on" IS NOT NULL AND "completed_by_membership_id" IS NOT NULL
        AND "completed_at" IS NOT NULL
        AND "discarded_by_membership_id" IS NULL AND "discarded_at" IS NULL
        AND "discard_reason" IS NULL
      WHEN 'discarded' THEN
        "signed_on" IS NULL AND "completed_by_membership_id" IS NULL
        AND "completed_at" IS NULL AND "supersedes_agreement_id" IS NULL
        AND "discarded_by_membership_id" IS NOT NULL
        AND "discarded_at" IS NOT NULL AND "discard_reason" IS NOT NULL
    END
  )
);

CREATE INDEX "instruction_agreements_instruction_idx"
ON "instruction_agreements"("workspace_id", "instruction_id");
CREATE INDEX "instruction_agreements_terms_idx"
ON "instruction_agreements"("workspace_id", "terms_version_id");
CREATE INDEX "instruction_agreements_created_by_idx"
ON "instruction_agreements"("workspace_id", "created_by_membership_id");
CREATE INDEX "instruction_agreements_completed_by_idx"
ON "instruction_agreements"("workspace_id", "completed_by_membership_id");
CREATE INDEX "instruction_agreements_discarded_by_idx"
ON "instruction_agreements"("workspace_id", "discarded_by_membership_id");
-- One draft at a time per instruction, and each agreement is superseded at
-- most once.
CREATE UNIQUE INDEX "instruction_agreements_one_draft"
ON "instruction_agreements"("workspace_id", "instruction_id")
WHERE "state" = 'draft';
CREATE UNIQUE INDEX "instruction_agreements_superseded_once"
ON "instruction_agreements"("workspace_id", "supersedes_agreement_id")
WHERE "supersedes_agreement_id" IS NOT NULL;

-- A new agreement is a draft for a stored agreement PDF on the same
-- instruction, uploaded by the same member. What it covers is read from the
-- instruction now, never taken from the app.
CREATE FUNCTION "public"."prepare_instruction_agreement"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."state" <> 'draft' THEN
    RAISE EXCEPTION 'a new agreement starts as a draft'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM "documents"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "id" = NEW."document_id"
    AND "kind" = 'instruction_agreement'
    AND "instruction_id" = NEW."instruction_id"
    AND "status" = 'stored'
    AND "uploaded_by_membership_id" = NEW."created_by_membership_id"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an agreement needs its own stored PDF on this instruction'
      USING ERRCODE = '23514';
  END IF;

  SELECT "id" INTO NEW."terms_version_id"
  FROM "instruction_terms_versions"
  WHERE "workspace_id" = NEW."workspace_id"
    AND "instruction_id" = NEW."instruction_id"
  ORDER BY "created_at" DESC, "id" DESC
  LIMIT 1;
  NEW."material_fingerprint" := "public"."instruction_material_fingerprint"(
    NEW."workspace_id", NEW."instruction_id"
  );
  NEW."signatory_contact_ids" := ARRAY(
    SELECT "contact_id" FROM "instruction_parties"
    WHERE "workspace_id" = NEW."workspace_id"
      AND "instruction_id" = NEW."instruction_id"
      AND "removed_at" IS NULL
    ORDER BY "contact_id"
  );
  RETURN NEW;
END;
$$;

-- *_check_instruction runs first (name order): the instruction is visible
-- and current, and the database sets created_at.
CREATE TRIGGER "instruction_agreements_check_instruction"
BEFORE INSERT ON "instruction_agreements"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_record"();
CREATE TRIGGER "instruction_agreements_prepare"
BEFORE INSERT ON "instruction_agreements"
FOR EACH ROW EXECUTE FUNCTION "public"."prepare_instruction_agreement"();

-- Only a draft changes, once, by the current member:
--   draft -> completed  signed date not in the future, and the instruction's
--                       material terms and landlords still match the upload
--   draft -> discarded  with a reason
-- The database sets the actor, times and the agreement superseded.
CREATE FUNCTION "public"."enforce_instruction_agreement_rules"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
  instruction_ended date;
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
    OR NEW."instruction_id" IS DISTINCT FROM OLD."instruction_id"
    OR NEW."document_id" IS DISTINCT FROM OLD."document_id"
    OR NEW."terms_version_id" IS DISTINCT FROM OLD."terms_version_id"
    OR NEW."material_fingerprint" IS DISTINCT FROM OLD."material_fingerprint"
    OR NEW."signatory_contact_ids" IS DISTINCT FROM OLD."signatory_contact_ids"
    OR NEW."created_by_membership_id"
      IS DISTINCT FROM OLD."created_by_membership_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'what an agreement covers cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."state" <> 'draft' THEN
    RAISE EXCEPTION 'a completed or discarded agreement cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'an agreement is changed by the current member'
      USING ERRCODE = '42501';
  END IF;

  SELECT "ended_on" INTO instruction_ended
  FROM "instructions"
  WHERE "workspace_id" = OLD."workspace_id" AND "id" = OLD."instruction_id"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'instruction records must belong to a visible instruction'
      USING ERRCODE = '42501';
  END IF;
  IF instruction_ended IS NOT NULL THEN
    RAISE EXCEPTION 'an ended instruction cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  NEW."completed_by_membership_id" := NULL;
  NEW."completed_at" := NULL;
  NEW."supersedes_agreement_id" := NULL;
  NEW."discarded_by_membership_id" := NULL;
  NEW."discarded_at" := NULL;

  IF NEW."state" = 'completed' THEN
    IF NEW."signed_on" > "public"."uk_today"() THEN
      RAISE EXCEPTION 'the signed date cannot be in the future'
        USING ERRCODE = '23514';
    END IF;
    IF "public"."instruction_material_fingerprint"(
      OLD."workspace_id", OLD."instruction_id"
    ) IS DISTINCT FROM OLD."material_fingerprint" THEN
      RAISE EXCEPTION 'the terms or landlords changed after this upload'
        USING ERRCODE = '23514';
    END IF;
    NEW."completed_by_membership_id" := actor;
    NEW."completed_at" := transaction_timestamp();
    SELECT "id" INTO NEW."supersedes_agreement_id"
    FROM "instruction_agreements"
    WHERE "workspace_id" = OLD."workspace_id"
      AND "instruction_id" = OLD."instruction_id"
      AND "state" = 'completed'
    ORDER BY "completed_at" DESC, "id" DESC
    LIMIT 1;
  ELSIF NEW."state" = 'discarded' THEN
    NEW."discarded_by_membership_id" := actor;
    NEW."discarded_at" := transaction_timestamp();
  ELSE
    RAISE EXCEPTION 'this agreement change is not allowed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_agreements_enforce_rules"
BEFORE UPDATE ON "instruction_agreements"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_instruction_agreement_rules"();

-- The Ready to market checklist (owner-approved 2026-10-16, agreement rule
-- replaced by C2 on 2026-10-20): lead staff member; a main landlord contact;
-- current terms with service, asking rent, primary fee and VAT, a deposit
-- offering and a deposit amount where a standard deposit is offered; a
-- completed agreement matching the current material terms and landlords (no
-- exception); a verified ownership check or a manager exception.
CREATE OR REPLACE FUNCTION "public"."instruction_checklist_complete"(
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
        SELECT a."material_fingerprint" FROM "instruction_agreements" AS a
        WHERE a."workspace_id" = i."workspace_id"
          AND a."instruction_id" = i."id"
          AND a."state" = 'completed'
        ORDER BY a."completed_at" DESC, a."id" DESC
        LIMIT 1
      ) = "public"."instruction_material_fingerprint"(i."workspace_id", i."id")
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

CREATE CONSTRAINT TRIGGER "instruction_agreements_assert_consistent"
AFTER INSERT OR UPDATE ON "instruction_agreements"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."assert_instruction_consistent"();

-- Signed now comes only from a completed agreement (owner decision 3).
-- Prepared and Sent continue; correcting backwards still needs a reason.
CREATE OR REPLACE FUNCTION "public"."prepare_instruction_agreement_event"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  latest "instruction_agreement_status";
BEGIN
  IF NEW."to_status" = 'signed' THEN
    RAISE EXCEPTION 'a signed agreement is recorded by uploading it'
      USING ERRCODE = '23514';
  END IF;
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

-- No role may stand in for the agreement evidence (owner decision
-- 2026-10-20). Earlier agreement exceptions stay as history but no longer
-- count; the ownership-check exception is unchanged.
CREATE FUNCTION "public"."refuse_agreement_exception"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW."kind" = 'agreement' THEN
    RAISE EXCEPTION 'a missing agreement cannot be excepted'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "instruction_exceptions_refuse_agreement"
BEFORE INSERT ON "instruction_exceptions"
FOR EACH ROW EXECUTE FUNCTION "public"."refuse_agreement_exception"();

-- C1's document rules, plus: a document linked to an agreement can be
-- removed only once that agreement is discarded, so a completed agreement
-- (or a draft still in use) never loses its file.
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
    -- The remover can work on the instruction (update policy), so can see
    -- its agreements: this check is never blind.
    IF EXISTS (
      SELECT 1 FROM "instruction_agreements"
      WHERE "workspace_id" = OLD."workspace_id"
        AND "document_id" = OLD."id"
        AND "state" <> 'discarded'
    ) THEN
      RAISE EXCEPTION 'a document backing an agreement cannot be removed'
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

ALTER TABLE "instruction_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instruction_agreements" FORCE ROW LEVEL SECURITY;

-- Visible with the instruction; written only by someone who can work on it,
-- as themselves.
CREATE POLICY "instruction_agreement_record_select_in_scope"
ON "instruction_agreements"
FOR SELECT USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_agreements"."workspace_id"
      AND i."id" = "instruction_agreements"."instruction_id"
  )
);
CREATE POLICY "instruction_agreement_record_insert_in_scope"
ON "instruction_agreements"
FOR INSERT WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND "created_by_membership_id" =
    NULLIF(current_setting('app.membership_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_agreements"."workspace_id"
      AND i."id" = "instruction_agreements"."instruction_id"
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
);
CREATE POLICY "instruction_agreement_record_update_in_scope"
ON "instruction_agreements"
FOR UPDATE USING (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM "instructions" AS i
    WHERE i."workspace_id" = "instruction_agreements"."workspace_id"
      AND i."id" = "instruction_agreements"."instruction_id"
      AND "public"."instruction_member_can_work"(
        NULLIF(current_setting('app.membership_id', true), '')::uuid,
        i."responsible_branch_id"
      )
  )
) WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
);

-- The app may add agreements and change only the state, signed date and
-- discard reason; the triggers set everything else. Rows are never deleted.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "instruction_agreements"
FROM "zayto_app";
GRANT SELECT, INSERT ON TABLE "instruction_agreements" TO "zayto_app";
GRANT UPDATE ("state", "signed_on", "discard_reason")
ON TABLE "instruction_agreements" TO "zayto_app";
