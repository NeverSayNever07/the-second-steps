"use client";

import {
  ArrowLeftRight,
  Building2,
  ChevronDown,
  ClipboardList,
  ContactRound,
  Home,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Menu,
  Palette,
  Settings,
  UserSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState } from "react";
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
    label: "Dashboard structure",
    icon: LayoutDashboard,
    href: "/design-lab/dashboard-structure",
  },
  {
    label: "Contact page options",
    icon: UserSquare,
    href: "/design-lab/contact",
  },
  {
    label: "Record page options",
    icon: UserSquare,
    href: "/design-lab/record-pages",
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
  const [contactsOpenByUser, setContactsOpenByUser] = useState<boolean | null>(
    null,
  );
  const contactLinks = [
    { label: "All contacts", href: `${base}/contacts` },
    { label: "Landlords", href: `${base}/landlords` },
  ];
  const contactsActive = contactLinks.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
  const contactsOpen = contactsOpenByUser ?? contactsActive;
  const items = [
    { label: "Dashboard", icon: Home, href: base },
    { label: "Landlord leads", icon: Inbox, href: `${base}/enquiries` },
    {
      label: "Instructions",
      icon: ClipboardList,
      href: `${base}/instructions`,
    },
    { label: "Properties", icon: Building2, href: `${base}/properties` },
    { label: "Marketing", icon: Megaphone, href: `${base}/marketing` },
    { label: "Settings", icon: Settings, href: `${base}/settings` },
  ];

  const contactsGroup = (
    <div>
      <button
        type="button"
        aria-expanded={contactsOpen}
        aria-controls="contacts-submenu"
        onClick={() => setContactsOpenByUser(!contactsOpen)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          contactsActive
            ? "text-sidebar-accent-foreground"
            : "text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        }`}
      >
        <ContactRound aria-hidden="true" className="size-4" />
        <span className="flex-1 text-left">Contacts</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform ${contactsOpen ? "rotate-180" : ""}`}
        />
      </button>
      {contactsOpen && (
        <ul id="contacts-submenu" className="mt-1 grid gap-1 pl-4">
          {contactLinks.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`flex items-center rounded-xl px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <nav aria-label="Main navigation" className="grid gap-1">
        {items.map(({ href, icon: Icon, label }) => {
          const active =
            pathname === href ||
            (href !== base && pathname.startsWith(`${href}/`));
          return (
            <Fragment key={label}>
              <Link
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
              {label === "Properties" && contactsGroup}
            </Fragment>
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
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <ArrowLeftRight aria-hidden="true" className="size-4" />
            <span>Switch context</span>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
