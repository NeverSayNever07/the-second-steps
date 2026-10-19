"use client";

import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-time-picker";
import { OptionSelect } from "@/components/ui/option-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ActionFormOptions } from "@/core/actions/application/form-options";
import type { WorkItem } from "@/core/actions/application/work-items";
import { addDays } from "./work-item-format";

type View = "menu" | "snooze" | "handover";

const itemClass =
  "w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-hidden";

/** Everything except "done", in one place: snooze, hand over and cancel. */
export function WorkItemMenu({
  item,
  options,
  today,
  disabled,
  onPlan,
  onSnooze,
  onHandOver,
  onCancel,
}: {
  item: WorkItem;
  options: ActionFormOptions;
  today: string;
  disabled: boolean;
  onPlan: (hour: number | null) => void;
  onSnooze: (dueOn: string) => void;
  onHandOver: (membershipId: string) => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [date, setDate] = useState(addDays(today, 1));
  const [person, setPerson] = useState("");

  const colleagues = options.assignees.filter(
    (candidate) =>
      candidate.membershipId !== item.assignee.membershipId &&
      (item.source !== "lead_task" || candidate.canWorkLeads) &&
      (candidate.branchIds === null ||
        candidate.branchIds.includes(item.branchId)),
  );

  function finish(run: () => void) {
    setOpen(false);
    run();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setView("menu");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More actions for ${item.title}`}
            disabled={disabled}
          />
        }
      >
        <MoreHorizontal aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        {view === "menu" && (
          <>
            {item.plannedFor && (
              <button
                type="button"
                className={itemClass}
                onClick={() => finish(() => onPlan(null))}
              >
                Remove from plan
              </button>
            )}
            <button
              type="button"
              className={itemClass}
              onClick={() => setView("snooze")}
            >
              Snooze…
            </button>
            <button
              type="button"
              className={itemClass}
              onClick={() => setView("handover")}
              disabled={colleagues.length === 0}
            >
              Hand over…
            </button>
            <button
              type="button"
              className={`${itemClass} text-destructive`}
              onClick={() => finish(onCancel)}
            >
              Cancel this action
            </button>
          </>
        )}
        {view === "snooze" && (
          <div className="grid gap-2 p-1.5">
            <BackButton onClick={() => setView("menu")} label="Snooze until" />
            <button
              type="button"
              className={itemClass}
              onClick={() => finish(() => onSnooze(addDays(today, 1)))}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className={itemClass}
              onClick={() => finish(() => onSnooze(addDays(today, 3)))}
            >
              In 3 days
            </button>
            <button
              type="button"
              className={itemClass}
              onClick={() => finish(() => onSnooze(addDays(today, 7)))}
            >
              Next week
            </button>
            <div className="flex gap-2">
              <DatePicker
                id="snooze-date"
                min={today}
                value={date}
                onChange={setDate}
                placeholder="Pick a date"
              />
              <Button
                size="sm"
                disabled={!date || date < today}
                onClick={() => finish(() => onSnooze(date))}
              >
                Set
              </Button>
            </div>
          </div>
        )}
        {view === "handover" && (
          <div className="grid gap-2 p-1.5">
            <BackButton onClick={() => setView("menu")} label="Hand over to" />
            <OptionSelect
              value={person}
              onValueChange={setPerson}
              placeholder="Choose a colleague"
              options={colleagues.map((candidate) => ({
                value: candidate.membershipId,
                label: candidate.name,
              }))}
            />
            <Button
              size="sm"
              disabled={!person}
              onClick={() => finish(() => onHandOver(person))}
            >
              Hand over
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BackButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      {label}
    </button>
  );
}
