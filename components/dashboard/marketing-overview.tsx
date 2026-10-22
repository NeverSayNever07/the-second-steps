import { ArrowRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ListingAttention } from "@/core/listings/application/listing-attention";
import { Panel } from "./panel";

/**
 * Where the listings stand. Listings are prepared inside Zayto only: nothing
 * is published, so the figures never say anything is advertised.
 */
export function MarketingOverview({
  attention,
  workspacePath,
}: {
  attention: ListingAttention;
  workspacePath: string;
}) {
  const figures = [
    { label: "Draft", value: attention.draft },
    { label: "Content ready", value: attention.contentReady },
    { label: "Ready to advertise", value: attention.readyToAdvertise },
    {
      label: "Waiting for a listing",
      value: attention.awaitingListing.count,
    },
  ];
  return (
    <div className="grid min-w-0 gap-4">
      <Panel
        title="Listings"
        right={<Badge variant="outline">Not published</Badge>}
      >
        <div className="grid gap-4 p-3">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {figures.map((figure) => (
              <div
                key={figure.label}
                className="min-w-0 rounded-lg bg-muted/50 px-3 py-2"
              >
                <dt className="text-xs text-muted-foreground">
                  {figure.label}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {figure.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            Ready to advertise is an internal stage. Zayto has not sent any
            listing to a website or portal.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            render={<Link href={`${workspacePath}/marketing`} />}
            nativeButton={false}
          >
            <Megaphone aria-hidden="true" />
            Open Marketing
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </Panel>

      {attention.awaitingListing.items.length > 0 && (
        <Panel
          title="Ready to market, no listing yet"
          right={
            <Badge variant="secondary">{attention.awaitingListing.count}</Badge>
          }
        >
          <ul className="divide-y">
            {attention.awaitingListing.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`${workspacePath}/instructions/${item.id}`}
                  className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{item.property}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.reference}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Applicants, viewings and offers"
        right={<Badge variant="outline">Coming in Phase 2</Badge>}
      >
        <p className="p-3 text-sm text-muted-foreground">
          Not built yet, so there are no figures here. Applicant enquiries,
          viewings and offers will appear on this tab.
        </p>
      </Panel>
    </div>
  );
}
