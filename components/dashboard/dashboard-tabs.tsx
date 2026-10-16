import Link from "next/link";
import { cn } from "cn";

export const DASHBOARD_TABS = [
  { value: "overview", label: "Overview" },
  { value: "pipeline", label: "Pipeline" },
  { value: "schedule", label: "Schedule" },
  { value: "team", label: "Team" },
] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number]["value"];

/** The Team tab is only for roles that work landlord leads. */
export function availableTabs(canSeeTeam: boolean) {
  return DASHBOARD_TABS.filter(({ value }) => value !== "team" || canSeeTeam);
}

export function parseDashboardTab(
  value: unknown,
  tabs: readonly { value: DashboardTab }[] = DASHBOARD_TABS,
): DashboardTab {
  return tabs.some((tab) => tab.value === value)
    ? (value as DashboardTab)
    : "overview";
}

/** Tabs are plain links, so each tab only loads its own data. */
export function DashboardTabs({
  current,
  workspacePath,
  tabs,
}: {
  current: DashboardTab;
  workspacePath: string;
  tabs: readonly { value: DashboardTab; label: string }[];
}) {
  return (
    <nav aria-label="Dashboard sections" className="border-b">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map(({ value, label }) => (
          <li key={value}>
            <Link
              href={
                value === "overview"
                  ? workspacePath
                  : `${workspacePath}?tab=${value}`
              }
              aria-current={current === value ? "page" : undefined}
              className={cn(
                "block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                current === value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
