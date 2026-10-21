import { Badge } from "@/components/ui/badge";
import {
  LISTING_STATE_LABELS,
  type ListingStateCode,
} from "@/core/listings/domain/listing";

const VARIANTS = {
  draft: "secondary",
  content_ready: "info",
  ready_to_advertise: "success",
  withdrawn: "secondary",
} as const;

/** The listing's stage. None of them means it has been published anywhere. */
export function ListingStateBadge({ state }: { state: ListingStateCode }) {
  return <Badge variant={VARIANTS[state]}>{LISTING_STATE_LABELS[state]}</Badge>;
}

/** The note every listing screen carries: nothing here is published. */
export function NotPublishedNote() {
  return (
    <p
      className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
      role="note"
    >
      <span className="font-medium text-foreground">Not published.</span> Zayto
      has not sent this to any website or portal.
    </p>
  );
}
