import { Megaphone } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListingsWorklist } from "@/components/listings/listings-worklist";
import { NotPublishedNote } from "@/components/listings/listing-state-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listListings } from "@/core/listings/application/listing-list";
import {
  LISTING_STATES,
  LISTING_STATE_LABELS,
  isListingState,
  type ListingStateCode,
} from "@/core/listings/domain/listing";

const FILTERS: { id: "current" | ListingStateCode; label: string }[] = [
  { id: "current", label: "All current" },
  ...LISTING_STATES.map((state) => ({
    id: state,
    label: LISTING_STATE_LABELS[state].replace(" (internal only)", ""),
  })),
];

export default async function MarketingPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/marketing`;
  const requested = (await searchParams).state;
  const state =
    typeof requested === "string" && isListingState(requested)
      ? requested
      : "current";
  const {
    data: [items],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([listListings({ authSubject: user.id, workspaceSlug, state })]),
  );
  if (!items) redirect("/access-denied");

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Marketing</p>
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adverts prepared inside Zayto from instructions that are Ready to
          market. Start one from the instruction.
        </p>
      </div>
      <NotPublishedNote />
      <nav aria-label="Listing stage" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.id}
            size="sm"
            variant={state === filter.id ? "default" : "outline"}
            render={
              <Link
                href={
                  filter.id === "current" ? path : `${path}?state=${filter.id}`
                }
                aria-current={state === filter.id ? "page" : undefined}
              />
            }
            nativeButton={false}
          >
            {filter.label}
          </Button>
        ))}
      </nav>
      {items.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <Megaphone
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-base font-semibold">No listings here</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {state === "current"
                  ? "Prepare a listing from an instruction that is Ready to market."
                  : "No listings are at this stage."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              render={
                <Link href={`/dashboard/w/${workspaceSlug}/instructions`} />
              }
              nativeButton={false}
            >
              Go to instructions
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ListingsWorklist
          items={items}
          workspacePath={`/dashboard/w/${workspaceSlug}`}
        />
      )}
    </div>
  );
}
