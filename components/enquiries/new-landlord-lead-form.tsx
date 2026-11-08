"use client";

import { LoaderCircle, Plus } from "lucide-react";
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NewLandlordLeadState } from "@/app/dashboard/w/[workspaceSlug]/enquiries/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
    <div className="grid gap-1.5">
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
  children,
  first = false,
}: {
  title: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section
      className={`grid content-start gap-3 ${first ? "" : "border-t pt-4"}`}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Fields on the second step; any other error sends the person back to step 1. */
const STEP_TWO_FIELDS = new Set([
  "next",
  "scheduledAt",
  "assignedMembershipId",
  "bookingNotes",
  "taskTitle",
  "taskDueOn",
  "taskAssigneeId",
]);

type Next = "appraisal" | "task" | "none";

function NewLandlordLeadForm({
  action,
  onCancel,
  branches,
  leadSources,
  assignees,
  currentMembershipId,
}: {
  action: (
    state: NewLandlordLeadState,
    data: FormData,
  ) => Promise<NewLandlordLeadState>;
  onCancel: () => void;
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
  // Step 1 holds the essentials; step 2 is what happens next. A step-1 error
  // from the server brings the person back to step 1 once.
  const [chosen, setChosen] = useState<{ step: 1 | 2; at: unknown }>({
    step: 1,
    at: null,
  });
  const step1Error = Object.keys(errors).some(
    (field) => !STEP_TWO_FIELDS.has(field),
  );
  const step = chosen.at !== state && step1Error ? 1 : chosen.step;
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
        if (step === 1) {
          setChosen({ step: 2, at: state });
          return;
        }
        setReviewRun((run) => run + 1);
        submit({ intent: "review" });
      }}
      className="grid gap-4"
      noValidate
    >
      <input type="hidden" name="next" value={next} />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Step {step} of 2: {step === 1 ? "the essentials" : "what happens next"}
      </p>
      {state.status === "error" && state.message && (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.message}
        </div>
      )}

      <div className={step === 1 ? "grid gap-4" : "hidden"}>
        <Section first title="Landlord">
          <div className="grid gap-1.5">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="First name"
                name="firstName"
                errors={errors}
                required
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
              <div className="grid gap-1.5">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Telephone"
              name="telephone"
              type="tel"
              inputMode="tel"
              errors={errors}
            />
            <Field
              label="Email"
              name="email"
              type="email"
              inputMode="email"
              errors={errors}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A telephone number or an email address is needed.
          </p>
        </Section>

        <Section title="The property to let">
          <div className="grid gap-3 sm:grid-cols-2">
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
            <Field
              label="Town or city"
              name="townCity"
              errors={errors}
              required
            />
            <Field label="Postcode" name="postcode" errors={errors} required />
          </div>
          <div className="grid gap-1.5">
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
              <p className="text-xs text-destructive">{errors.propertyType}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Bedrooms, bathrooms and the landlord&apos;s own address can be added
            on their records afterwards.
          </p>
        </Section>

        <Section title="Lead details">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="branchId">
                Branch<span aria-hidden="true"> *</span>
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
            <div className="grid gap-1.5">
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
            <div className="grid gap-1.5">
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
          <div className="grid gap-1.5">
            <Label htmlFor="summary">Notes (optional)</Label>
            <Textarea
              id="summary"
              name="summary"
              rows={2}
              maxLength={2000}
              placeholder="Anything the team should know"
            />
          </div>
        </Section>
      </div>

      <div className={step === 2 ? "grid gap-4" : "hidden"}>
        <Section first title="What happens next">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
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
              <div className="grid gap-1.5">
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
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="bookingNotes">
                  Appointment notes (optional)
                </Label>
                <Textarea
                  id="bookingNotes"
                  name="bookingNotes"
                  rows={2}
                  maxLength={2000}
                  placeholder="For example, gate code, dog or directions"
                />
              </div>
            </div>
          )}
          {next === "task" && (
            <div className="grid gap-3">
              <Field
                label="What needs doing?"
                name="taskTitle"
                errors={errors}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
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
                <div className="grid gap-1.5">
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

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {step === 1 ? (
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setChosen({ step: 1, at: state })}
            >
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              )}
              {pending ? "Checking and saving…" : submitLabel}
            </Button>
          </>
        )}
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

/**
 * "New landlord lead" opens as a short two-step modal (ADR-038): a bottom
 * sheet on phones, a centred dialog from `md`. Saving opens the new lead.
 */
export function NewLandlordLeadDialog({
  defaultOpen = false,
  ...formProps
}: {
  defaultOpen?: boolean;
} & Omit<Parameters<typeof NewLandlordLeadForm>[0], "onCancel">) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        New landlord lead
      </DialogTrigger>
      <DialogContent className="top-auto bottom-0 left-0 max-h-[92dvh] max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none md:top-1/2 md:bottom-auto md:left-1/2 md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
        <DialogHeader>
          <DialogTitle>New landlord lead</DialogTitle>
          <DialogDescription>
            Just the essentials. Zayto checks for existing records and only asks
            when something may match.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <NewLandlordLeadForm {...formProps} onCancel={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
