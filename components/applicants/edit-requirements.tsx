"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { ActionDialog } from "@/components/instructions/action-dialog";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import {
  REQUIREMENT_NOTES_HINT,
  sensitiveNotesWarning,
  type Requirements,
} from "@/core/applicants/domain/requirements";
import {
  penceToField,
  RENT_PERIOD_LABELS,
} from "@/core/instructions/domain/instruction-labels";
import { PROPERTY_TYPES } from "@/core/properties/domain/property";
import {
  FURNISHED_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/core/properties/domain/property-labels";

type Errors = Partial<Record<string, string>>;

function Field({
  label,
  name,
  defaultValue,
  errors,
  inputMode,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  errors: Errors;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
}) {
  const error = errors[name];
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
      />
      {error && (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Notes({
  defaultValue,
  error,
}: {
  defaultValue: string;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const warning = sensitiveNotesWarning(value);
  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <Label htmlFor="notes">Notes (optional)</Label>
      <Textarea
        id="notes"
        name="notes"
        rows={2}
        maxLength={500}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-describedby="notes-hint"
      />
      <p
        id="notes-hint"
        className={`text-xs ${warning ? "text-warning" : "text-muted-foreground"}`}
        role={warning ? "note" : undefined}
      >
        {warning ?? REQUIREMENT_NOTES_HINT}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Edit what the household is looking for: one dialog, one save. A change makes
 * a new version; the earlier ones stay in the history (ADR-036).
 */
export function EditRequirements({
  action,
  current,
  label = "Edit requirements",
}: {
  action: (
    state: InstructionActionState,
    data: FormData,
  ) => Promise<InstructionActionState>;
  current: Requirements | null;
  label?: string;
}) {
  return (
    <ActionDialog
      action={action}
      wide
      triggerLabel={label}
      triggerIcon={<Pencil aria-hidden="true" />}
      title="What they are looking for"
      description="Saving makes a new version. Earlier versions stay in the history."
      submitLabel="Save requirements"
    >
      {(errors) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Areas (separate with commas)"
              name="areas"
              defaultValue={current?.areas.join(", ")}
              errors={errors}
              placeholder="For example M20, Didsbury, Chorlton"
            />
          </div>
          <Field
            label="Least rent (£)"
            name="minRent"
            inputMode="decimal"
            defaultValue={penceToField(current?.minRentPence)}
            errors={errors}
          />
          <Field
            label="Most rent (£)"
            name="maxRent"
            inputMode="decimal"
            defaultValue={penceToField(current?.maxRentPence)}
            errors={errors}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="rentPeriod">Rent is</Label>
            <OptionSelect
              id="rentPeriod"
              name="rentPeriod"
              defaultValue={current?.rentPeriod ?? "month"}
              options={Object.entries(RENT_PERIOD_LABELS).map(
                ([value, text]) => ({ value, label: text }),
              )}
            />
            {errors.rentPeriod && (
              <p className="text-xs text-destructive">{errors.rentPeriod}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="furnished">Furnishing</Label>
            <OptionSelect
              id="furnished"
              name="furnished"
              defaultValue={current?.furnished ?? ""}
              placeholder="No preference"
              options={[
                { value: "", label: "No preference" },
                ...Object.entries(FURNISHED_STATUS_LABELS).map(
                  ([value, text]) => ({ value, label: text }),
                ),
              ]}
            />
            {errors.furnished && (
              <p className="text-xs text-destructive">{errors.furnished}</p>
            )}
          </div>
          <Field
            label="Fewest bedrooms"
            name="minBedrooms"
            inputMode="numeric"
            defaultValue={current?.minBedrooms}
            errors={errors}
          />
          <Field
            label="Most bedrooms"
            name="maxBedrooms"
            inputMode="numeric"
            defaultValue={current?.maxBedrooms}
            errors={errors}
          />
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="text-sm font-medium">Property types</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {PROPERTY_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="propertyTypes"
                    value={type}
                    defaultChecked={current?.propertyTypes.includes(type)}
                    className="size-4 accent-primary"
                  />
                  {PROPERTY_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
            {errors.propertyTypes && (
              <p className="text-xs text-destructive">{errors.propertyTypes}</p>
            )}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="moveFrom">Move in from</Label>
            <DatePicker
              id="moveFrom"
              name="moveFrom"
              defaultValue={current?.moveFrom ?? ""}
              invalid={Boolean(errors.moveFrom)}
            />
            {errors.moveFrom && (
              <p className="text-xs text-destructive">{errors.moveFrom}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="moveBy">Move in by</Label>
            <DatePicker
              id="moveBy"
              name="moveBy"
              defaultValue={current?.moveBy ?? ""}
              invalid={Boolean(errors.moveBy)}
            />
            {errors.moveBy && (
              <p className="text-xs text-destructive">{errors.moveBy}</p>
            )}
          </div>
          <Field
            label="People in the household"
            name="householdSize"
            inputMode="numeric"
            defaultValue={current?.householdSize}
            errors={errors}
          />
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              name="hasPets"
              value="yes"
              defaultChecked={current?.hasPets}
              className="size-4 accent-primary"
            />
            Has pets
          </label>
          <Notes defaultValue={current?.notes ?? ""} error={errors.notes} />
        </div>
      )}
    </ActionDialog>
  );
}
