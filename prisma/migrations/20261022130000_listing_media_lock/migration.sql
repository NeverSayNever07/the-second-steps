-- M5 review fix (2026-10-21): two uploads to the same listing could
-- deadlock. Marking a file stored took FOR SHARE on the listing, then adding
-- its media row asked for FOR UPDATE on it, so two such transactions waited
-- on each other. assert_listing_media_open now takes FOR UPDATE straight
-- away, so media changes on one listing simply queue. Otherwise unchanged
-- from 20261022120000_listing_media.

CREATE OR REPLACE FUNCTION "public"."assert_listing_media_open"(
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
  FOR UPDATE;
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
