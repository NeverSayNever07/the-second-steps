-- An EPC with no energy rating recorded is not marketed (owner decision
-- 2026-10-21). Replaces listing_epc_allows_advertising from
-- 20261022100000_listings_core: reviewed evidence now also needs a rating.
-- Everything else is unchanged. Mirrors epcAdvertisingCheck in
-- core/listings/domain/listing-epc.ts.

CREATE OR REPLACE FUNCTION "public"."listing_epc_allows_advertising"(
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
    -- No rating recorded: not marketed.
    RETURN rating IS NOT NULL AND upper(rating) NOT IN ('F', 'G');
  END IF;
  RETURN false;
END;
$$;
