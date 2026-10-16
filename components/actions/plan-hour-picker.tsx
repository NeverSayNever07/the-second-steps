"use client";

import { Button } from "@/components/ui/button";
import { PLAN_HOURS, hourLabel } from "./work-item-format";

/** Whole-hour buttons for planning an action into today. */
export function PlanHourPicker({
  onPick,
  disabled,
}: {
  onPick: (hour: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Hour">
      {PLAN_HOURS.map((hour) => (
        <Button
          key={hour}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onPick(hour)}
        >
          {hourLabel(hour)}
        </Button>
      ))}
    </div>
  );
}
