import { cn } from "cn";

/** A dashboard section: a card with a header row and a space for a count or button. */
export function Panel({
  title,
  right,
  children,
  className,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "min-w-0 rounded-xl bg-card shadow-xs ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
      <div className="p-1">{children}</div>
    </section>
  );
}

/** Initials in a small circle, for a colleague. */
export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[0.65rem] font-semibold text-accent-foreground",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

/** A row of small blocks, filled up to `filled` of `total`. */
export function Segments({
  filled,
  total = 14,
  tone = "primary",
  label,
}: {
  filled: number;
  total?: number;
  tone?: "primary" | "warning" | "destructive";
  label: string;
}) {
  const fill = {
    primary: "bg-primary",
    warning: "bg-warning",
    destructive: "bg-destructive",
  }[tone];
  const shown = Math.min(Math.max(Math.round(filled), 0), total);
  return (
    <span role="img" aria-label={label} className="flex w-full min-w-0 gap-0.5">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-2 min-w-0 flex-1 rounded-[2px]",
            index < shown ? fill : "bg-muted",
          )}
        />
      ))}
    </span>
  );
}
