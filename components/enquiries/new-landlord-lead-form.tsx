"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NewLandlordLeadState } from "@/app/dashboard/w/[workspaceSlug]/enquiries/actions";
import { Button } from "@/components/ui/button";
import { DatePicker, DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import { PROPERTY_TYPES } from "@/core/properties/domain/property";
import { DuplicateReviewDialog } from "./duplicate-review-dialog";

const IDLE: NewLandlordLeadState = { status: "idle", message: "" };

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

type Errors = Partial<Record<string, string>>;

function Field({
  label,
  name,
  errors,
  type = "text",
  required,
  autoComplete = "off",
  inputMode,
}: {
  label: string;
  name: string;
  errors: Errors;
  type?: "text" | "email" | "tel" | "number";
  required?: boolean;
  autoComplete?: string;
  inputMode?: "numeric" | "decimal" | "tel" | "email";
}) {
  const error = errors[name];
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        min={type === "number" ? 0 : undefined}
        aria-required={required}
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

function Section({
  title,
  description,
  children,
  first = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section
      className={`grid content-start gap-4 ${first ? "" : "border-t pt-8"}`}
    >
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

type Next = "appraisal" | "task" | "none";

export function NewLandlordLeadForm({
  action,
  cancelHref,
  branches,
  leadSources,
  assignees,
  currentMembershipId,
}: {
  action: (
    state: NewLandlordLeadState,
    data: FormData,
  ) => Promise<NewLandlordLeadState>;
  cancelHref: string;
  branches: readonly { id: string; name: string }[];
  leadSources: readonly { id: string; name: string }[];
  assignees: readonly {
    membershipId: string;
    name: string;
    branchIds: readonly string[] | null;
  }[];
  currentMembershipId: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.fieldErrors ?? {};
  const [kind, setKind] = useState<"person" | "organisation">("person");
  const [branchId, setBranchId] = useState(
    branches.length === 1 ? branches[0].id : "",
  );
  const [next, setNext] = useState<Next>("appraisal");
  const [scheduledAt, setScheduledAt] = useState("");
  const [reviewRun, setReviewRun] = useState(0);
  // Closing the review keeps what was typed; it belongs to one result.
  const [dismissed, setDismissed] = useState<unknown>(null);
  const reviewOpen = state.status === "review" && dismissed !== state;

  const staff = assignees.filter(
    ({ branchIds }) =>
      !branchId || branchIds === null || branchIds.includes(branchId),
  );
  const staffOptions = staff.map(({ membershipId, name }) => ({
    value: membershipId,
    label: name,
  }));
  const defaultStaff = staff.some(
    ({ membershipId }) => membershipId === currentMembershipId,
  )
    ? currentMembershipId
    : "";

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

  const submitLabel =
    next === "appraisal"
      ? "Create lead and book appraisal"
      : next === "task"
        ? "Create lead"
        : "Save lead";

  return (
    <form
      ref={formRef}
      // Not action={...}: React would clear the fields after each submit.
      onSubmit={(event) => {
        event.preventDefault();
        setReviewRun((run) => run + 1);
        submit({ intent: "review" });
      }}
      className="grid gap-10"
      noValidate
    >
      <input type="hidden" name="next" value={next} />
      {state.status === "error" && state.message && (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
        >
          {state.message}
        </div>
      )}

      <div className="grid gap-10 xl:grid-cols-2 xl:gap-x-16">
        <div className="grid content-start gap-10">
          <Section
            first
            title="Landlord"
            description="Who owns the property and is asking us to let it."
          >
            <div className="grid gap-2">
              <Label htmlFor="contactKind">Landlord is</Label>
              <OptionSelect
                id="contactKind"
                name="contactKind"
                value={kind}
                onValueChange={(value) => setKind(value as typeof kind)}
                options={[
                  { value: "person", label: "A person" },
                  { value: "organisation", label: "An organisation" },
                ]}
              />
            </div>
            {kind === "person" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="First name"
                  name="firstName"
                  errors={errors}
                  required
                  autoComplete="off"
                />
                <Field
                  label="Last name"
                  name="lastName"
                  errors={errors}
                  required
                />
              </div>
            ) : (
              <>
                <Field
                  label="Legal name"
                  name="legalName"
                  errors={errors}
                  required
                />
                <div className="grid gap-2">
                  <Label htmlFor="organisationType">Organisation type</Label>
                  <OptionSelect
                    id="organisationType"
                    name="organisationType"
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
                  {errors.organisationType && (
                    <p className="text-xs text-destructive">
                      {errors.organisationType}
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Telephone"
                name="telephone"
                type="tel"
                inputMode="tel"
                errors={errors}
                autoComplete="off"
              />
              <Field
                label="Email"
                name="email"
                type="email"
                inputMode="email"
                errors={errors}
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A telephone number or an email address is needed.
            </p>
            <details className="group rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Landlord&apos;s own address (optional)
              </summary>
              <div className="mt-4 grid gap-4">
                <p className="text-xs text-muted-foreground">
                  Where the landlord lives or receives post. This is not the
                  property being let: that is asked for separately.
                </p>
                <Field
                  label="Address line 1"
                  name="ownAddressLine1"
                  errors={errors}
                  autoComplete="off"
                />
                <Field
                  label="Address line 2"
                  name="ownAddressLine2"
                  errors={errors}
                  autoComplete="off"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Locality" name="ownLocality" errors={errors} />
                  <Field
                    label="Town or city"
                    name="ownTownCity"
                    errors={errors}
                  />
                  <Field label="County" name="ownCounty" errors={errors} />
                  <Field label="Postcode" name="ownPostcode" errors={errors} />
                </div>
              </div>
            </details>
          </Section>

          <Section
            title="Lead details"
            description="Where it came from and who looks after it."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="branchId">
                  Responsible branch<span aria-hidden="true"> *</span>
                </Label>
                <OptionSelect
                  id="branchId"
                  name="branchId"
                  value={branchId}
                  onValueChange={setBranchId}
                  placeholder="Choose a branch"
                  options={branches.map(({ id, name }) => ({
                    value: id,
                    label: name,
                  }))}
                />
                {errors.branchId && (
                  <p className="text-xs text-destructive">{errors.branchId}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="leadSourceId">Lead source</Label>
                <OptionSelect
                  id="leadSourceId"
                  name="leadSourceId"
                  placeholder="Choose a source"
                  options={[
                    { value: "", label: "Not known yet" },
                    ...leadSources.map(({ id, name }) => ({
                      value: id,
                      label: name,
                    })),
                  ]}
                />
                {errors.leadSourceId && (
                  <p className="text-xs text-destructive">
                    {errors.leadSourceId}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="leadMembershipId">Looked after by</Label>
                <OptionSelect
                  key={`${branchId}-staff`}
                  id="leadMembershipId"
                  name="leadMembershipId"
                  defaultValue={defaultStaff}
                  placeholder="Not assigned yet"
                  options={[
                    { value: "", label: "Not assigned yet" },
                    ...staffOptions,
                  ]}
                />
                {errors.leadMembershipId && (
                  <p className="text-xs text-destructive">
                    {errors.leadMembershipId}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="summary">Internal summary (optional)</Label>
              <Textarea id="summary" name="summary" rows={3} maxLength={2000} />
            </div>
          </Section>
        </div>

        <div className="grid content-start gap-10">
          <Section
            first
            title="The property to let"
            description="The rental property, not the landlord's own home."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Flat or building"
                name="addressBuilding"
                errors={errors}
              />
              <Field
                label="Street"
                name="addressStreet"
                errors={errors}
                required
              />
              <Field label="Locality" name="addressLocality" errors={errors} />
              <Field
                label="Town or city"
                name="townCity"
                errors={errors}
                required
              />
              <Field label="County" name="county" errors={errors} />
              <Field
                label="Postcode"
                name="postcode"
                errors={errors}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="propertyType">
                Property type<span aria-hidden="true"> *</span>
              </Label>
              <OptionSelect
                id="propertyType"
                name="propertyType"
                placeholder="Choose a type"
                options={PROPERTY_TYPES.map((value) => ({
                  value,
                  label: TYPE_LABELS[value],
                }))}
              />
              {errors.propertyType && (
                <p className="text-xs text-destructive">
                  {errors.propertyType}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field
                label="Bedrooms"
                name="bedrooms"
                type="number"
                inputMode="numeric"
                errors={errors}
              />
              <Field
                label="Bathrooms"
                name="bathrooms"
                type="number"
                inputMode="numeric"
                errors={errors}
              />
              <Field
                label="Receptions"
                name="receptionRooms"
                type="number"
                inputMode="numeric"
                errors={errors}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="propertyNotes">Property notes (optional)</Label>
              <Textarea
                id="propertyNotes"
                name="propertyNotes"
                rows={3}
                maxLength={2000}
              />
              {errors.propertyNotes && (
                <p className="text-xs text-destructive">
                  {errors.propertyNotes}
                </p>
              )}
            </div>
          </Section>

          <Section
            title="What happens next"
            description="Book the appraisal now, set a next action, or save the lead as it is."
          >
            <fieldset className="grid gap-2">
              <legend className="sr-only">What happens next</legend>
              {(
                [
                  ["appraisal", "Book the appraisal now"],
                  ["task", "Set a next action"],
                  ["none", "Save the lead for now"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="nextChoice"
                    value={value}
                    checked={next === value}
                    onChange={() => setNext(value)}
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {errors.next && (
              <p className="text-xs text-destructive">{errors.next}</p>
            )}
            {next === "appraisal" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="scheduledAt">
                    Date and time<span aria-hidden="true"> *</span>
                  </Label>
                  <DateTimePicker
                    id="scheduledAt"
                    name="scheduledAt"
                    value={scheduledAt}
                    onChange={setScheduledAt}
                    placeholder="Choose a date and time"
                    invalid={Boolean(errors.scheduledAt)}
                  />
                  {errors.scheduledAt && (
                    <p className="text-xs text-destructive">
                      {errors.scheduledAt}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="assignedMembershipId">
                    Who will attend<span aria-hidden="true"> *</span>
                  </Label>
                  <OptionSelect
                    key={`${branchId}-attendee`}
                    id="assignedMembershipId"
                    name="assignedMembershipId"
                    defaultValue={defaultStaff}
                    placeholder="Choose a staff member"
                    options={staffOptions}
                  />
                  {errors.assignedMembershipId && (
                    <p className="text-xs text-destructive">
                      {errors.assignedMembershipId}
                    </p>
                  )}
                </div>
              </div>
            )}
            {next === "task" && (
              <div className="grid gap-4">
                <Field
                  label="What needs doing?"
                  name="taskTitle"
                  errors={errors}
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="taskDueOn">
                      Due date<span aria-hidden="true"> *</span>
                    </Label>
                    <DatePicker
                      id="taskDueOn"
                      name="taskDueOn"
                      invalid={Boolean(errors.taskDueOn)}
                    />
                    {errors.taskDueOn && (
                      <p className="text-xs text-destructive">
                        {errors.taskDueOn}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="taskAssigneeId">
                      Assigned to<span aria-hidden="true"> *</span>
                    </Label>
                    <OptionSelect
                      key={`${branchId}-task`}
                      id="taskAssigneeId"
                      name="taskAssigneeId"
                      defaultValue={defaultStaff}
                      placeholder="Choose a staff member"
                      options={staffOptions}
                    />
                    {errors.taskAssigneeId && (
                      <p className="text-xs text-destructive">
                        {errors.taskAssigneeId}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 py-4 backdrop-blur">
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
          {pending ? "Checking and saving…" : submitLabel}
        </Button>
      </div>

      <DuplicateReviewDialog
        key={reviewRun}
        open={reviewOpen}
        matches={state}
        pending={pending}
        onClose={() => setDismissed(state)}
        confirmLabel={
          next === "appraisal"
            ? "Confirm and book appraisal"
            : "Confirm and save"
        }
        onConfirm={(choices) => submit({ intent: "book", ...choices })}
      />
    </form>
  );
}
