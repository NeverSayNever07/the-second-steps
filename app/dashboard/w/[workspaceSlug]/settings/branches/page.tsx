import { Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { BranchUserList } from "@/components/workspace/branch-user-list";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { getWorkspaceMembers } from "@/core/access/application/workspace-members";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";
import { formatPersonName } from "@/core/platform/domain/user-profile";
import { ManageBranchUsersDialog } from "./branch-assignment-controls";

function valueOrFallback(value: string | null) {
  return value || <span className="text-muted-foreground">Not recorded</span>;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">
        {valueOrFallback(value)}
      </dd>
    </div>
  );
}

export default async function WorkspaceBranchesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/settings/branches`;
  const {
    data: [branches, membersResult],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      getWorkspaceBranches(user.id, workspaceSlug),
      getWorkspaceMembers(user.id, workspaceSlug),
    ]),
  );
  if (!branches) redirect("/access-denied");

  if (branches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <Building2 aria-hidden="true" className="size-5 text-primary" />
          <CardTitle>No branches</CardTitle>
          <CardDescription>
            There are no branch records available to you yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {branches.map((branch) => {
        const address = [
          branch.address1,
          branch.address2,
          branch.townCity,
          branch.county,
          branch.postcode,
        ]
          .filter(Boolean)
          .join(", ");
        const canManageBranch =
          branch.status === "ACTIVE" &&
          membersResult?.canManageBranchScopes === true;
        const candidates =
          canManageBranch && membersResult
            ? membersResult.members.flatMap((member) =>
                member.canManageScope &&
                member.status === "ACTIVE" &&
                member.scopeMode === "NAMED_BRANCHES" &&
                !member.branchIds.includes(branch.id)
                  ? [
                      {
                        membershipId: member.id,
                        label: formatPersonName(
                          member.firstName,
                          member.lastName,
                        ),
                        email: member.primaryEmail,
                        branchIds: member.branchIds,
                      },
                    ]
                  : [],
              )
            : [];
        const memberById = new Map(
          membersResult?.members.map((member) => [member.id, member]) ?? [],
        );
        const assignedUsers = (branch.users ?? []).flatMap((branchUser) => {
          const member = memberById.get(branchUser.membershipId);
          if (!member) return [];

          return [
            {
              membershipId: member.id,
              label: formatPersonName(member.firstName, member.lastName),
              email: member.primaryEmail,
              branchIds: member.branchIds,
              canManageScope: member.canManageScope,
              scopeMode: member.scopeMode,
            },
          ];
        });

        return (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle>
                <h3>{branch.name}</h3>
              </CardTitle>
              <CardAction>
                <StatusBadge
                  label={
                    branch.status === "ACTIVE"
                      ? "Active branch"
                      : "Inactive branch"
                  }
                  tone={branch.status === "ACTIVE" ? "active" : "inactive"}
                />
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Email" value={branch.email} />
                <Detail label="Telephone" value={branch.telephone} />
                <div className="sm:col-span-2">
                  <Detail label="Address" value={address || null} />
                </div>
              </dl>
              {branch.users && (
                <BranchUserList
                  users={branch.users}
                  headerAction={
                    canManageBranch ? (
                      <ManageBranchUsersDialog
                        workspaceSlug={workspaceSlug}
                        branchId={branch.id}
                        candidates={candidates}
                        assignedUsers={assignedUsers}
                      />
                    ) : undefined
                  }
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
