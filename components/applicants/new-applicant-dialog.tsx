"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { startTransition, useActionState, useRef, useState } from "react";
import type { NewApplicantState } from "@/app/dashboard/w/[workspaceSlug]/applicants/actions";
import { DuplicateReviewDialog } from "@/components/enquiries/duplicate-review-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";

const IDLE: NewApplicantState = { status: "idle", message: "" };

function Field({
  label,
  name,
  errors,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  errors: Partial<Record<string, string>>;
  type?: "text" | "email" | "tel";
  required?: boolean;
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
        autoComplete="off"
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

function NewApplicantForm({
  action,
  onCancel,
  branches,
  leadSources,
  assignees,
  currentMembershipId,
}: {
  action: (
    state: NewApplicantState,
    data: FormData,
  ) => Promise<NewApplicantState>;
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
  const [branchId, setBranchId] = useState(
    branches.length === 1 ? branches[0].id : "",
  );
  const [reviewRun, setReviewRun] = useState(0);
  // Closing the review keeps what was typed; it belongs to one result.
  const [dismissed, setDismissed] = useState<unknown>(null);
  const reviewOpen = state.status === "review" && dismissed !== state;

  const staff = assignees.filter(
    ({ branchIds }) =>
      !branchId || branchIds === null || branchIds.includes(branchId),
  );
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

  return (
    <form
      ref={formRef}
      // Not action={...}: React would clear the fields after each submit.
      onSubmit={(event) => {
        event.preventDefault();
        setReviewRun((run) => run + 1);
        submit({ intent: "review" });
      }}
      className="grid gap-4"
      noValidate
    >
      {state.status === "error" && state.message && (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.message}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" name="firstName" errors={errors} required />
        <Field label="Last name" name="lastName" errors={errors} required />
        <Field label="Telephone" name="telephone" type="tel" errors={errors} />
        <Field label="Email" name="email" type="email" errors={errors} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        A telephone number or an email address is needed.
      </p>
      <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
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
          <Label htmlFor="leadSourceId">Source</Label>
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
            <p className="text-xs text-destructive">{errors.leadSourceId}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="leadMembershipId">Owner</Label>
          <OptionSelect
            key={`${branchId}-owner`}
            id="leadMembershipId"
            name="leadMembershipId"
            defaultValue={defaultStaff}
            placeholder="Not assigned yet"
            options={[
              { value: "", label: "Not assigned yet" },
              ...staff.map(({ membershipId, name }) => ({
                value: membershipId,
                label: name,
              })),
            ]}
          />
          {errors.leadMembershipId && (
            <p className="text-xs text-destructive">
              {errors.leadMembershipId}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        What they are looking for, other people in the household and the first
        next action are added on the applicant afterwards.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          )}
          {pending ? "Checking and saving…" : "Create applicant"}
        </Button>
      </div>
      <DuplicateReviewDialog
        key={reviewRun}
        open={reviewOpen}
        matches={state}
        pending={pending}
        contactNoun="applicant"
        onClose={() => setDismissed(state)}
        confirmLabel="Confirm and create"
        onConfirm={(choices) => submit({ intent: "book", ...choices })}
      />
    </form>
  );
}

/**
 * "New applicant" opens as a short modal (ADR-038): a bottom sheet on phones,
 * a centred dialog from `md`. Saving opens the new applicant.
 */
export function NewApplicantDialog({
  defaultOpen = false,
  ...formProps
}: {
  defaultOpen?: boolean;
} & Omit<Parameters<typeof NewApplicantForm>[0], "onCancel">) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        New applicant
      </DialogTrigger>
      <DialogContent className="top-auto bottom-0 left-0 max-h-[92dvh] max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none md:top-1/2 md:bottom-auto md:left-1/2 md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
        <DialogHeader>
          <DialogTitle>New applicant</DialogTitle>
          <DialogDescription>
            Just the essentials. Zayto checks for an existing contact and only
            asks when something may match.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <NewApplicantForm {...formProps} onCancel={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
