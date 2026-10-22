import { Megaphone } from "lucide-react";
import Link from "next/link";
import type { ListingListItem } from "@/core/listings/application/listing-list";
import { formatRent } from "@/core/instructions/domain/instruction-labels";
import { ListingStateBadge } from "./listing-state-badge";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
});

/**
 * Every listing prepared for an instruction, current first, so a property
 * that is marketed again keeps the earlier adverts in view. Nothing here is
 * published: listings are prepared inside Zayto only.
 */
export function InstructionListings({
  items,
  workspacePath,
}: {
  items: readonly ListingListItem[];
  workspacePath: string;
}) {
  if (items.length === 0) return null;
  const ordered = [...items].sort(
    (a, b) =>
      Number(a.state === "withdrawn") - Number(b.state === "withdrawn") ||
      b.stateChangedAt.getTime() - a.stateChangedAt.getTime(),
  );
  return (
    <section className="grid gap-3" aria-labelledby="instruction-listings">
      <div>
        <h2
          id="instruction-listings"
          className="flex items-center gap-2 text-base font-semibold"
        >
          <Megaphone
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Listings for this instruction
        </h2>
        <p className="text-sm text-muted-foreground">
          Each time the property is marketed is a separate listing. Earlier ones
          are kept. Nothing is published.
        </p>
      </div>
      <ul className="grid divide-y border-t">
        {ordered.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium [overflow-wrap:anywhere]">
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`${workspacePath}/marketing/${item.id}`}
                >
                  {item.headline || "No headline yet"}
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatRent({
                  askingRentPence: item.advertisedRentPence,
                  rentPeriod: item.rentPeriod,
                })}{" "}
                · Version {item.versionNo} ·{" "}
                {dateFormat.format(item.stateChangedAt)}
              </p>
            </div>
            <ListingStateBadge state={item.state} />
          </li>
        ))}
      </ul>
    </section>
  );
}
