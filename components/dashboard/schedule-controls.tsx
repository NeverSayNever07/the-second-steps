"use client";

import { CalendarPlus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { planWorkItemAction } from "@/app/dashboard/w/[workspaceSlug]/work-item-actions";
import { PlanHourPicker } from "@/components/actions/plan-hour-picker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ItemRef = { source: string; id: string };

/** Drops an action into an hour of today. */
export function PlanPopover({
  workspaceSlug,
  item,
  title,
}: {
  workspaceSlug: string;
  item: ItemRef;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            aria-label={`Plan ${title} into today`}
          />
        }
      >
        <CalendarPlus aria-hidden="true" />
        Plan
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="text-xs font-medium text-muted-foreground">
          Plan into today at
        </p>
        <PlanHourPicker
          disabled={pending}
          onPick={(hour) =>
            startTransition(async () => {
              const result = await planWorkItemAction(
                workspaceSlug,
                { source: item.source, id: item.id },
                hour,
              );
              if (result.ok) setOpen(false);
              else setError(result.message);
            })
          }
        />
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Takes an action back out of the day plan. */
export function UnplanButton({
  workspaceSlug,
  item,
  title,
}: {
  workspaceSlug: string;
  item: ItemRef;
  title: string;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${title} from the plan`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await planWorkItemAction(
              workspaceSlug,
              { source: item.source, id: item.id },
              null,
            );
            if (!result.ok) setError(result.message);
          })
        }
      >
        <X aria-hidden="true" />
      </Button>
    </span>
  );
}
