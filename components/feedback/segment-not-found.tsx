"use client";

import {
  Building2,
  ContactRound,
  Handshake,
  Inbox,
  Megaphone,
  SearchX,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const KINDS = {
  contact: {
    icon: ContactRound,
    title: "Contact not found",
    message: "This record may not exist or may be outside your branch access.",
    back: "Back to contacts",
    segment: "contacts",
  },
  lead: {
    icon: Inbox,
    title: "Landlord lead not found",
    message: "It may be outside your branch access or no longer available.",
    back: "Back to landlord leads",
    segment: "enquiries",
  },
  property: {
    icon: Building2,
    title: "Property not found",
    message:
      "This property may not exist or may be outside your branch access.",
    back: "Back to properties",
    segment: "properties",
  },
  instruction: {
    icon: Handshake,
    title: "Instruction not found",
    message: "It may be outside your branch access or no longer available.",
    back: "Back to instructions",
    segment: "instructions",
  },
  listing: {
    icon: Megaphone,
    title: "Listing not found",
    message: "It may be outside your branch access or no longer available.",
    back: "Back to marketing",
    segment: "marketing",
  },
  page: {
    icon: SearchX,
    title: "Page not found",
    message:
      "This address may be wrong, or it may not be a record you can open. Try the search box, or go back to the dashboard.",
    back: "Back to the dashboard",
    segment: "",
  },
} as const;

export type NotFoundKind = keyof typeof KINDS;

/**
 * A "not found" screen that sits inside the app shell. It says the same thing
 * whether a record does not exist or the person may not see it, so it never
 * confirms that a hidden record is there. Next.js gives a not-found screen no
 * route parameters, and relative links resolve to the wrong place, so the
 * way back is built from the current address.
 */
export function SegmentNotFound({
  kind,
  platform = false,
}: {
  kind: NotFoundKind;
  /** The Zayto staff area, which has its own home. */
  platform?: boolean;
}) {
  const pathname = usePathname();
  const { icon: Icon, title, message, back, segment } = KINDS[kind];
  const workspace = /^\/dashboard\/w\/([^/]+)/.exec(pathname)?.[1];
  const home = platform
    ? "/platform"
    : workspace
      ? `/dashboard/w/${workspace}`
      : "/dashboard";
  const href = segment && workspace ? `${home}/${segment}` : home;
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="grid justify-items-center gap-4 py-12 text-center">
        <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <Button
          render={<Link href={href} />}
          nativeButton={false}
          variant="outline"
        >
          {platform ? "Back to the platform overview" : back}
        </Button>
      </CardContent>
    </Card>
  );
}
