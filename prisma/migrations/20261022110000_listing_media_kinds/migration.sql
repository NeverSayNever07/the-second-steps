-- M5 part 1: the document kinds for listing media (owner-approved design
-- 2026-10-21, .cursor/plans/marketing-m0-design.md; ADR-008 amendment).
-- Kept in its own migration because a new enum value cannot be used in the
-- transaction that adds it; the tables and rules that use these kinds are in
-- 20261022120000_listing_media.

ALTER TYPE "document_kind" ADD VALUE 'listing_photo';
ALTER TYPE "document_kind" ADD VALUE 'listing_floorplan';
