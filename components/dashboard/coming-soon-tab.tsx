import {
  Building2,
  ClipboardCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "./panel";

export type ComingSoonArea = "marketing" | "pre-tenancy" | "management";

/* These areas are not built yet. They show what each will cover and no
   figures, so nobody mistakes a placeholder for real numbers. */
export const COMING_SOON: Record<
  ComingSoonArea,
  {
    title: string;
    phase: string;
    icon: LucideIcon;
    summary: string;
    covers: readonly string[];
  }
> = {
  marketing: {
    title: "Marketing & applicants",
    phase: "Phase 2",
    icon: Building2,
    summary: "Getting a property let, from listing to accepted offer.",
    covers: [
      "Listings that are live or being prepared",
      "Applicant enquiries and follow-up",
      "Viewings booked for today and this week",
      "Offers to review",
    ],
  },
  "pre-tenancy": {
    title: "Pre-tenancy",
    phase: "Phase 3",
    icon: ClipboardCheck,
    summary: "From accepted offer to keys in hand.",
    covers: [
      "Referencing in progress and anything blocked",
      "Tenancy contracts waiting to be signed",
      "Holding deposits and first payments",
      "Move-ins this week",
    ],
  },
  management: {
    title: "Management",
    phase: "Phase 4",
    icon: Wrench,
    summary: "Looking after let properties day to day.",
    covers: [
      "Rent due and rent running late",
      "Gas, electrical and other certificates nearing expiry",
      "Repairs and maintenance in progress",
      "Renewals and tenancies ending",
    ],
  },
};

export function ComingSoonTab({ area }: { area: ComingSoonArea }) {
  const { title, phase, icon: Icon, summary, covers } = COMING_SOON[area];
  return (
    <Panel
      title={title}
      right={<Badge variant="outline">Coming in {phase}</Badge>}
    >
      <div className="grid gap-3 p-3">
        <div className="flex items-start gap-3">
          <Icon
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <div className="grid gap-1">
            <p className="text-sm font-medium">{summary}</p>
            <p className="text-sm text-muted-foreground">
              Not built yet, so there are no figures here. When it is ready,
              this tab will show:
            </p>
          </div>
        </div>
        <ul className="grid gap-1.5 pl-8 text-sm">
          {covers.map((item) => (
            <li key={item} className="list-disc text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
