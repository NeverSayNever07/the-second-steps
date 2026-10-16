import { redirect } from "next/navigation";
import {
  addEnquiryListItemAction,
  updateEnquiryListItemAction,
} from "./actions";
import { EnquiryListSettings } from "@/components/enquiries/enquiry-list-settings";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";

export default async function EnquirySettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/settings/enquiries`;
  const {
    data: [settings, context],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listEnquirySettings({ authSubject: user.id, workspaceSlug }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
    ]),
  );
  if (!settings || !context?.permissions.has("enquiry.read"))
    redirect("/access-denied");
  const canManage = context.permissions.has("enquiry.settings.manage");
  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Landlord lead lists
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rename, reorder or hide the choices staff use when working landlord
          leads.
        </p>
        {!canManage && (
          <p className="mt-3 rounded-lg bg-muted p-3 text-sm">
            Only an Account Owner or Agency Admin can change these lists.
          </p>
        )}
      </header>
      <EnquiryListSettings
        leadSources={settings.leadSources}
        outcomeReasons={settings.outcomeReasons}
        addAction={addEnquiryListItemAction.bind(null, workspaceSlug)}
        updateAction={updateEnquiryListItemAction.bind(null, workspaceSlug)}
        canManage={canManage}
      />
    </div>
  );
}
