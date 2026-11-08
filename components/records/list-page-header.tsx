import type { ReactNode } from "react";

// The compact top of every list page (ADR-038): the title with a short count or
// description on the left and the create action on the right.

export function ListPageHeader({
  title,
  summary,
  action,
}: {
  title: string;
  summary?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      </div>
      {action}
    </div>
  );
}
