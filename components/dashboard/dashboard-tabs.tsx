import {
  CalendarDays,
  ClipboardCheck,
  Home,
  Inbox,
  Megaphone,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

export const DASHBOARD_TABS = [
  { value: "home", label: "Home", icon: Home },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "landlords", label: "Landlords & instructions", icon: Inbox },
  { value: "marketing", label: "Marketing & applicants", icon: Megaphone },
  { value: "pre-tenancy", label: "Pre-tenancy", icon: ClipboardCheck },
  { value: "management", label: "Management", icon: Wrench },
] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number]["value"];

/** Addresses from before the tabs were reorganised, and where they now lead. */
const LEGACY_TABS: Record<string, DashboardTab> = {
  overview: "home",
  schedule: "calendar",
  pipeline: "landlords",
  team: "landlords",
};

/** Landlords & instructions is for roles that can read leads or instructions. */
export function availableTabs(canSeeLandlords: boolean) {
  return DASHBOARD_TABS.filter(
    ({ value }) => value !== "landlords" || canSeeLandlords,
  );
}

export function parseDashboardTab(
  value: unknown,
  tabs: readonly { value: DashboardTab }[] = DASHBOARD_TABS,
): DashboardTab {
  return tabs.some((tab) => tab.value === value)
    ? (value as DashboardTab)
    : "home";
}

/** The current tab for an old address (`?tab=pipeline`), or null if it is not one. */
export function legacyDashboardTab(value: unknown): DashboardTab | null {
  return typeof value === "string" ? (LEGACY_TABS[value] ?? null) : null;
}

export function dashboardTabHref(workspacePath: string, tab: DashboardTab) {
  return tab === "home" ? workspacePath : `${workspacePath}?tab=${tab}`;
}

/** Tabs are plain links, so each tab only loads its own data. */
export function DashboardTabs({
  current,
  workspacePath,
  tabs,
}: {
  current: DashboardTab;
  workspacePath: string;
  tabs: readonly {
    value: DashboardTab;
    label: string;
    icon: LucideIcon;
  }[];
}) {
  return (
    <nav aria-label="Dashboard sections" className="border-b">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map(({ value, label, icon: Icon }) => (
          <li key={value}>
            <Link
              href={dashboardTabHref(workspacePath, value)}
              aria-current={current === value ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                current === value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
