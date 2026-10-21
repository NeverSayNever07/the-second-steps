"use client";

import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { ActionDialog } from "@/components/instructions/action-dialog";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import {
  APPLICABILITY_LABELS,
  EVIDENCE_STATUS_LABELS,
} from "@/core/compliance/domain/compliance-labels";
import {
  EVIDENCE_HEADER,
  type ApplicabilityCode,
  type ComplianceAreaCode,
} from "@/core/compliance/domain/compliance";

type Action = (
  state: InstructionActionState,
  data: FormData,
) => Promise<InstructionActionState>;

type Intent = "applicability" | "evidence" | "status";

const INTENT_LABELS: Record<Intent, string> = {
  applicability: "Whether it applies to this property",
  evidence: "Add evidence",
  status: "Review the evidence",
};

function uploadMessage(error: string | undefined) {
  switch (error) {
    case "unsupported_type":
    case "type_not_allowed":
      return "Only a PDF, JPEG or PNG can be uploaded.";
    case "encrypted_pdf":
      return "That PDF is password protected. Upload an unprotected copy.";
    case "too_large":
      return "That file is over 10 MB.";
    case "empty":
    case "incomplete_file":
      return "That file looks empty or damaged. Choose it again.";
    case "record_closed":
      return "This property is archived, so no evidence can be added.";
    case "access_denied":
      return "You do not have access to add evidence here.";
    default:
      return "The file could not be uploaded. Try again.";
  }
}

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

/**
 * The one place to record anything about an area: whether it applies, new
 * evidence, or which evidence is relied on. The person picks the task and
 * saves once. Evidence with a file uploads first and is recorded by the
 * upload itself; the facts are checked before the file is sent.
 */
export function ComplianceUpdateButton({
  workspaceSlug,
  propertyId,
  area,
  label,
  isFileRequired,
  today,
  applicability,
  evidenceOptions,
  action,
}: {
  workspaceSlug: string;
  propertyId: string;
  area: ComplianceAreaCode;
  label: string;
  isFileRequired: boolean;
  today: string;
  applicability: ApplicabilityCode | "not_assessed";
  /** Evidence that can be reviewed: id and a short description. */
  evidenceOptions: { id: string; label: string }[];
  action: Action;
}) {
  const router = useRouter();
  const canReview = applicability === "applies" && evidenceOptions.length > 0;
  const intents: Intent[] = canReview
    ? ["applicability", "evidence", "status"]
    : ["applicability", "evidence"];
  const [intent, setIntent] = useState<Intent>(
    applicability === "not_assessed" ? "applicability" : "evidence",
  );
  const [choice, setChoice] = useState<string>("applies");
  const [status, setStatus] = useState<string>("reviewed");

  const run: Action = async (state, data) => {
    data.set("intent", intent);
    if (intent !== "evidence") return action(state, data);

    const file = data.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (!hasFile) {
      if (isFileRequired) {
        return {
          status: "error",
          message: "Choose the file this evidence comes from.",
        };
      }
      data.delete("file");
      return action(state, data);
    }

    const field = (name: string) => {
      const value = data.get(name);
      return typeof value === "string" ? value : "";
    };
    const facts = {
      area,
      reference: field("reference"),
      provider: field("provider"),
      eventOn: field("eventOn"),
      expiresOn: field("expiresOn"),
      epcRating: field("epcRating"),
      notes: field("notes"),
    };
    const query = new URLSearchParams({
      kind: "compliance_evidence",
      recordId: propertyId,
      name: file.name,
    });
    try {
      const response = await fetch(
        `/dashboard/w/${encodeURIComponent(workspaceSlug)}/documents/upload?${query}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            "x-zayto-upload": "1",
            [EVIDENCE_HEADER]: encodeURIComponent(JSON.stringify(facts)),
          },
          body: file,
        },
      );
      const body = (await response.json()) as {
        ok: boolean;
        error?: string;
        fieldErrors?: Partial<Record<string, string>>;
      };
      if (body.error === "invalid_evidence") {
        return {
          status: "error",
          message: "Check the details and try again.",
          fieldErrors: body.fieldErrors,
        };
      }
      if (!response.ok || !body.ok) {
        return { status: "error", message: uploadMessage(body.error) };
      }
      router.refresh();
      return { status: "saved", message: "Evidence added." };
    } catch {
      return {
        status: "error",
        message: "The file could not be uploaded. Try again.",
      };
    }
  };

  return (
    <ActionDialog
      action={run}
      triggerLabel="Update"
      triggerIcon={<ClipboardCheck aria-hidden="true" />}
      title={label}
      description="Record what you know from the evidence. Zayto keeps the dates you enter and does not decide whether the property is compliant."
      submitLabel="Save"
    >
      {(errors) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="compliance-intent">
              What do you want to record?
            </Label>
            <OptionSelect
              id="compliance-intent"
              value={intent}
              onValueChange={(next) => setIntent(next as Intent)}
              options={intents.map((value) => ({
                value,
                label: INTENT_LABELS[value],
              }))}
            />
          </div>

          {intent === "applicability" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="compliance-applicability">
                  Does this apply to the property?
                </Label>
                <OptionSelect
                  id="compliance-applicability"
                  name="applicability"
                  value={choice}
                  onValueChange={setChoice}
                  options={(
                    [
                      "applies",
                      "does_not_apply",
                      "needs_specialist_review",
                    ] as const
                  ).map((value) => ({
                    value,
                    label: APPLICABILITY_LABELS[value],
                  }))}
                />
                <FieldError name="applicability" errors={errors} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">
                  Reason{choice === "applies" ? " (optional)" : ""}
                </Label>
                <Textarea
                  id="reason"
                  name="reason"
                  rows={3}
                  maxLength={1000}
                  aria-describedby="reason-error"
                />
                <FieldError name="reason" errors={errors} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourceNote">Source (optional)</Label>
                <Input
                  id="sourceNote"
                  name="sourceNote"
                  maxLength={500}
                  placeholder="For example a council letter or an agreement"
                />
                <FieldError name="sourceNote" errors={errors} />
              </div>
            </>
          )}

          {intent === "evidence" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="compliance-file">
                  File{isFileRequired ? "" : " (optional)"}
                </Label>
                <Input
                  id="compliance-file"
                  name="file"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                />
                <p className="text-xs text-muted-foreground">
                  PDF, JPEG or PNG, up to 10 MB.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="eventOn">Date on the evidence</Label>
                  <DatePicker
                    id="eventOn"
                    name="eventOn"
                    max={today}
                    required
                  />
                  <FieldError name="eventOn" errors={errors} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="expiresOn">Expires or due again</Label>
                  <DatePicker id="expiresOn" name="expiresOn" />
                  <FieldError name="expiresOn" errors={errors} />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Enter the dates exactly as written on the evidence.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="reference">Reference (optional)</Label>
                  <Input id="reference" name="reference" maxLength={120} />
                  <FieldError name="reference" errors={errors} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="provider">
                    Engineer, company or council (optional)
                  </Label>
                  <Input id="provider" name="provider" maxLength={160} />
                  <FieldError name="provider" errors={errors} />
                </div>
              </div>
              {area === "epc_mees" && (
                <div className="grid gap-2">
                  <Label htmlFor="epcRating">Energy rating (optional)</Label>
                  <OptionSelect
                    id="epcRating"
                    name="epcRating"
                    defaultValue=""
                    placeholder="Choose a rating"
                    options={[
                      { value: "", label: "Not recorded" },
                      ...["A", "B", "C", "D", "E", "F", "G"].map((value) => ({
                        value,
                        label: value,
                      })),
                    ]}
                  />
                  <FieldError name="epcRating" errors={errors} />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" name="notes" rows={3} maxLength={1000} />
                <FieldError name="notes" errors={errors} />
              </div>
            </>
          )}

          {intent === "status" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="compliance-evidence">
                  Which evidence are you relying on?
                </Label>
                <OptionSelect
                  id="compliance-evidence"
                  name="evidenceId"
                  defaultValue={evidenceOptions[0]?.id}
                  options={evidenceOptions.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                />
                <FieldError name="evidenceId" errors={errors} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="compliance-status">
                  Outcome of your review
                </Label>
                <OptionSelect
                  id="compliance-status"
                  name="status"
                  value={status}
                  onValueChange={setStatus}
                  options={(["reviewed", "action_required"] as const).map(
                    (value) => ({
                      value,
                      label: EVIDENCE_STATUS_LABELS[value],
                    }),
                  )}
                />
                <FieldError name="status" errors={errors} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="note">
                  {status === "action_required"
                    ? "What action is needed?"
                    : "Note (optional)"}
                </Label>
                <Textarea id="note" name="note" rows={3} maxLength={1000} />
                <FieldError name="note" errors={errors} />
              </div>
            </>
          )}
        </>
      )}
    </ActionDialog>
  );
}
