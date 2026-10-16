import { STALE_AFTER_DAYS } from "@/core/actions/application/dashboard-summary";
import type {
  TeamWorkload,
  WorkloadCounts,
} from "@/core/actions/application/team-workload";
import { Badge } from "@/components/ui/badge";
import { Avatar, Panel, Segments } from "./panel";

const NONE: WorkloadCounts = {
  openLeads: 0,
  waitingLeads: 0,
  leadsWithoutNextAction: 0,
  overdueActions: 0,
};

/** Each colleague's leads and overdue work, within the branches the viewer can see. */
export function TeamTab({
  workload,
  people,
  currentMembershipId,
}: {
  workload: TeamWorkload;
  people: readonly { membershipId: string; name: string }[];
  currentMembershipId: string;
}) {
  const rows = [
    ...people.map((person) => ({
      id: person.membershipId,
      name:
        person.membershipId === currentMembershipId
          ? `${person.name} (you)`
          : person.name,
      counts: workload.byMembership[person.membershipId] ?? NONE,
      person: true,
    })),
    {
      id: "unassigned",
      name: "Nobody assigned",
      counts: workload.unassigned,
      person: false,
    },
  ];
  const most = Math.max(1, ...rows.map(({ counts }) => counts.openLeads));
  return (
    <Panel
      title="Team workload"
      right={<Badge variant="secondary">Landlord leads and actions</Badge>}
    >
      <ul className="divide-y">
        {rows.map(({ id, name, counts, person }) => {
          const trouble =
            counts.waitingLeads > 0 ||
            counts.leadsWithoutNextAction > 0 ||
            counts.overdueActions > 0;
          return (
            <li
              key={id}
              className="grid items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                {person && <Avatar name={name} />}
                <span className="truncate">{name}</span>
              </span>
              <Segments
                filled={
                  counts.openLeads
                    ? Math.max(1, (counts.openLeads / most) * 14)
                    : 0
                }
                tone={trouble ? "warning" : "primary"}
                label={`${name} has ${counts.openLeads} open leads`}
              />
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {counts.openLeads} open
                </span>
                {counts.waitingLeads > 0 && (
                  <Badge variant="destructive">
                    {counts.waitingLeads} waiting {STALE_AFTER_DAYS}+ days
                  </Badge>
                )}
                {counts.leadsWithoutNextAction > 0 && (
                  <Badge variant="warning">
                    {counts.leadsWithoutNextAction} no next action
                  </Badge>
                )}
                {counts.overdueActions > 0 && (
                  <Badge variant="destructive">
                    {counts.overdueActions} overdue
                  </Badge>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
