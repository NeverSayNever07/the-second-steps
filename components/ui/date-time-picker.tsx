"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { enGB } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** "YYYY-MM-DD" from a local Date. */
function dayText(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A local Date at midnight from "YYYY-MM-DD", or undefined. */
function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function timeSteps(from: number, to: number, step: number) {
  const steps: string[] = [];
  for (let minutes = from * 60; minutes < to * 60; minutes += step) {
    const pad = (value: number) => String(value).padStart(2, "0");
    steps.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return steps;
}

/** Quarter-hour times from 06:00 to 21:45, the usual appointment hours. */
const TIMES = timeSteps(6, 22, 15);

type Common = {
  id: string;
  /** Posts the chosen value under this name, like a normal field. */
  name?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Earliest day that can be chosen, "YYYY-MM-DD". */
  min?: string;
  /** Latest day that can be chosen, "YYYY-MM-DD". */
  max?: string;
  invalid?: boolean;
  describedBy?: string;
};

function Trigger({
  id,
  label,
  placeholder,
  disabled,
  invalid,
  describedBy,
}: Pick<Common, "id" | "placeholder" | "disabled" | "invalid" | "describedBy"> & {
  label: string | null;
}) {
  return (
    <PopoverTrigger
      render={
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="h-10 w-full justify-start gap-2 bg-muted/60 px-3 font-normal"
        />
      }
    >
      <CalendarDays aria-hidden="true" className="text-muted-foreground" />
      <span className={label ? "" : "text-muted-foreground"}>
        {label ?? placeholder ?? "Choose a date"}
      </span>
    </PopoverTrigger>
  );
}

function disabledDays(min?: string, max?: string) {
  const before = min ? parseDay(min) : undefined;
  const after = max ? parseDay(max) : undefined;
  return [
    ...(before ? [{ before }] : []),
    ...(after ? [{ after }] : []),
  ];
}

/**
 * A day picked from a calendar. `value` and `onChange` use "YYYY-MM-DD"; with
 * `name` it also posts like a normal date field. Weeks start on Monday.
 */
export function DatePicker({
  value,
  defaultValue = "",
  onChange,
  ...common
}: Common & {
  /** Controlled: the chosen day. Leave out to let the picker keep its own. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const date = parseDay(current);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {common.name && (
        <input type="hidden" name={common.name} value={current} />
      )}
      <Trigger
        {...common}
        label={date ? dayFormat.format(date) : null}
        placeholder={common.placeholder ?? "Choose a date"}
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={enGB}
          weekStartsOn={1}
          selected={date}
          defaultMonth={date}
          disabled={disabledDays(common.min, common.max)}
          onSelect={(next) => {
            if (!next) return;
            setOwn(dayText(next));
            onChange?.(dayText(next));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * A day and a time picked from a calendar and a time list (15-minute steps).
 * `value` and `onChange` use the timezone-free "YYYY-MM-DDTHH:mm" wall-clock
 * form. The receiving action decides which timezone it represents; with
 * `name` the picker also posts that value.
 */
export function DateTimePicker({
  value,
  defaultValue = "",
  onChange,
  ...common
}: Common & {
  /** Controlled: the chosen moment. Leave out to let the picker keep its own. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const [day = "", time = ""] = current.split("T");
  const date = parseDay(day);
  // A time outside the usual hours (or not on a quarter hour) is kept visible.
  const times = time && !TIMES.includes(time) ? [...TIMES, time].sort() : TIMES;
  const label = date
    ? `${dayFormat.format(date)}${time ? `, ${time}` : ""}`
    : null;

  function change(nextDay: string, nextTime: string) {
    const next = nextDay ? `${nextDay}T${nextTime || "09:00"}` : "";
    setOwn(next);
    onChange?.(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {common.name && (
        <input type="hidden" name={common.name} value={current} />
      )}
      <Trigger
        {...common}
        label={label}
        placeholder={common.placeholder ?? "Choose a date and time"}
      />
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <Calendar
            mode="single"
            locale={enGB}
            weekStartsOn={1}
            selected={date}
            defaultMonth={date}
            disabled={disabledDays(common.min, common.max)}
            onSelect={(next) => {
              if (next) change(dayText(next), time);
            }}
          />
          <div className="flex flex-col border-t sm:border-t-0 sm:border-l">
            <p className="px-3 pt-3 text-xs font-medium text-muted-foreground">
              Time
            </p>
            <div
              role="listbox"
              aria-label="Time"
              className="grid max-h-56 gap-0.5 overflow-y-auto p-2 sm:max-h-72"
            >
              {times.map((option) => (
                <button
                  key={option}
                  // Bring the chosen time (or 09:00 before one is chosen) into
                  // view when the list opens.
                  ref={(node) => {
                    if (node && option === (time || "09:00")) {
                      node.scrollIntoView({ block: "center" });
                    }
                  }}
                  type="button"
                  role="option"
                  aria-selected={option === time}
                  disabled={!date}
                  onClick={() => date && change(dayText(date), option)}
                  className="rounded-md px-3 py-1.5 text-left text-sm tabular-nums outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50 aria-selected:bg-primary aria-selected:text-primary-foreground"
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="border-t p-2">
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={!date}
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
