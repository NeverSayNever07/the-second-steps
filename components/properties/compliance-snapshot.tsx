import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PropertyComplianceView } from "@/core/compliance/application/property-compliance";
import { isCriticalArea } from "@/core/compliance/domain/compliance";
import { COMPLIANCE_AREA_LABELS } from "@/core/compliance/domain/compliance-labels";

/** How many areas need attention: critical, expired, action required, due soon. */
export function complianceAttention(view: PropertyComplianceView) {
  const areas = view.areas;
  const applies = areas.filter((area) => area.applicability === "applies");
  const expired = applies.filter((area) => area.isExpired);
  return {
    critical: expired.filter((area) => isCriticalArea(area.area)),
    expired,
    actionRequired: applies.filter((area) => area.status === "action_required"),
    dueSoon: applies.filter(
      (area) => area.window !== null && area.window !== "expired",
    ),
    awaiting: applies.filter(
      (area) =>
        area.status === "awaiting_evidence" || area.status === "not_requested",
    ),
    notAssessed: areas.filter((area) => area.applicability === "not_assessed"),
    reviewed: applies.filter(
      (area) => area.status === "reviewed" && !area.isExpired,
    ),
  };
}

/**
 * A few lines on where the property's compliance stands, for overview tabs.
 * For information: it never changes Ready to market.
 */
export function ComplianceSnapshot({
  view,
  href,
}: {
  view: PropertyComplianceView;
  /** The Compliance tab of the page this appears on. */
  href: string;
}) {
  const attention = complianceAttention(view);
  const names = (areas: typeof attention.critical) =>
    areas.map((area) => COMPLIANCE_AREA_LABELS[area.area]).join(", ");
  const counts: [
    string,
    number,
    "destructive" | "warning" | "secondary" | "success",
  ][] = [
    ["expired", attention.expired.length, "destructive"],
    ["action required", attention.actionRequired.length, "destructive"],
    ["due within 60 days", attention.dueSoon.length, "warning"],
    ["awaiting evidence", attention.awaiting.length, "warning"],
    ["not assessed", attention.notAssessed.length, "secondary"],
    ["reviewed", attention.reviewed.length, "success"],
  ];
  return (
    <div className="grid gap-3">
      {attention.critical.length > 0 && (
        <div
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <p className="font-semibold">Critical compliance issue</p>
          <p>
            {names(attention.critical)}: the date entered for the evidence
            relied on has passed. Add newer evidence and review it.
          </p>
        </div>
      )}
      {attention.expired.length > attention.critical.length && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          Expired:{" "}
          {names(
            attention.expired.filter((area) => !isCriticalArea(area.area)),
          )}
          .
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {counts
          .filter(([, count]) => count > 0)
          .map(([label, count, variant]) => (
            <Badge key={label} variant={variant}>
              {count} {label}
            </Badge>
          ))}
        <Link
          href={href}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Open compliance
        </Link>
      </div>
    </div>
  );
}
