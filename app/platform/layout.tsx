import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ZaytoWordmark } from "@/components/brand/zayto-wordmark";
import { SkipLink } from "@/components/feedback/skip-link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { getPlatformAccessContext } from "@/core/access/application/access-context";
import { requireMfaUser } from "@/core/auth/mfa";
import { signOut } from "../dashboard/actions";
import {
  PlatformMobileNavigation,
  PlatformNavigation,
} from "./platform-navigation";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestedPath = (await headers()).get("x-zayto-pathname");
  const currentPath =
    requestedPath === "/platform" || requestedPath?.startsWith("/platform/")
      ? requestedPath
      : "/platform";
  const user = await requireMfaUser(currentPath);
  const context = await getPlatformAccessContext(user.id);
  if (!context) redirect("/access-denied");

  return (
    <div className="min-h-screen bg-background lg:flex lg:gap-3 lg:bg-secondary lg:p-3">
      <SkipLink />
      <aside className="hidden min-h-screen w-64 shrink-0 flex-col bg-sidebar p-5 text-sidebar-foreground lg:flex lg:min-h-[calc(100vh-1.5rem)] lg:rounded-2xl">
        <ZaytoWordmark />
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2">
          <ShieldCheck aria-hidden="true" className="size-4" />
          <div>
            <p className="text-sm font-medium">Zayto platform</p>
            <p className="text-xs text-sidebar-muted-foreground">
              Internal administration
            </p>
          </div>
        </div>
        <div className="mt-10">
          <PlatformNavigation />
        </div>
        <p className="mt-auto text-xs text-sidebar-muted-foreground">
          Customer CRM records are not available from this context
        </p>
      </aside>

      <div className="min-w-0 flex-1 bg-background lg:overflow-hidden lg:rounded-2xl">
        <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-6 lg:px-8">
          <PlatformMobileNavigation />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Zayto platform</p>
            <p className="truncate text-xs text-muted-foreground">
              Platform Owner · {user.email}
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
        <main
          id="main-content"
          tabIndex={-1}
          className="px-4 py-6 outline-none md:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
