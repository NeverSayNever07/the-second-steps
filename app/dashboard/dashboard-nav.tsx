"use client";

import {
  Building2,
  ClipboardList,
  ContactRound,
  Home,
  Inbox,
  LayoutDashboard,
  Menu,
  Palette,
  Settings,
  Users,
  UserSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ZaytoWordmark } from "@/components/brand/zayto-wordmark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/* Temporary: links to the internal design lab so mock-ups can be reached from
   a normal sign-in. The lab pages return 404 in production, so this section is
   hidden there too. Remove it when the lab is no longer needed. */
const SHOW_DESIGN_LAB = process.env.NODE_ENV !== "production";
const DESIGN_LAB_ITEMS = [
  { label: "Design lab home", icon: Palette, href: "/design-lab" },
  {
    label: "Dashboard options",
    icon: LayoutDashboard,
    href: "/design-lab/dashboards",
  },
  {
    label: "Contact page options",
    icon: UserSquare,
    href: "/design-lab/contact",
  },
];

function NavigationItems({
  onNavigate,
  workspaceSlug,
}: {
  onNavigate?: () => void;
  workspaceSlug: string;
}) {
  const pathname = usePathname();
  const base = `/dashboard/w/${workspaceSlug}`;
  const items = [
    { label: "Overview", icon: Home, href: base },
    { label: "Landlord leads", icon: Inbox, href: `${base}/enquiries` },
    { label: "Landlords", icon: Users, href: `${base}/landlords` },
    {
      label: "Instructions",
      icon: ClipboardList,
      href: `${base}/instructions`,
    },
    { label: "Properties", icon: Building2, href: `${base}/properties` },
    { label: "Contacts", icon: ContactRound, href: `${base}/contacts` },
    { label: "Settings", icon: Settings, href: `${base}/settings` },
  ];

  return (
    <>
      <nav aria-label="Main navigation" className="grid gap-1">
        {items.map(({ href, icon: Icon, label }) => {
          const active =
            pathname === href ||
            (href !== base && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      {SHOW_DESIGN_LAB && (
        <nav aria-label="Design lab (temporary)" className="mt-8 grid gap-1">
          <p className="px-3 pb-1 text-xs font-medium tracking-wide text-sidebar-muted-foreground uppercase">
            Design lab · temporary
          </p>
          {DESIGN_LAB_ITEMS.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

export function DesktopNavigation({
  workspaceName,
  workspaceSlug,
}: {
  workspaceName: string;
  workspaceSlug: string;
}) {
  return (
    <aside className="hidden min-h-screen w-64 shrink-0 flex-col bg-sidebar p-5 text-sidebar-foreground lg:flex lg:min-h-[calc(100vh-1.5rem)] lg:rounded-2xl">
      <ZaytoWordmark />
      <p className="mt-6 truncate text-sm font-medium">{workspaceName}</p>
      <p className="text-xs text-sidebar-muted-foreground">
        Customer workspace
      </p>
      <div className="mt-10">
        <NavigationItems workspaceSlug={workspaceSlug} />
      </div>
      <p className="mt-auto text-xs text-sidebar-muted-foreground">
        Secure proof of concept
      </p>
    </aside>
  );
}

export function MobileNavigation({
  workspaceName,
  workspaceSlug,
}: {
  workspaceName: string;
  workspaceSlug: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" size="icon" className="lg:hidden" />}
      >
        <Menu aria-hidden="true" />
        <span className="sr-only">Open navigation</span>
      </SheetTrigger>
      <SheetContent side="left" className="bg-sidebar text-sidebar-foreground">
        <SheetHeader>
          <SheetTitle className="text-sidebar-foreground">
            <ZaytoWordmark />
          </SheetTitle>
          <SheetDescription className="text-sidebar-muted-foreground">
            {workspaceName}
          </SheetDescription>
        </SheetHeader>
        <div className="px-2">
          <NavigationItems
            workspaceSlug={workspaceSlug}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
