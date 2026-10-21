"use client";

import { Ban, CheckCircle2, LoaderCircle, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { ActionDialog } from "@/components/instructions/action-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type OneStepAction = () => Promise<InstructionActionState>;
type ReasonAction = (
  state: InstructionActionState,
  data: FormData,
) => Promise<InstructionActionState>;

/** Confirms Content ready on the version shown. Saves nothing else. */
export function ConfirmContentReadyButton({
  action,
  disabled,
}: {
  action: OneStepAction;
  disabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="grid justify-items-start gap-2">
      <Button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const result = await action();
            setError(result.status === "error" ? result.message : "");
          })
        }
      >
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 aria-hidden="true" />
        )}
        Confirm Content ready
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ReasonFields({
  errors,
  label,
}: {
  errors: Partial<Record<string, string>>;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="listing-reason">{label}</Label>
      <Textarea id="listing-reason" name="reason" rows={3} maxLength={500} />
      {errors.reason && (
        <p className="text-xs text-destructive">{errors.reason}</p>
      )}
    </div>
  );
}

export function ReturnToDraftButton({ action }: { action: ReasonAction }) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Return to Draft"
      triggerIcon={<Undo2 aria-hidden="true" />}
      title="Return to Draft"
      description="The listing goes back to Draft so it can be edited. The reason is kept in its history."
      submitLabel="Return to Draft"
    >
      {(errors) => (
        <ReasonFields errors={errors} label="Why is it going back?" />
      )}
    </ActionDialog>
  );
}

export function WithdrawListingButton({ action }: { action: ReasonAction }) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Withdraw listing"
      triggerIcon={<Ban aria-hidden="true" />}
      triggerVariant="ghost"
      title="Withdraw this listing"
      description="A withdrawn listing is kept as history and cannot be reopened. Preparing a listing again starts a new one."
      submitLabel="Withdraw listing"
      destructive
    >
      {(errors) => (
        <ReasonFields errors={errors} label="Why is it being withdrawn?" />
      )}
    </ActionDialog>
  );
}
