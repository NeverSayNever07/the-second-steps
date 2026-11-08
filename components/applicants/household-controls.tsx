"use client";

import { UserMinus, UserPlus, UserRoundCog } from "lucide-react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { ActionDialog } from "@/components/instructions/action-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";

type Action = (
  state: InstructionActionState,
  data: FormData,
) => Promise<InstructionActionState>;

type Errors = Partial<Record<string, string>>;

function Field({
  label,
  name,
  errors,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  errors: Errors;
  type?: "text" | "email" | "tel";
  required?: boolean;
}) {
  const error = errors[name];
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`member-${name}`}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <Input
        id={`member-${name}`}
        name={name}
        type={type}
        autoComplete="off"
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `member-${name}-error` : undefined}
      />
      {error && (
        <p id={`member-${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Add another adult to the household. */
export function AddHouseholdMember({ action }: { action: Action }) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Add a person"
      triggerIcon={<UserPlus aria-hidden="true" />}
      title="Add someone to the household"
      description="Another adult who will live in the home. Name and contact details only."
      submitLabel="Add to household"
    >
      {(errors) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" name="firstName" errors={errors} required />
          <Field label="Last name" name="lastName" errors={errors} required />
          <Field
            label="Telephone"
            name="telephone"
            type="tel"
            errors={errors}
          />
          <Field label="Email" name="email" type="email" errors={errors} />
          <p className="text-xs text-muted-foreground sm:col-span-2">
            A telephone number or an email address is needed.
          </p>
          {errors.different && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="different"
                value="yes"
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-warning">{errors.different}</span>
              </span>
            </label>
          )}
        </div>
      )}
    </ActionDialog>
  );
}

/** Take someone off the household (their contact is kept). */
export function RemoveHouseholdMember({
  action,
  name,
}: {
  action: Action;
  name: string;
}) {
  return (
    <ActionDialog
      action={action}
      triggerVariant="ghost"
      triggerSize="xs"
      triggerLabel="Remove"
      triggerIcon={<UserMinus aria-hidden="true" />}
      title={`Remove ${name}?`}
      description="They are taken off this household. Their contact record and the history are kept."
      submitLabel="Remove from household"
      destructive
    >
      {() => null}
    </ActionDialog>
  );
}

/** Change who looks after the applicant. */
export function ChangeApplicantOwner({
  action,
  assignees,
  currentMembershipId,
}: {
  action: Action;
  assignees: readonly { membershipId: string; name: string }[];
  currentMembershipId: string | null;
}) {
  return (
    <ActionDialog
      action={action}
      triggerVariant="secondary"
      triggerLabel="Change owner"
      triggerIcon={<UserRoundCog aria-hidden="true" />}
      title="Change owner"
      description="The person who looks after this applicant."
    >
      {(errors) => (
        <div className="grid gap-1.5">
          <Label htmlFor="membershipId">Owner</Label>
          <OptionSelect
            id="membershipId"
            name="membershipId"
            defaultValue={currentMembershipId ?? ""}
            placeholder="Not assigned"
            options={[
              { value: "", label: "Not assigned" },
              ...assignees.map(({ membershipId, name }) => ({
                value: membershipId,
                label: name,
              })),
            ]}
          />
          {errors.membershipId && (
            <p className="text-xs text-destructive">{errors.membershipId}</p>
          )}
        </div>
      )}
    </ActionDialog>
  );
}
