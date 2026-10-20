"use client";

import { Home, Plus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Create = { label: string; href: string };

const ICONS = { "Landlord lead": UserPlus, Contact: Users, Property: Home };

/** The New menu, linking to the real create pages. Search lives in the top bar. */
export function DashboardToolbar({ creates }: { creates: readonly Create[] }) {
  const [open, setOpen] = useState(false);
  if (creates.length === 0) return null;
  return (
    <div className="flex justify-end">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label="Create something new"
            />
          }
        >
          <Plus aria-hidden="true" />
          New
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 gap-0.5 p-1.5">
          {creates.map(({ label, href }) => {
            const Icon = ICONS[label as keyof typeof ICONS] ?? Plus;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-hidden"
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
