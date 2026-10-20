"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  searchWorkspaceAction,
  type WorkspaceSearchState,
} from "@/app/dashboard/w/[workspaceSlug]/search-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchGroupKind } from "@/core/workspace/application/workspace-search";

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;

const GROUPS: Record<SearchGroupKind, { label: string; path: string }> = {
  contacts: { label: "Contacts and landlords", path: "contacts" },
  properties: { label: "Properties", path: "properties" },
  leads: { label: "Landlord leads", path: "enquiries" },
  instructions: { label: "Instructions", path: "instructions" },
};

export function WorkspaceSearch({ workspaceSlug }: { workspaceSlug: string }) {
  const inputId = useId();
  const panelId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [state, setState] = useState<WorkspaceSearchState | null>(null);
  const [settledQuery, setSettledQuery] = useState("");
  const trimmed = query.trim();
  const isReady = trimmed.length >= MIN_LENGTH;
  const isLoading = isReady && settledQuery !== trimmed;

  useEffect(() => {
    if (trimmed.length < MIN_LENGTH) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchWorkspaceAction(workspaceSlug, trimmed)
        .then((next) => {
          if (!cancelled) {
            setState(next);
            setSettledQuery(trimmed);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setState({ status: "error" });
            setSettledQuery(trimmed);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, workspaceSlug]);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  function reset() {
    setOpen(false);
    setMobileOpen(false);
    setQuery("");
    setState(null);
    setSettledQuery("");
  }

  const showPanel = open && isReady;
  const result = state?.status === "ok" ? state.result : null;

  return (
    <div ref={container} className="relative flex items-center">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="md:hidden"
        aria-label="Search"
        aria-expanded={mobileOpen}
        onClick={() => {
          setMobileOpen((value) => !value);
          setOpen(true);
        }}
      >
        <Search aria-hidden="true" />
      </Button>
      <div
        className={`${
          mobileOpen ? "fixed inset-x-4 top-[4.25rem] z-30" : "hidden"
        } md:static md:block md:w-72 lg:w-80`}
      >
        <label className="sr-only" htmlFor={inputId}>
          Search the workspace
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={inputId}
            className="pl-9 pr-9"
            type="text"
            autoComplete="off"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={panelId}
            placeholder="Search name, address, postcode"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              onClick={reset}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        {showPanel && (
          <div
            id={panelId}
            role="region"
            aria-label="Search results"
            aria-live="polite"
            className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/10 md:left-auto md:w-96"
          >
            {isLoading && !result ? (
              <p className="p-3 text-sm text-muted-foreground">Searching...</p>
            ) : state?.status === "error" ? (
              <p className="p-3 text-sm text-destructive" role="alert">
                Search is unavailable. Try again.
              </p>
            ) : result && result.groups.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No matches for this search.
              </p>
            ) : (
              result?.groups.map((group) => (
                <section key={group.kind} className="py-1">
                  <h2 className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {GROUPS[group.kind].label}
                  </h2>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          className="block rounded-lg px-3 py-2 hover:bg-muted"
                          href={`/dashboard/w/${workspaceSlug}/${GROUPS[group.kind].path}/${item.id}`}
                          onClick={reset}
                        >
                          <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                            {item.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.detail}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {group.hasMore && (
                    <p className="px-3 pb-1 text-xs text-muted-foreground">
                      More matches exist. Type more to narrow them.
                    </p>
                  )}
                </section>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
