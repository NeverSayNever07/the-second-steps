import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PropertyForm } from "@/components/properties/property-form";
import { Button } from "@/components/ui/button";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  addressLine,
  getProperty,
} from "@/core/properties/application/properties";
import { isUuid } from "@/core/properties/domain/ids";
import {
  findDuplicatePropertiesForEditAction,
  updatePropertyAction,
} from "../../actions";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; propertyId: string }>;
}) {
  const { workspaceSlug, propertyId } = await params;
  if (!isUuid(propertyId)) notFound();
  const base = `/dashboard/w/${workspaceSlug}/properties`;
  const path = `${base}/${propertyId}`;
  const {
    data: [property, context],
  } = await requireMfaUserWith(`${path}/edit`, { workspaceSlug }, (user) =>
    Promise.all([
      getProperty({ authSubject: user.id, workspaceSlug, propertyId }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
    ]),
  );
  if (!context || !context.permissions.has("property.read")) {
    redirect("/access-denied");
  }
  if (!property) notFound();
  // Only people who can change properties, on an active property.
  if (!property.can.update || property.archived) redirect(path);

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={path} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to property
      </Button>
      <div>
        <p className="text-sm text-muted-foreground">
          {property.reference} · {property.responsibleBranch.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {addressLine(property.details)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Change the address and details. Owners, the responsible branch,
          compliance and notes are changed from the property page.
        </p>
      </div>
      <PropertyForm
        key={property.updatedAt.toISOString()}
        action={updatePropertyAction.bind(null, workspaceSlug, propertyId)}
        basePath={base}
        cancelHref={path}
        initial={property.details}
        checkDuplicates={findDuplicatePropertiesForEditAction.bind(
          null,
          workspaceSlug,
          propertyId,
        )}
      />
    </div>
  );
}
