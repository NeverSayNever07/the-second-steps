import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// The white box at the top of every record page (ADR-039, replacing the blue
// box of ADR-038): avatar or icon, name, reference, badges and the primary
// actions, with the key facts inside the box as a second row.

export type RecordFact = {
  label: string;
  value: string | null | undefined;
  icon: LucideIcon;
};

export function RecordHeader({
  avatar,
  title,
  subtitle,
  badges,
  actions,
  facts = [],
}: {
  avatar: ReactNode;
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  facts?: RecordFact[];
}) {
  return (
    <header className="rounded-xl border bg-card p-4 text-card-foreground md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-accent-foreground"
          >
            {avatar}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && (
              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t pt-3.5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
          {facts.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex min-w-0 items-center gap-2.5">
              <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0">
                <dt className="text-[0.6875rem] text-muted-foreground">
                  {label}
                </dt>
                <dd className="truncate text-sm font-semibold">
                  {value || "Not recorded"}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
