import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PropertyComplianceView } from "@/core/compliance/application/property-compliance";
import { COMPLIANCE_AREA_LABELS } from "@/core/compliance/domain/compliance-labels";

/** How many areas need attention: expired, action required, or awaiting. */
export function complianceAttention(view: PropertyComplianceView) {
  const areas = view.areas;
  return {
    expired: areas.filter((area) => area.isExpired),
    actionRequired: areas.filter(
      (area) =>
        area.applicability === "applies" && area.status === "action_required",
    ),
    awaiting: areas.filter(
      (area) =>
        area.applicability === "applies" &&
        (area.status === "awaiting_evidence" ||
          area.status === "not_requested"),
    ),
    notAssessed: areas.filter((area) => area.applicability === "not_assessed"),
    reviewed: areas.filter(
      (area) =>
        area.applicability === "applies" &&
        area.status === "reviewed" &&
        !area.isExpired,
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
  const counts: [
    string,
    number,
    "destructive" | "warning" | "secondary" | "success",
  ][] = [
    ["expired", attention.expired.length, "destructive"],
    ["action required", attention.actionRequired.length, "destructive"],
    ["awaiting evidence", attention.awaiting.length, "warning"],
    ["not assessed", attention.notAssessed.length, "secondary"],
    ["reviewed", attention.reviewed.length, "success"],
  ];
  return (
    <div className="grid gap-3">
      {attention.expired.length > 0 && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          Expired:{" "}
          {attention.expired
            .map((area) => COMPLIANCE_AREA_LABELS[area.area])
            .join(", ")}
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
