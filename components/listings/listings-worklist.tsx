import Link from "next/link";
import { ListingStateBadge } from "@/components/listings/listing-state-badge";
import type { ListingListItem } from "@/core/listings/application/listing-list";
import { formatRent } from "@/core/instructions/domain/instruction-labels";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
});

/**
 * Listings as a table from tablet width and stacked cards on a phone. The
 * state says where each is; nothing here means a listing is published.
 */
export function ListingsWorklist({
  items,
  workspacePath,
}: {
  items: readonly ListingListItem[];
  workspacePath: string;
}) {
  const href = (item: ListingListItem) =>
    `${workspacePath}/marketing/${item.id}`;
  return (
    <>
      <ul className="grid gap-3 md:hidden" aria-label="Listings">
        {items.map((item) => (
          <li
            key={item.id}
            className="grid gap-2 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10"
          >
            <Link
              href={href(item)}
              className="font-medium text-primary underline-offset-4 hover:underline [overflow-wrap:anywhere]"
            >
              {item.property.address}
            </Link>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {item.headline || "No headline yet"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ListingStateBadge state={item.state} />
              <span className="text-xs text-muted-foreground">
                {formatRent({
                  askingRentPence: item.advertisedRentPence,
                  rentPeriod: item.rentPeriod,
                })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {item.branch} · {item.instruction.reference} · updated{" "}
              {dateFormat.format(item.stateChangedAt)}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl bg-card shadow-xs ring-1 ring-foreground/10 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Property
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Headline
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Rent
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Stage
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Branch
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <Link
                    href={href(item)}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {item.property.address}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {item.property.postcode} · {item.instruction.reference}
                  </p>
                </td>
                <td className="max-w-64 truncate px-4 py-3 text-muted-foreground">
                  {item.headline || "No headline yet"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatRent({
                    askingRentPence: item.advertisedRentPence,
                    rentPeriod: item.rentPeriod,
                  })}
                </td>
                <td className="px-4 py-3">
                  <ListingStateBadge state={item.state} />
                </td>
                <td className="px-4 py-3">{item.branch}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {dateFormat.format(item.stateChangedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
