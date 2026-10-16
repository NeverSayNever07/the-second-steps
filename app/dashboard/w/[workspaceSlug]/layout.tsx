import { LogOut } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { ROLE_LABELS } from "@/core/access/domain/role";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { signOut } from "../../actions";
import { DesktopNavigation, MobileNavigation } from "../../dashboard-nav";

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}>) {
  const { workspaceSlug } = await params;
  const workspacePath = `/dashboard/w/${workspaceSlug}`;
  const requestedPath = (await headers()).get("x-zayto-pathname");
  const currentPath =
    requestedPath === workspacePath ||
    requestedPath?.startsWith(`${workspacePath}/`)
      ? requestedPath
      : workspacePath;
  const { data: context } = await requireMfaUserWith(
    currentPath,
    { workspaceSlug },
    (user) => getWorkspaceAccessContext(user.id, workspaceSlug),
  );
  if (!context) redirect("/access-denied");

  return (
    <div className="min-h-screen bg-background lg:flex lg:gap-3 lg:bg-secondary lg:p-3">
      <DesktopNavigation
        workspaceName={context.workspace.displayName}
        workspaceSlug={context.workspace.slug}
      />
      <div className="min-w-0 flex-1 bg-background lg:overflow-hidden lg:rounded-2xl">
        <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-6 lg:px-8">
          <MobileNavigation
            workspaceName={context.workspace.displayName}
            workspaceSlug={context.workspace.slug}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {context.workspace.displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {context.membership.roles
                .map((role) => ROLE_LABELS[role])
                .join(", ")}
            </p>
          </div>
          <Button
            render={<Link href="/dashboard" />}
            nativeButton={false}
            variant="ghost"
            size="sm"
          >
            Switch context
          </Button>
          <ThemeToggle />
          <form action={signOut}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              aria-label="Sign out"
            >
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </form>
        </header>
        <main className="px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
