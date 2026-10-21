import { FileDown, FileX } from "lucide-react";
import Link from "next/link";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { Badge } from "@/components/ui/badge";
import type {
  ComplianceAreaView,
  PropertyComplianceView,
} from "@/core/compliance/application/property-compliance";
import {
  APPLICABILITY_LABELS,
  EVIDENCE_RELATION_LABELS,
  EVIDENCE_STATUS_LABELS,
} from "@/core/compliance/domain/compliance-labels";
import { ComplianceUpdateButton } from "./compliance-update-button";

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });

function formatDay(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`));
}

const APPLICABILITY_VARIANT = {
  not_assessed: "secondary",
  applies: "info",
  does_not_apply: "secondary",
  needs_specialist_review: "warning",
} as const;

const STATUS_VARIANT = {
  not_requested: "secondary",
  awaiting_evidence: "warning",
  reviewed: "success",
  action_required: "destructive",
} as const;

function evidenceSummary(area: ComplianceAreaView) {
  const relied = area.evidenceList.find(
    (item) => item.relation === "relied_on",
  );
  if (!relied) return null;
  return [
    `Dated ${formatDay(relied.eventOn)}`,
    relied.expiresOn ? `expires ${formatDay(relied.expiresOn)}` : null,
    relied.epcRating ? `rating ${relied.epcRating}` : null,
    relied.reference,
  ]
    .filter(Boolean)
    .join(" · ");
}

function evidenceLabel(item: ComplianceAreaView["evidenceList"][number]) {
  return [
    formatDay(item.eventOn),
    item.expiresOn ? `expires ${formatDay(item.expiresOn)}` : null,
    item.reference,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The property's five compliance areas as flat rows (ADR-030): what applies,
 * where the evidence stands, and the history behind it. One Update button per
 * area opens the single place to record anything about it.
 */
export function PropertyCompliance({
  view,
  workspaceSlug,
  today,
  updateAction,
}: {
  view: PropertyComplianceView;
  workspaceSlug: string;
  /** Today's UK date, "YYYY-MM-DD". */
  today: string;
  /** Bound to the area by the caller. */
  updateAction: (
    area: string,
  ) => (
    state: InstructionActionState,
    data: FormData,
  ) => Promise<InstructionActionState>;
}) {
  const canUpdate = view.canManage && view.isOpen;
  return (
    <section className="grid gap-4" aria-labelledby="compliance">
      <div>
        <h2 id="compliance" className="text-base font-semibold">
          Compliance
        </h2>
        <p className="text-sm text-muted-foreground">
          Evidence your team has recorded for this property. Dates are as
          entered from the evidence; Zayto does not decide whether the property
          is compliant.
        </p>
      </div>
      <ul className="grid divide-y border-t">
        {view.areas.map((area) => (
          <li key={area.area} className="grid gap-3 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-medium">{area.label}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={APPLICABILITY_VARIANT[area.applicability]}>
                    {APPLICABILITY_LABELS[area.applicability]}
                  </Badge>
                  {area.applicability === "applies" && (
                    <Badge variant={STATUS_VARIANT[area.status]}>
                      {EVIDENCE_STATUS_LABELS[area.status]}
                    </Badge>
                  )}
                  {area.isExpired && (
                    <Badge variant="destructive">Expired</Badge>
                  )}
                </div>
              </div>
              {canUpdate && (
                <ComplianceUpdateButton
                  workspaceSlug={workspaceSlug}
                  propertyId={view.propertyId}
                  area={area.area}
                  label={area.label}
                  isFileRequired={area.isFileRequired}
                  today={today}
                  applicability={area.applicability}
                  evidenceOptions={area.evidenceList
                    .filter((item) => !item.isFileRemoved)
                    .map((item) => ({
                      id: item.id,
                      label: evidenceLabel(item),
                    }))}
                  action={updateAction(area.area)}
                />
              )}
            </div>
            {area.applicabilityReason && area.applicability !== "applies" && (
              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {area.applicabilityReason}
              </p>
            )}
            {area.applicability === "applies" && evidenceSummary(area) && (
              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {evidenceSummary(area)}
              </p>
            )}
            {area.statusNote && area.status === "action_required" && (
              <p className="text-sm text-destructive [overflow-wrap:anywhere]">
                {area.statusNote}
              </p>
            )}
            {area.isExpired && (
              <p className="text-sm text-destructive">
                The expiry date entered for the evidence relied on has passed.
                Add newer evidence and review it.
              </p>
            )}
            {area.evidenceList.length > 0 && (
              <details>
                <summary className="w-fit cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
                  Evidence history ({area.evidenceList.length})
                </summary>
                <ul className="mt-3 grid divide-y border-t">
                  {area.evidenceList.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          Dated {formatDay(item.eventOn)}
                          {item.expiresOn
                            ? ` · expires ${formatDay(item.expiresOn)}`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {[
                            item.reference,
                            item.provider,
                            item.epcRating && `Rating ${item.epcRating}`,
                            item.notes,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No other details"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            item.relation === "relied_on"
                              ? "success"
                              : "secondary"
                          }
                        >
                          {EVIDENCE_RELATION_LABELS[item.relation]}
                        </Badge>
                        {item.documentId ? (
                          <Link
                            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                            href={`/dashboard/w/${workspaceSlug}/documents/${item.documentId}`}
                            prefetch={false}
                          >
                            <FileDown className="size-4" aria-hidden="true" />
                            Download file
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <FileX className="size-4" aria-hidden="true" />
                            {item.isFileRemoved ? "File removed" : "No file"}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
