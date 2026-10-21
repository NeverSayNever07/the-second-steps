"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import type { ListingFormState } from "@/app/dashboard/w/[workspaceSlug]/marketing/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LISTING_LIMITS } from "@/core/listings/domain/listing-rules";

type SaveAction = (
  state: ListingFormState,
  data: FormData,
) => Promise<ListingFormState>;

const IDLE: ListingFormState = { status: "idle", message: "" };

function FieldError({
  name,
  errors,
}: {
  name: string;
  errors: Partial<Record<string, string>>;
}) {
  return errors[name] ? (
    <p id={`${name}-error`} className="text-xs text-destructive">
      {errors[name]}
    </p>
  ) : null;
}

export type ListingFormValues = {
  headline: string;
  summary: string;
  description: string;
  highlights: string[];
  /** "YYYY-MM-DD" or "" */
  availableFrom: string;
  availabilityNote: string;
  depositNote: string;
  materialInformation: string;
  materialInformationNotApplicable: boolean;
  notApplicable: ("bedrooms" | "bathrooms")[];
};

/**
 * The advert text. One explicit Save draft (no autosave) saves a new
 * version; a sticky save bar keeps it in reach on a phone, and leaving with
 * unsaved changes asks first. When saved, the page reloads the new version
 * and this form starts again from it.
 */
export function ListingContentForm({
  action,
  values,
  versionNo,
  canEdit,
}: {
  action: SaveAction;
  values: ListingFormValues;
  /** The version the fields were loaded from. */
  versionNo: number;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  // Edits belong to the version they were made on, so once a save lands and
  // the page moves to the next version the form is clean again.
  const [editedOnVersion, setEditedOnVersion] = useState<number | null>(null);
  const dirty = editedOnVersion === versionNo;
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const readOnly = !canEdit;
  return (
    <form
      action={formAction}
      onChange={() => setEditedOnVersion(versionNo)}
      className="grid gap-8"
      noValidate
    >
      <fieldset disabled={readOnly || pending} className="grid gap-8">
        <section className="grid gap-4">
          <h3 className="text-base font-semibold">Advert</h3>
          <div className="grid gap-2">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              name="headline"
              defaultValue={values.headline}
              maxLength={LISTING_LIMITS.headline}
              aria-describedby="headline-error"
            />
            <FieldError name="headline" errors={errors} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="summary">Short summary</Label>
            <Textarea
              id="summary"
              name="summary"
              rows={3}
              defaultValue={values.summary}
              maxLength={LISTING_LIMITS.summary}
              aria-describedby="summary-error"
            />
            <FieldError name="summary" errors={errors} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Full description</Label>
            <Textarea
              id="description"
              name="description"
              rows={8}
              defaultValue={values.description}
              maxLength={LISTING_LIMITS.description}
              aria-describedby="description-error"
            />
            <FieldError name="description" errors={errors} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="highlights">Feature highlights</Label>
            <Textarea
              id="highlights"
              name="highlights"
              rows={4}
              defaultValue={values.highlights.join("\n")}
              aria-describedby="highlights-help highlights-error"
            />
            <p id="highlights-help" className="text-xs text-muted-foreground">
              One per line, up to {LISTING_LIMITS.highlights}.
            </p>
            <FieldError name="highlights" errors={errors} />
          </div>
        </section>

        <section className="grid gap-4 border-t pt-6">
          <h3 className="text-base font-semibold">Availability and deposit</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="availableFrom">Available from</Label>
              <DatePicker
                id="availableFrom"
                name="availableFrom"
                defaultValue={values.availableFrom}
              />
              <FieldError name="availableFrom" errors={errors} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="availabilityNote">Availability note</Label>
              <Input
                id="availabilityNote"
                name="availabilityNote"
                defaultValue={values.availabilityNote}
                maxLength={LISTING_LIMITS.availabilityNote}
                placeholder="For example: once the current tenant leaves"
              />
              <FieldError name="availabilityNote" errors={errors} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="depositNote">Deposit note (optional)</Label>
            <Input
              id="depositNote"
              name="depositNote"
              defaultValue={values.depositNote}
              maxLength={LISTING_LIMITS.depositNote}
            />
            <FieldError name="depositNote" errors={errors} />
          </div>
        </section>

        <section className="grid gap-4 border-t pt-6">
          <h3 className="text-base font-semibold">Material information</h3>
          <p className="text-sm text-muted-foreground">
            What an applicant needs to know before deciding, for example service
            charges, restrictions or building works. Zayto does not provide a
            legal checklist.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="materialInformation">Material information</Label>
            <Textarea
              id="materialInformation"
              name="materialInformation"
              rows={5}
              defaultValue={values.materialInformation}
              maxLength={LISTING_LIMITS.materialInformation}
            />
            <FieldError name="materialInformation" errors={errors} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="materialInformationNotApplicable"
              value="yes"
              defaultChecked={values.materialInformationNotApplicable}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>There is none to add for this property</span>
          </label>
        </section>

        <section className="grid gap-3 border-t pt-6">
          <h3 className="text-base font-semibold">Rooms not applicable</h3>
          <p className="text-sm text-muted-foreground">
            Tick if the property has no bedrooms or bathrooms of its own, for
            example a room in a shared house.
          </p>
          {(["bedrooms", "bathrooms"] as const).map((item) => (
            <label key={item} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="notApplicable"
                value={item}
                defaultChecked={values.notApplicable.includes(item)}
                className="size-4 accent-primary"
              />
              <span>
                {item === "bedrooms" ? "Bedrooms" : "Bathrooms"} not applicable
              </span>
            </label>
          ))}
        </section>
      </fieldset>

      {!readOnly && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Save draft
          </Button>
          <p
            className="text-sm text-muted-foreground"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.status === "error" ? (
              <span className="text-destructive">{state.message}</span>
            ) : state.status === "saved" ? (
              state.message
            ) : dirty ? (
              "You have unsaved changes."
            ) : (
              "Saving creates a new version. Nothing is published."
            )}
          </p>
        </div>
      )}
    </form>
  );
}
