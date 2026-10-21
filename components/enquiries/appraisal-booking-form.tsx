"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import type { AppraisalBookingState } from "@/app/dashboard/w/[workspaceSlug]/enquiries/actions";
import { Button } from "@/components/ui/button";
import { DuplicateReviewDialog } from "./duplicate-review-dialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import { PROPERTY_TYPES } from "@/core/properties/domain/property";

const IDLE: AppraisalBookingState = { status: "idle", message: "" };
const TYPE_LABELS: Record<(typeof PROPERTY_TYPES)[number], string> = {
  detached: "Detached",
  semi_detached: "Semi-detached",
  terraced: "Terraced",
  bungalow: "Bungalow",
  flat: "Flat",
  maisonette: "Maisonette",
  room: "Room",
  other: "Other",
};

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "number";
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={type === "number" ? 0 : undefined}
      />
    </div>
  );
}

export function AppraisalBookingForm({
  action,
  cancelHref,
  enquiry,
  assignees,
  linked = null,
}: {
  action: (
    state: AppraisalBookingState,
    formData: FormData,
  ) => Promise<AppraisalBookingState>;
  cancelHref: string;
  enquiry: {
    name: string;
    email: string | null;
    telephone: string | null;
    addressBuilding: string | null;
    addressStreet: string | null;
    postcode: string;
  };
  assignees: readonly { membershipId: string; name: string }[];
  /** Set when the lead already has its landlord and property recorded. */
  linked?: { landlord: string; property: string } | null;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  // Each duplicate check starts a fresh review (choices reset to "new").
  const [reviewRun, setReviewRun] = useState(0);
  // The review pop-up belongs to one result; closing it keeps the typed details.
  const [dismissed, setDismissed] = useState<unknown>(null);
  const [kind, setKind] = useState<"person" | "organisation">("person");
  const [scheduledAt, setScheduledAt] = useState("");
  const names = enquiry.name.trim().split(/\s+/);
  const reviewOpen = state.status === "review" && dismissed !== state;

  /** Sends the form without React clearing the fields afterwards. */
  function submit(extra: Record<string, string | string[]>) {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    for (const [key, value] of Object.entries(extra)) {
      data.delete(key);
      for (const item of Array.isArray(value) ? value : [value]) {
        data.append(key, item);
      }
    }
    startTransition(() => formAction(data));
  }

  return (
    <form
      ref={formRef}
      // Not action={...}: React clears every field without a preset value
      // after each submit, which emptied the town, bedrooms and notes.
      onSubmit={(event) => {
        event.preventDefault();
        setReviewRun((run) => run + 1);
        submit({ intent: "review" });
      }}
      className="grid gap-10"
    >
      {state.message && state.status === "error" && (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-lg p-4 text-sm ${state.status === "error" ? "bg-destructive/10 text-destructive" : "bg-info-soft text-info"}`}
        >
          {state.message}
        </div>
      )}
      {linked && <input type="hidden" name="linked" value="yes" />}
      <div className="grid gap-10 xl:grid-cols-2 xl:gap-x-16">
        <div className="grid content-start gap-8">
          <section className="grid gap-4">
            <div>
              <h2 className="font-semibold">Visit</h2>
              <p className="text-sm text-muted-foreground">
                Choose when the appraisal will happen and who will attend.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scheduledAt">Date and time</Label>
              <DateTimePicker
                id="scheduledAt"
                name="scheduledAt"
                value={scheduledAt}
                onChange={setScheduledAt}
                placeholder="Choose a date and time"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assignedMembershipId">Assigned to</Label>
              <OptionSelect
                id="assignedMembershipId"
                name="assignedMembershipId"
                required
                placeholder="Choose a staff member"
                options={assignees.map(({ membershipId, name }) => ({
                  value: membershipId,
                  label: name,
                }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bookingNotes">Appointment notes (optional)</Label>
              <Textarea
                id="bookingNotes"
                name="bookingNotes"
                rows={3}
                maxLength={2000}
                placeholder="For example, gate code, dog or directions"
              />
            </div>
          </section>
          {linked && (
            <section className="grid gap-3 border-t pt-8">
              <div>
                <h2 className="font-semibold">Landlord and property</h2>
                <p className="text-sm text-muted-foreground">
                  Already recorded for this lead, so nothing more is needed.
                </p>
              </div>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Landlord</dt>
                  <dd className="font-medium">{linked.landlord}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Property</dt>
                  <dd className="font-medium">{linked.property}</dd>
                </div>
              </dl>
            </section>
          )}
          {!linked && (
            <section className="grid gap-4 border-t pt-8">
              <div>
                <h2 className="font-semibold">Landlord contact</h2>
                <p className="text-sm text-muted-foreground">
                  The real contact record is created or linked when you book.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactKind">Contact type</Label>
                <OptionSelect
                  id="contactKind"
                  name="contactKind"
                  value={kind}
                  onValueChange={(value) => setKind(value as typeof kind)}
                  options={[
                    { value: "person", label: "Person" },
                    { value: "organisation", label: "Organisation" },
                  ]}
                />
              </div>
              {kind === "person" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="First name"
                    name="firstName"
                    defaultValue={names.slice(0, -1).join(" ") || names[0]}
                    required
                  />
                  <Field
                    label="Last name"
                    name="lastName"
                    defaultValue={names.length > 1 ? names.at(-1) : ""}
                    required
                  />
                </div>
              ) : (
                <>
                  <Field
                    label="Legal name"
                    name="legalName"
                    defaultValue={enquiry.name}
                    required
                  />
                  <div className="grid gap-2">
                    <Label htmlFor="organisationType">Organisation type</Label>
                    <OptionSelect
                      id="organisationType"
                      name="organisationType"
                      required
                      defaultValue="limited_company"
                      options={[
                        { value: "limited_company", label: "Limited company" },
                        { value: "llp", label: "LLP" },
                        { value: "partnership", label: "Partnership" },
                        { value: "trust", label: "Trust" },
                        { value: "charity", label: "Charity" },
                        { value: "other", label: "Other" },
                      ]}
                    />
                  </div>
                </>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  defaultValue={enquiry.email ?? ""}
                />
                <Field
                  label="Telephone"
                  name="telephone"
                  type="tel"
                  defaultValue={enquiry.telephone ?? ""}
                />
              </div>
            </section>
          )}
        </div>
        {!linked && (
          <section className="grid content-start gap-4">
            <div>
              <h2 className="font-semibold">Property record</h2>
              <p className="text-sm text-muted-foreground">
                Complete the address and core property details.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Flat or building"
                name="addressBuilding"
                defaultValue={enquiry.addressBuilding ?? ""}
              />
              <Field
                label="Street"
                name="addressStreet"
                defaultValue={enquiry.addressStreet ?? ""}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Locality" name="addressLocality" />
              <Field label="Town or city" name="townCity" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="County" name="county" />
              <Field
                label="Postcode"
                name="postcode"
                defaultValue={enquiry.postcode}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="propertyType">Property type</Label>
              <OptionSelect
                id="propertyType"
                name="propertyType"
                required
                placeholder="Choose a type"
                options={PROPERTY_TYPES.map((value) => ({
                  value,
                  label: TYPE_LABELS[value],
                }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Bedrooms" name="bedrooms" type="number" />
              <Field label="Bathrooms" name="bathrooms" type="number" />
              <Field label="Receptions" name="receptionRooms" type="number" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="propertyNotes">Property notes</Label>
              <Textarea id="propertyNotes" name="propertyNotes" rows={3} />
            </div>
          </section>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t bg-background/95 py-4 backdrop-blur">
        <Button
          variant="outline"
          render={<Link href={cancelHref} />}
          nativeButton={false}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          )}
          {pending ? "Checking and booking…" : "Continue"}
        </Button>
      </div>

      <DuplicateReviewDialog
        key={reviewRun}
        open={reviewOpen}
        matches={state}
        pending={pending}
        onClose={() => setDismissed(state)}
        confirmLabel="Confirm and book appraisal"
        onConfirm={(choices) => submit({ intent: "book", ...choices })}
      />
    </form>
  );
}
