"use client";

import { Ban, Pause, Play, RotateCcw } from "lucide-react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { ActionDialog } from "@/components/instructions/action-dialog";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicantStatusCode } from "@/core/applicants/domain/applicant";
import { LETTINGS_NOTE_MAX } from "@/core/applicants/domain/reasons";

type StatusAction = (
  state: InstructionActionState,
  data: FormData,
) => Promise<InstructionActionState>;

function NoteField({
  label,
  errors,
}: {
  label: string;
  errors: Partial<Record<string, string>>;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="applicant-note">{label}</Label>
      <Textarea
        id="applicant-note"
        name="note"
        rows={3}
        maxLength={LETTINGS_NOTE_MAX}
      />
      {errors.note && <p className="text-xs text-destructive">{errors.note}</p>}
    </div>
  );
}

/** Hold, resume, close and reopen: one dialog per task, one reviewed save. */
export function ApplicantStatusControls({
  status,
  canManage,
  canReopen,
  action,
  closeReasons,
}: {
  status: ApplicantStatusCode;
  canManage: boolean;
  canReopen: boolean;
  action: StatusAction;
  closeReasons: { id: string; name: string }[];
}) {
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "active" && (
        <ActionDialog
          action={action}
          triggerVariant="secondary"
          triggerLabel="Put on hold"
          triggerIcon={<Pause aria-hidden="true" />}
          title="Put this applicant on hold"
          description="They stay on the list and can be resumed at any time. The note is kept in the history."
          submitLabel="Put on hold"
        >
          {(errors) => (
            <>
              <input type="hidden" name="to" value="on_hold" />
              <NoteField label="Note (optional)" errors={errors} />
            </>
          )}
        </ActionDialog>
      )}
      {status === "on_hold" && (
        <ActionDialog
          action={action}
          triggerVariant="secondary"
          triggerLabel="Resume"
          triggerIcon={<Play aria-hidden="true" />}
          title="Resume this applicant"
          submitLabel="Resume"
        >
          {(errors) => (
            <>
              <input type="hidden" name="to" value="active" />
              <NoteField label="Note (optional)" errors={errors} />
            </>
          )}
        </ActionDialog>
      )}
      {status !== "closed" && (
        <ActionDialog
          action={action}
          triggerLabel="Close applicant"
          triggerIcon={<Ban aria-hidden="true" />}
          triggerVariant="secondary"
          title="Close this applicant"
          description="The record and its history are kept. A manager can reopen it later."
          submitLabel="Close applicant"
          destructive
        >
          {(errors) => (
            <>
              <input type="hidden" name="to" value="closed" />
              <div className="grid gap-2">
                <Label htmlFor="applicant-reason">Reason</Label>
                <OptionSelect
                  id="applicant-reason"
                  name="reasonId"
                  defaultValue=""
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
              <NoteField label="Note (optional)" errors={errors} />
            </>
          )}
        </ActionDialog>
      )}
      {status === "closed" && canReopen && (
        <ActionDialog
          action={action}
          triggerVariant="secondary"
          triggerLabel="Reopen"
          triggerIcon={<RotateCcw aria-hidden="true" />}
          title="Reopen this applicant"
          description="They become Active again. This is refused if their lead contact already has another open applicant."
          submitLabel="Reopen"
        >
          {(errors) => (
            <>
              <input type="hidden" name="to" value="active" />
              <NoteField label="Note (optional)" errors={errors} />
            </>
          )}
        </ActionDialog>
      )}
    </div>
  );
}
