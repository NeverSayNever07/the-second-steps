import { ArrowLeft, Building2, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactForm } from "@/components/contacts/contact-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";
import { toActiveBranchOptions } from "@/core/workspace/domain/branch-option";
import { createContactAction } from "../actions";

export default async function NewContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const { workspaceSlug } = await params;
  const base = `/dashboard/w/${workspaceSlug}/contacts`;
  const path = `${base}/new`;
  const {
    data: [context, branches],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
    ]),
  );
  if (!context || !branches || !context.permissions.has("contact.create"))
    redirect("/access-denied");
  const requestedKind = (await searchParams).kind;
  const kind =
    requestedKind === "person" || requestedKind === "organisation"
      ? requestedKind
      : null;
  if (!kind)
    return (
      <div className="grid max-w-3xl gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Contacts</p>
          <h1 className="text-2xl font-semibold tracking-tight">New contact</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the type of record to create.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              kind: "person",
              title: "Person",
              description: "An individual landlord or other contact.",
              icon: UserRound,
            },
            {
              kind: "organisation",
              title: "Organisation",
              description: "A company, partnership, trust or charity.",
              icon: Building2,
            },
          ].map(({ kind: option, title, description, icon: Icon }) => (
            <Card key={option}>
              <CardHeader>
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  {description}
                </p>
                <Button
                  className="w-full"
                  render={<Link href={`${path}?kind=${option}`} />}
                  nativeButton={false}
                >
                  Create {title.toLowerCase()}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
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
        Back to contacts
      </Button>
      <div>
        <p className="text-sm text-muted-foreground">Contacts</p>
        <h1 className="text-2xl font-semibold tracking-tight">New {kind}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add the minimum useful details now. More relationships can be added
          later.
        </p>
      </div>
      {activeBranches.length ? (
        <ContactForm
          action={createContactAction.bind(null, workspaceSlug, kind)}
          branches={activeBranches}
          kind={kind}
          wide
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            You need access to an active branch before creating a contact.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
