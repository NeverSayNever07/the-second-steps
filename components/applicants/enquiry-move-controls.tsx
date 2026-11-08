"use client";

import { ChevronLeft, ChevronRight, LoaderCircle, X } from "lucide-react";
import { startTransition, useActionState } from "react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { ActionDialog } from "@/components/instructions/action-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import { LETTINGS_NOTE_MAX } from "@/core/applicants/domain/reasons";

type MoveAction = (
  state: InstructionActionState,
  data: FormData,
) => Promise<InstructionActionState>;

const IDLE: InstructionActionState = { status: "idle", message: "" };

function StepButton({
  action,
  label,
  direction,
}: {
  action: MoveAction;
  label: string;
  direction: "back" | "forward";
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => formAction(new FormData()))}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : direction === "back" ? (
          <ChevronLeft aria-hidden="true" />
        ) : null}
        {label}
        {!pending && direction === "forward" ? (
          <ChevronRight aria-hidden="true" />
        ) : null}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="w-full text-xs text-destructive">
          {state.message}
        </p>
      )}
    </>
  );
}

/** Move one step on or back, or close with a reason. */
export function EnquiryMoveControls({
  previous,
  next,
  close,
  closeReasons,
  applicantName,
}: {
  previous: { label: string; action: MoveAction } | null;
  next: { label: string; action: MoveAction } | null;
  close: MoveAction;
  closeReasons: { id: string; name: string }[];
  applicantName: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {previous && (
        <StepButton
          action={previous.action}
          label={previous.label}
          direction="back"
        />
      )}
      {next && (
        <StepButton
          action={next.action}
          label={next.label}
          direction="forward"
        />
      )}
      <ActionDialog
        action={close}
        triggerLabel="Close"
        triggerSize="xs"
        triggerVariant="ghost"
        triggerIcon={<X aria-hidden="true" />}
        title={`Close the enquiry from ${applicantName}?`}
        description="Choose why. It can be reopened later while the home is still available."
        submitLabel="Close enquiry"
        destructive
      >
        {(errors) => (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="enquiry-close-reason">Reason</Label>
              <OptionSelect
                id="enquiry-close-reason"
                name="reasonId"
                placeholder="Choose a reason"
                options={[
                  { value: "", label: "Choose a reason" },
                  ...closeReasons.map(({ id, name }) => ({
                    value: id,
                    label: name,
                  })),
                ]}
              />
              {errors.reason && (
                <p className="text-xs text-destructive">{errors.reason}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="enquiry-close-note">Note (optional)</Label>
              <Textarea
                id="enquiry-close-note"
                name="note"
                rows={3}
                maxLength={LETTINGS_NOTE_MAX}
              />
              {errors.note && (
                <p className="text-xs text-destructive">{errors.note}</p>
              )}
            </div>
          </div>
        )}
      </ActionDialog>
    </div>
  );
}
