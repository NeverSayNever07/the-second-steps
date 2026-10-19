import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewLandlordLeadForm } from "@/components/enquiries/new-landlord-lead-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import { listEnquiryAssignees } from "@/core/enquiries/application/enquiries";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";
import { toActiveBranchOptions } from "@/core/workspace/domain/branch-option";
import { createLandlordLeadAction } from "../actions";

export default async function NewEnquiryPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const base = `/dashboard/w/${workspaceSlug}/enquiries`;
  const {
    data: [context, branches, settings, assignees],
  } = await requireMfaUserWith(`${base}/new`, { workspaceSlug }, (user) =>
    Promise.all([
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
      listEnquirySettings({ authSubject: user.id, workspaceSlug }),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
    ]),
  );
  if (
    !context ||
    !branches ||
    !settings ||
    !context.permissions.has("enquiry.create")
  ) {
    redirect("/access-denied");
  }
  const activeBranches = toActiveBranchOptions(branches);

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={base} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to landlord leads
      </Button>
      <div>
        <p className="text-sm text-muted-foreground">Landlord leads</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          New landlord lead
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Add the landlord, the property to let and what happens next in one go.
          Zayto checks for existing records in the background and only asks you
          when something may match.
        </p>
      </div>
      {activeBranches.length ? (
        <NewLandlordLeadForm
          action={createLandlordLeadAction.bind(null, workspaceSlug)}
          cancelHref={base}
          branches={activeBranches}
          leadSources={settings.leadSources.filter(
            ({ status }) => status === "active",
          )}
          assignees={assignees}
          currentMembershipId={context.membership.id}
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            You need access to an active branch before creating a landlord lead.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
