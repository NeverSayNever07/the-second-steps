import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type {
  ComplianceAttention,
  ComplianceAttentionItem,
} from "@/core/compliance/application/compliance-attention";
import { COMPLIANCE_AREA_LABELS } from "@/core/compliance/domain/compliance-labels";
import { cn } from "cn";
import { Panel } from "./panel";

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });
const formatDay = (value: string) =>
  dateFormat.format(new Date(`${value}T00:00:00Z`));

function describe(item: ComplianceAttentionItem): {
  label: string;
  variant: "destructive" | "warning";
} {
  const date = item.expiresOn ? ` ${formatDay(item.expiresOn)}` : "";
  switch (item.kind) {
    case "critical":
      return { label: `Critical: expired${date}`, variant: "destructive" };
    case "expired":
      return { label: `Expired${date}`, variant: "destructive" };
    case "action_required":
      return { label: "Action required", variant: "destructive" };
    default: {
      const days = item.days ?? 0;
      return {
        label:
          days === 0
            ? "Due today"
            : `Due in ${days} ${days === 1 ? "day" : "days"}`,
        variant: "warning",
      };
    }
  }
}

/**
 * Where property compliance needs attention across the viewer's branches:
 * expired dates, reviews that need action, and dates inside 60 days. These
 * are dates staff entered from the evidence; the panel never decides what
 * the law requires, and it changes nothing.
 */
export function CompliancePanel({
  attention,
  workspacePath,
}: {
  attention: ComplianceAttention;
  workspacePath: string;
}) {
  const { counts, items, total } = attention;
  const figures: {
    label: string;
    value: number;
    tone?: "destructive" | "warning";
  }[] = [
    { label: "Critical", value: counts.critical, tone: "destructive" },
    { label: "Expired", value: counts.expired, tone: "destructive" },
    {
      label: "Action required",
      value: counts.actionRequired,
      tone: "destructive",
    },
    { label: "Due in 60 days", value: counts.dueSoon, tone: "warning" },
  ];
  const hidden = total - items.length;

  return (
    <Panel
      title="Property compliance"
      right={
        total > 0 ? (
          <Badge variant={counts.critical > 0 ? "destructive" : "warning"}>
            {total} to look at
          </Badge>
        ) : null
      }
    >
      <ul
        aria-label="Compliance totals"
        className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-4"
      >
        {figures.map((figure) => (
          <li key={figure.label} className="rounded-lg bg-muted/40 px-3 py-2">
            <span className="block text-xs text-muted-foreground">
              {figure.label}
            </span>
            <span
              className={cn(
                "block text-xl font-semibold tabular-nums",
                figure.value > 0 &&
                  figure.tone === "destructive" &&
                  "text-destructive",
                figure.value > 0 && figure.tone === "warning" && "text-warning",
              )}
            >
              {figure.value}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t">
        {total === 0 ? (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            No recorded compliance dates are expired or due within 60 days.
          </p>
        ) : (
          <>
            {counts.critical > 0 && (
              <p
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive"
                role="status"
              >
                <AlertTriangle aria-hidden="true" className="size-4" />
                {counts.critical === 1
                  ? "1 critical compliance issue"
                  : `${counts.critical} critical compliance issues`}
              </p>
            )}
            <ul className="divide-y">
              {items.map((item) => {
                const state = describe(item);
                return (
                  <li key={`${item.propertyId}-${item.area}`}>
                    <Link
                      href={`${workspacePath}/properties/${item.propertyId}?tab=compliance`}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {item.property}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {COMPLIANCE_AREA_LABELS[item.area]}
                        </span>
                      </span>
                      <Badge variant={state.variant}>{state.label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {hidden > 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                and {hidden} more. Open a property to see its compliance.
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
