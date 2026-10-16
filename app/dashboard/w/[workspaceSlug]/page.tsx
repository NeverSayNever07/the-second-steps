import { CalendarDays, Inbox, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionsRail } from "@/components/actions/actions-rail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { getActionFormOptions } from "@/core/actions/application/form-options";
import { listWorkItems } from "@/core/actions/application/work-items";
import { requireMfaUser } from "@/core/auth/mfa";
import { ukToday } from "@/core/enquiries/domain/enquiry";
import { getEnquiryNeedsAttention } from "@/core/enquiries/application/enquiry-tasks";

// Received times are real moments shown in UK time.
const receivedFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const actor = { authSubject: user.id, workspaceSlug };
  const [context, attention, workItems, formOptions] = await Promise.all([
    getWorkspaceAccessContext(user.id, workspaceSlug),
    getEnquiryNeedsAttention({ ...actor, upcomingDays: 0 }),
    listWorkItems(actor),
    getActionFormOptions(actor),
  ]);
  if (!context) redirect("/access-denied");
  const enquiriesPath = `${path}/enquiries`;
  const groups = [
    {
      label: "Awaiting a next action",
      icon: Inbox,
      items: attention.unactionedEnquiries,
      capped: attention.unactionedEnquiries.length >= 50,
      tone: "text-warning",
      empty: "Every new landlord lead has a next action.",
      detail: (item: (typeof attention.unactionedEnquiries)[number]) =>
        `Received ${receivedFormat.format(item.createdAt)}`,
    },
    {
      label: "Today's appraisals",
      icon: CalendarDays,
      items: attention.todaysAppraisals,
      capped: attention.todaysAppraisals.length >= 50,
      tone: "text-info",
      empty: "No appraisals assigned to you today.",
      detail: (item: (typeof attention.todaysAppraisals)[number]) =>
        timeFormat.format(item.scheduledAt),
    },
  ];

  return (
    <div className="grid gap-8">
      <header>
        <p className="text-sm text-muted-foreground">Overview</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Needs attention
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Landlord leads that need a next step, and your appraisals today.
        </p>
      </header>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section
          className="order-2 grid gap-4 md:grid-cols-2 xl:order-1"
          aria-label="Landlord-lead work needing attention"
        >
          {groups.map(
            ({ label, icon: Icon, items, capped, tone, empty, detail }) => (
              <Card key={label} className="min-w-0">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  <Icon aria-hidden="true" className={`size-4 ${tone}`} />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">
                    {items.length}
                    {capped ? "+" : ""}
                  </p>
                  {items.length ? (
                    <ul className="mt-4 grid divide-y">
                      {items.slice(0, 5).map((item) => {
                        const enquiry = "enquiry" in item ? item.enquiry : item;
                        return (
                          <li key={item.id} className="py-3 first:pt-0">
                            <Link
                              className="block hover:text-primary"
                              href={`${enquiriesPath}/${enquiry.id}`}
                            >
                              <span className="block truncate text-sm font-medium">
                                {enquiry.enquirerName}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {detail(item as never)}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {empty}
                    </p>
                  )}
                  {items.length > 5 && (
                    <Link
                      href={enquiriesPath}
                      className="mt-3 inline-block text-xs font-medium text-primary"
                    >
                      View all
                    </Link>
                  )}
                </CardContent>
              </Card>
            ),
          )}
        </section>
        <div className="order-1 xl:sticky xl:top-6 xl:order-2">
          <ActionsRail
            workspaceSlug={workspaceSlug}
            items={workItems}
            today={ukToday()}
            options={formOptions}
            currentMembershipId={context.membership.id}
          />
        </div>
      </div>
      <div className="flex gap-3 rounded-lg bg-info-soft p-4 text-sm text-info">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-medium">Protected workspace</p>
          <p>
            Workspace membership, role permissions and database isolation are
            active. Records remain limited to your permitted branch scope.
          </p>
        </div>
      </div>
    </div>
  );
}
