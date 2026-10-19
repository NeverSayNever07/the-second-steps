"use client";

import {
  ArrowDownToLine,
  CheckCircle2,
  FileSignature,
  Handshake,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useState, useTransition } from "react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGREEMENT_STATUS_LABELS,
  EXCEPTION_KIND_LABELS,
  OWNERSHIP_CHECK_STATUS_LABELS,
} from "@/core/instructions/domain/instruction-labels";
import type {
  AgreementStatusCode,
  ExceptionKindCode,
  OwnershipCheckStatusCode,
} from "@/core/instructions/domain/instruction";
import { ActionDialog } from "./action-dialog";
import { TermsFields, type TermsFieldValues } from "./terms-fields";

type Action = (
  state: InstructionActionState,
  data: FormData,
) => Promise<InstructionActionState>;

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

export function ManageTermsButton({
  action,
  values,
}: {
  action: Action;
  values: TermsFieldValues;
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Manage terms"
      triggerIcon={<Pencil aria-hidden="true" />}
      title="Manage terms"
      description="Saving creates a complete new version of the terms. The current terms stay in the terms history."
      submitLabel="Save new terms"
      wide
    >
      {(errors) => (
        <>
          <TermsFields values={values} errors={errors} />
          <div className="grid gap-2 border-t pt-6">
            <Label htmlFor="reason">Why are the terms changing?</Label>
            <Textarea
              id="reason"
              name="reason"
              rows={2}
              maxLength={500}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? "reason-error" : undefined}
            />
            <FieldError name="reason" errors={errors} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function LeadStaffButton({
  action,
  staff,
  currentId,
}: {
  action: Action;
  staff: { membershipId: string; name: string }[];
  currentId: string;
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel={currentId ? "Change" : "Choose"}
      triggerVariant="ghost"
      triggerSize="xs"
      triggerIcon={<UserCheck aria-hidden="true" />}
      title="Lead staff member"
      description="The person looking after this instruction. It is needed before Ready to market."
    >
      {() => (
        <div className="grid gap-2">
          <Label htmlFor="membershipId">Lead staff member</Label>
          <OptionSelect
            id="membershipId"
            name="membershipId"
            defaultValue={currentId}
            placeholder="Choose a staff member"
            options={[
              { value: "", label: "No lead staff member" },
              ...staff.map(({ membershipId, name }) => ({
                value: membershipId,
                label: name,
              })),
            ]}
          />
        </div>
      )}
    </ActionDialog>
  );
}

export function AddLandlordButton({
  action,
  contacts,
}: {
  action: Action;
  contacts: { value: string; label: string }[];
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Add landlord"
      triggerIcon={<UserPlus aria-hidden="true" />}
      title="Add a landlord"
      description="Add another person or organisation to this instruction. This does not change who owns the property."
      submitLabel="Add landlord"
    >
      {() => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="contactId">Landlord</Label>
            <OptionSelect
              id="contactId"
              name="contactId"
              required
              placeholder="Choose a contact"
              options={contacts}
            />
            {contacts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Every active contact is already on this instruction.
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="makeMain"
              value="yes"
              className="size-4 accent-primary"
            />
            Make this person the main contact
          </label>
        </>
      )}
    </ActionDialog>
  );
}

export function MakeMainButton({
  action,
  name,
}: {
  action: () => Promise<InstructionActionState>;
  name: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={pending}
        aria-label={`Make ${name} the main contact`}
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
          <Handshake aria-hidden="true" />
        )}
        Make main
      </Button>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export function RemoveLandlordButton({
  action,
  name,
  isMain,
  others,
}: {
  action: Action;
  name: string;
  isMain: boolean;
  others: { value: string; label: string }[];
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Remove"
      triggerVariant="ghost"
      triggerSize="xs"
      triggerIcon={<UserMinus aria-hidden="true" />}
      title={`Remove ${name}`}
      description="They stay in the instruction's history. This does not change who owns the property."
      submitLabel="Remove landlord"
      destructive
    >
      {() => (
        <>
          {isMain && (
            <div className="grid gap-2">
              <Label htmlFor="newMainPartyId">New main contact</Label>
              <OptionSelect
                id="newMainPartyId"
                name="newMainPartyId"
                required
                placeholder="Choose who takes over"
                options={others}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" rows={2} maxLength={500} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function AgreementButton({
  action,
  current,
  today,
}: {
  action: Action;
  current: AgreementStatusCode | null;
  today: string;
}) {
  const [status, setStatus] = useState<string>(
    current === null ? "prepared" : current === "prepared" ? "sent" : "signed",
  );
  const correcting =
    current !== null &&
    ["prepared", "sent", "signed"].indexOf(status) <=
      ["prepared", "sent", "signed"].indexOf(current);
  return (
    <ActionDialog
      action={action}
      triggerLabel="Record progress"
      triggerIcon={<FileSignature aria-hidden="true" />}
      title="Agreement progress"
      description="Signing happens outside Zayto, and no signed copy is stored here yet. Record what has happened."
    >
      {(errors) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="status">Now</Label>
            <OptionSelect
              id="status"
              name="status"
              value={status}
              onValueChange={setStatus}
              options={(["prepared", "sent", "signed"] as const).map(
                (value) => ({
                  value,
                  label: AGREEMENT_STATUS_LABELS[value],
                }),
              )}
            />
          </div>
          {status === "signed" && (
            <div className="grid gap-2">
              <Label htmlFor="signedOn">Date signed</Label>
              <DatePicker
                id="signedOn"
                name="signedOn"
                max={today}
                defaultValue={today}
                required
              />
              <FieldError name="signedOn" errors={errors} />
            </div>
          )}
          {correcting && (
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason for the correction</Label>
              <Textarea id="reason" name="reason" rows={2} maxLength={500} />
              <p className="text-xs text-muted-foreground">
                Repeating a step or moving back is recorded as a correction.
              </p>
            </div>
          )}
        </>
      )}
    </ActionDialog>
  );
}

export function OwnershipCheckButton({
  action,
  current,
  today,
}: {
  action: Action;
  current: OwnershipCheckStatusCode | null;
  today: string;
}) {
  const [status, setStatus] = useState<string>(
    current === null ? "in_progress" : "verified",
  );
  const isResult = status === "verified" || status === "not_verified";
  const needsReason =
    status === "not_verified" ||
    current === "verified" ||
    current === "not_verified";
  return (
    <ActionDialog
      action={action}
      triggerLabel="Record check"
      triggerIcon={<ShieldCheck aria-hidden="true" />}
      title="Ownership check"
      description="Record the agency's conclusion. Zayto holds no evidence file yet, and does not decide whether evidence is legally sufficient."
    >
      {(errors) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="status">Result</Label>
            <OptionSelect
              id="status"
              name="status"
              value={status}
              onValueChange={setStatus}
              options={(
                ["in_progress", "verified", "not_verified"] as const
              ).map((value) => ({
                value,
                label: OWNERSHIP_CHECK_STATUS_LABELS[value],
              }))}
            />
          </div>
          {isResult && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="checkedOn">Date checked</Label>
                <DatePicker
                  id="checkedOn"
                  name="checkedOn"
                  max={today}
                  defaultValue={today}
                />
                <FieldError name="checkedOn" errors={errors} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="method">How was it checked?</Label>
                <Input
                  id="method"
                  name="method"
                  maxLength={200}
                  autoComplete="off"
                  placeholder="For example, title register reviewed, or an outside provider confirmed"
                />
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="notes">Internal notes (optional)</Label>
            <Textarea id="notes" name="notes" rows={2} maxLength={2000} />
          </div>
          {needsReason && (
            <div className="grid gap-2">
              <Label htmlFor="reason">
                {status === "not_verified"
                  ? "Why is it not verified?"
                  : "Reason for the correction"}
              </Label>
              <Textarea id="reason" name="reason" rows={2} maxLength={500} />
            </div>
          )}
        </>
      )}
    </ActionDialog>
  );
}

export function ExceptionButton({
  action,
  kind,
}: {
  action: Action;
  kind: ExceptionKindCode;
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Approve an exception"
      triggerVariant="ghost"
      triggerSize="xs"
      title={`Exception: ${EXCEPTION_KIND_LABELS[kind].toLowerCase()}`}
      description="Lets this property go to Ready to market without this item. The reason, your name and the time are kept, and an exception cannot be withdrawn."
      submitLabel="Approve exception"
    >
      {() => (
        <>
          <input type="hidden" name="kind" value={kind} />
          <div className="grid gap-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" rows={3} maxLength={500} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function MarkReadyButton({
  action,
  disabled,
}: {
  action: () => Promise<InstructionActionState>;
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
        Mark ready to market
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ReturnToOnboardingButton({ action }: { action: Action }) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Return to Onboarding"
      triggerVariant="ghost"
      triggerSize="xs"
      triggerIcon={<ArrowDownToLine aria-hidden="true" />}
      title="Return to Onboarding"
      description="Use this if the property should not be marketed yet. The reason is kept in the journey history."
      submitLabel="Return to Onboarding"
    >
      {() => (
        <div className="grid gap-2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea id="reason" name="reason" rows={2} maxLength={500} />
        </div>
      )}
    </ActionDialog>
  );
}

export function EndInstructionButton({
  action,
  today,
  instructedOn,
}: {
  action: Action;
  today: string;
  instructedOn: string;
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="End instruction"
      triggerVariant="outline"
      triggerSize="default"
      triggerIcon={<Plus className="rotate-45" aria-hidden="true" />}
      title="End this instruction?"
      description="All of its history is kept, and routine changes stop. The property moves to Withdrawn with the same reason, and no longer counts as a current instruction. A later appointment starts a new instruction."
      submitLabel="End instruction"
      destructive
    >
      {() => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="endedOn">Date it ended</Label>
            <DatePicker
              id="endedOn"
              name="endedOn"
              min={instructedOn}
              max={today}
              defaultValue={today}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" rows={3} maxLength={500} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}
