import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export type RecordTab = {
  id: string;
  label: string;
  /** A short alert count, for example compliance items needing attention. */
  badge?: string;
};

/**
 * Top tabs for a busy record page (ADR-030 amendment). Each tab is a link to
 * `?tab=`, so the page stays server-rendered, links open the right tab and
 * Back works. The first tab is the page's default and has no `tab` in its URL.
 */
export function RecordTabs({
  tabs,
  current,
  path,
}: {
  tabs: readonly RecordTab[];
  current: string;
  /** The page's own path, without a query. */
  path: string;
}) {
  return (
    <nav
      aria-label="Record sections"
      className="flex gap-1 overflow-x-auto border-b"
    >
      {tabs.map((tab, index) => {
        const isCurrent = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={index === 0 ? path : `${path}?tab=${tab.id}`}
            aria-current={isCurrent ? "page" : undefined}
            scroll={false}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 ${
              isCurrent
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge && <Badge variant="destructive">{tab.badge}</Badge>}
          </Link>
        );
      })}
    </nav>
  );
}

/** The tab named in the URL if it is one of the page's tabs, else the first. */
export function currentTab(
  tabs: readonly RecordTab[],
  value: string | string[] | undefined,
) {
  const requested = Array.isArray(value) ? value[0] : value;
  return tabs.find((tab) => tab.id === requested)?.id ?? tabs[0].id;
}
