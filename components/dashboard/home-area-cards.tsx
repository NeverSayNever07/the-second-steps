import { ArrowRight, Inbox, Megaphone } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { COMING_SOON, type ComingSoonArea } from "./coming-soon-tab";
import { dashboardTabHref } from "./dashboard-tabs";

type Figure = {
  label: string;
  value: number;
  tone?: "warning";
};

const CARD =
  "grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10";

/**
 * One card per area. Landlords & instructions and Marketing have real
 * numbers; the areas that are not built yet say so and show no figures.
 */
export function HomeAreaCards({
  landlords,
  marketing,
  workspacePath,
}: {
  /** Null when the viewer may not read leads or instructions. */
  landlords: { figures: Figure[] } | null;
  /** Null when the viewer may not read listings. */
  marketing: { figures: Figure[] } | null;
  workspacePath: string;
}) {
  const later = (Object.keys(COMING_SOON) as ComingSoonArea[]).filter(
    (area) => area !== "marketing" || !marketing,
  );
  return (
    <ul
      aria-label="Areas"
      className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2"
    >
      {landlords && (
        <li className="min-w-0">
          <section aria-label="Landlords & instructions" className={CARD}>
            <div className="flex items-center gap-2">
              <Inbox
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h2 className="text-sm font-semibold">
                Landlords & instructions
              </h2>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              {landlords.figures.map((figure) => (
                <div key={figure.label} className="min-w-0">
                  <dt className="text-xs leading-tight text-muted-foreground">
                    {figure.label}
                  </dt>
                  <dd
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      figure.tone === "warning" &&
                        figure.value > 0 &&
                        "text-warning",
                    )}
                  >
                    {figure.value}
                  </dd>
                </div>
              ))}
            </dl>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              render={
                <Link href={dashboardTabHref(workspacePath, "landlords")} />
              }
              nativeButton={false}
            >
              Open Landlords & instructions
              <ArrowRight aria-hidden="true" />
            </Button>
          </section>
        </li>
      )}
      {marketing && (
        <li className="min-w-0">
          <section aria-label="Marketing & applicants" className={CARD}>
            <div className="flex items-center gap-2">
              <Megaphone
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h2 className="text-sm font-semibold">Marketing & applicants</h2>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              {marketing.figures.map((figure) => (
                <div key={figure.label} className="min-w-0">
                  <dt className="text-xs leading-tight text-muted-foreground">
                    {figure.label}
                  </dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {figure.value}
                  </dd>
                </div>
              ))}
            </dl>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              render={
                <Link href={dashboardTabHref(workspacePath, "marketing")} />
              }
              nativeButton={false}
            >
              Open Marketing & applicants
              <ArrowRight aria-hidden="true" />
            </Button>
          </section>
        </li>
      )}
      {later.map((area) => {
        const { title, phase, icon: Icon } = COMING_SOON[area];
        return (
          <li key={area} className="min-w-0">
            <section aria-label={title} className={cn(CARD, "border-dashed")}>
              <div className="flex items-center gap-2">
                <Icon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {title}
                </h2>
                <Badge variant="secondary" className="ml-auto">
                  Coming in {phase}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Not built yet, so no figures.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="w-fit"
                render={<Link href={dashboardTabHref(workspacePath, area)} />}
                nativeButton={false}
              >
                See what is planned
                <ArrowRight aria-hidden="true" />
              </Button>
            </section>
          </li>
        );
      })}
    </ul>
  );
}
