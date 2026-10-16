import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PropertyForm } from "@/components/properties/property-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";
import { toActiveBranchOptions } from "@/core/workspace/domain/branch-option";
import {
  createPropertyAction,
  findDuplicatePropertiesAction,
  quickAddOwnerAction,
  searchOwnerContactsAction,
} from "../actions";

export default async function NewPropertyPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const base = `/dashboard/w/${workspaceSlug}/properties`;
  const {
    data: [context, branches],
  } = await requireMfaUserWith(`${base}/new`, { workspaceSlug }, (user) =>
    Promise.all([
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
    ]),
  );
  if (!context || !branches || !context.permissions.has("property.create")) {
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
        Back to properties
      </Button>
      <div>
        <p className="text-sm text-muted-foreground">Properties</p>
        <h1 className="text-2xl font-semibold tracking-tight">New property</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record the address, key details and owners. Photos, listings and rent
          are added later.
        </p>
      </div>
      {activeBranches.length ? (
        <PropertyForm
          action={createPropertyAction.bind(null, workspaceSlug)}
          basePath={base}
          branches={activeBranches}
          checkDuplicates={findDuplicatePropertiesAction.bind(
            null,
            workspaceSlug,
          )}
          quickAdd={quickAddOwnerAction.bind(null, workspaceSlug)}
          searchOwners={searchOwnerContactsAction.bind(null, workspaceSlug)}
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            You need access to an active branch before creating a property.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
