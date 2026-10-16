"use client";

import { Home, Plus, Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Create = { label: string; href: string };

const ICONS = { "Landlord lead": UserPlus, Contact: Users, Property: Home };

/**
 * Search and the New menu. The New menu links to the real create pages. Search
 * is a placeholder: it is not built yet, and says so rather than doing nothing.
 */
export function DashboardToolbar({ creates }: { creates: readonly Create[] }) {
  const [open, setOpen] = useState(false);
  const [searchNotice, setSearchNotice] = useState(false);
  return (
    <div className="grid gap-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search everything"
            placeholder="Search leads, contacts, properties…"
            className="pl-9"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setSearchNotice(true);
              }
            }}
            onChange={() => setSearchNotice(false)}
          />
        </div>
        {creates.length > 0 && (
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
        )}
      </div>
      <p
        aria-live="polite"
        className="min-h-4 text-xs text-muted-foreground empty:hidden"
      >
        {searchNotice &&
          "Search is not available yet. Search across leads, contacts and properties is planned."}
      </p>
    </div>
  );
}
