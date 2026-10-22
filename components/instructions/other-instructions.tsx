import { History } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { InstructionSummary } from "@/core/instructions/application/instruction-records";
import { LETTING_SERVICE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { JOURNEY_STAGE_LABELS } from "@/core/instructions/domain/instruction-labels";

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });
const date = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`));

/**
 * The property's other instructions, so a returning landlord's new lead (or a
 * later instruction) reads as one story with the earlier one. Earlier
 * instructions are never changed or reopened (ADR-035). Shows nothing when
 * there are none.
 */
export function OtherInstructions({
  items,
  workspacePath,
}: {
  items: readonly InstructionSummary[];
  workspacePath: string;
}) {
  if (items.length === 0) return null;
  const current = items.filter((item) => item.current);
  const title =
    current.length > 0
      ? "Other instructions on this property"
      : "Earlier instructions on this property";
  return (
    <section className="grid gap-3" aria-labelledby="other-instructions">
      <div>
        <h2
          id="other-instructions"
          className="flex items-center gap-2 text-base font-semibold"
        >
          <History
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {current.length > 0
            ? "This property already has a current instruction. Check whether a new one is needed."
            : "An ended instruction stays as it was. A new instruction starts from a new landlord lead."}
        </p>
      </div>
      <ul className="grid divide-y border-t">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`${workspacePath}/instructions/${item.id}`}
                >
                  {item.reference}
                </Link>
                {item.service
                  ? ` · ${LETTING_SERVICE_LABELS[item.service]}`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.current
                  ? `Instructed ${date(item.instructedOn)}`
                  : `Instructed ${date(item.instructedOn)}, ended ${item.endedOn ? date(item.endedOn) : ""}${item.endedReason ? ` · ${item.endedReason}` : ""}`}
                {item.mainContact ? ` · ${item.mainContact}` : ""}
              </p>
            </div>
            <Badge
              variant={
                !item.current
                  ? "secondary"
                  : item.journeyStage === "ready_to_market"
                    ? "success"
                    : "info"
              }
            >
              {item.current ? JOURNEY_STAGE_LABELS[item.journeyStage] : "Ended"}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
