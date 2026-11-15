import Link from "next/link";
import { cn } from "cn";

export type DayFigure = {
  label: string;
  value: number;
  href?: string;
  tone?: "warning" | "destructive";
};

/**
 * The dashboard's counts as one quiet strip (ADR-039). Each figure leads to
 * the place it counts; only the figures this role may read are passed in.
 */
export function YourDayFigures({ figures }: { figures: DayFigure[] }) {
  if (figures.length === 0) return null;
  return (
    <ul
      aria-label="Figures"
      className="flex flex-wrap gap-x-7 gap-y-2 rounded-xl bg-card px-4 py-3 shadow-xs ring-1 ring-foreground/10"
    >
      {figures.map((figure) => {
        const content = (
          <>
            <span
              className={cn(
                "text-lg font-semibold tabular-nums",
                figure.tone === "warning" && "text-warning",
                figure.tone === "destructive" && "text-destructive",
              )}
            >
              {figure.value}
            </span>{" "}
            <span
              className={cn(
                "text-sm",
                figure.tone === "destructive"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {figure.label}
            </span>
          </>
        );
        return (
          <li key={figure.label}>
            {figure.href ? (
              <Link
                href={figure.href}
                className="rounded-md underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
