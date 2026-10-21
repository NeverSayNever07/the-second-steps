-- Keep access and visit instructions separate from the appraisal outcome,
-- and allow a fixed agency fee to be agreed annually.
ALTER TYPE "fee_frequency" ADD VALUE 'annually';

-- Older percentage fees did not record a frequency, so they remain valid.
-- The application requires a frequency on every newly saved fee.
ALTER TABLE "instruction_terms_versions"
DROP CONSTRAINT "instruction_terms_versions_fee_check",
ADD CONSTRAINT "instruction_terms_versions_fee_check" CHECK (
  (
    "fee_kind" IS NULL
    AND "fee_value" IS NULL
    AND "fee_frequency" IS NULL
    AND "fee_vat" IS NULL
  ) OR (
    "fee_kind" = 'percentage'
    AND "fee_value" BETWEEN 1 AND 10000
    AND "fee_vat" IS NOT NULL
  ) OR (
    "fee_kind" = 'fixed'
    AND "fee_value" BETWEEN 1 AND 10000000
    AND "fee_frequency" IS NOT NULL
    AND "fee_vat" IS NOT NULL
  )
);

ALTER TABLE "appraisals"
ADD COLUMN "booking_notes" varchar(2000),
ADD CONSTRAINT "appraisals_booking_notes_check" CHECK (
  "booking_notes" IS NULL OR btrim("booking_notes") <> ''
);
