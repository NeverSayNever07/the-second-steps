"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

export type JourneyBarStep = {
  id: string;
  label: string;
  state: "done" | "current" | "ahead";
  caption: string;
  detail: string;
};

/**
 * Where a record is on its journey (ADR-039). Choosing a stage shows one
 * sentence about it underneath. On a small screen the strip scrolls inside
 * its own box and starts at the current stage.
 */
export function JourneyBar({ steps }: { steps: JourneyBarStep[] }) {
  const current = steps.find((step) => step.state === "current");
  const [selectedId, setSelectedId] = useState(current?.id ?? null);
  const selected = steps.find((step) => step.id === selectedId) ?? null;
  const listRef = useRef<HTMLOListElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);

  // On a narrow screen, start with the current stage in the middle of the
  // strip. Only the strip moves, never the page.
  useEffect(() => {
    const list = listRef.current;
    const item = currentRef.current;
    if (list && item) {
      list.scrollLeft =
        item.offsetLeft - (list.clientWidth - item.clientWidth) / 2;
    }
  }, []);

  return (
    <nav aria-label="Journey" className="min-w-0">
      <ol ref={listRef} className="relative flex overflow-x-auto pb-1">
        {steps.map((step, index) => {
          const on = step.id === selectedId;
          return (
            <li
              key={step.id}
              className="relative min-w-24 flex-1"
              ref={step.state === "current" ? currentRef : undefined}
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-3.5 right-1/2 h-0.5 w-full",
                    step.state === "ahead" ? "bg-border" : "bg-primary",
                  )}
                />
              )}
              <button
                type="button"
                aria-current={step.state === "current" ? "step" : undefined}
                aria-pressed={on}
                onClick={() => setSelectedId(on ? null : step.id)}
                className="group relative grid w-full justify-items-center gap-1.5 rounded-md pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative z-10 inline-flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    step.state === "done" &&
                      "border-primary bg-primary text-primary-foreground",
                    step.state === "current" &&
                      "border-primary bg-card text-primary ring-4 ring-primary/15",
                    step.state === "ahead" &&
                      "border-border bg-card text-muted-foreground",
                  )}
                >
                  {step.state === "done" ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    step.state === "ahead"
                      ? "text-muted-foreground"
                      : "font-medium",
                    on && "text-primary",
                  )}
                >
                  {step.label}
                  <span className="sr-only">
                    {step.state === "done"
                      ? " (done)"
                      : step.state === "current"
                        ? " (current)"
                        : " (still to come)"}
                  </span>
                </span>
                <span className="h-4 text-xs text-muted-foreground">
                  {step.caption}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-0.5 w-10 rounded-full",
                    on ? "bg-primary" : "bg-transparent group-hover:bg-border",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
      {selected && (
        <p
          className="border-t py-3 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <span className="font-medium text-foreground">{selected.label}:</span>{" "}
          {selected.detail}
        </p>
      )}
    </nav>
  );
}
