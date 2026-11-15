"use client";

import {
  ArrowDownToLine,
  CheckCircle2,
  FileSignature,
  FileUp,
  Handshake,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  InstructionActionState,
  LandlordContactResult,
} from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
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

function LandlordSearch({
  search,
  onInstruction,
  error,
}: {
  search: (query: string) => Promise<LandlordContactResult[]>;
  onInstruction: readonly string[];
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LandlordContactResult[] | null>(null);
  const [chosen, setChosen] = useState<LandlordContactResult | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [searching, startSearch] = useTransition();
  const current = new Set(onInstruction);

  function runSearch() {
    startSearch(async () => {
      try {
        setResults(await search(query));
        setSearchError(false);
      } catch {
        setResults(null);
        setSearchError(true);
      }
    });
  }

  return (
    <div className="grid gap-2">
      <input type="hidden" name="contactId" value={chosen?.id ?? ""} />
      {chosen ? (
        <>
          <p className="text-sm font-medium">Landlord</p>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="min-w-0 text-sm">
              <span className="font-medium [overflow-wrap:anywhere]">
                {chosen.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {chosen.kind === "person" ? "Person" : "Organisation"} ·{" "}
                {chosen.reference}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setChosen(null)}
            >
              Change
            </Button>
          </div>
        </>
      ) : (
        <>
          <Label htmlFor="landlord-search">Find a contact</Label>
          <div className="flex gap-2">
            <Input
              id="landlord-search"
              value={query}
              maxLength={160}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Name, reference, email or telephone"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "contactId-error" : undefined}
            />
            <Button
              type="button"
              variant="outline"
              onClick={runSearch}
              disabled={searching}
            >
              {searching ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Search aria-hidden="true" />
              )}
              Search
            </Button>
          </div>
          {searchError && (
            <p className="text-xs text-destructive" role="alert">
              The search could not be completed. Try again.
            </p>
          )}
          {results &&
            (results.length ? (
              <ul
                className="grid max-h-72 divide-y overflow-y-auto rounded-lg border"
                aria-label="Matching contacts"
              >
                {results.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium [overflow-wrap:anywhere]">
                        {contact.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {contact.kind === "person" ? "Person" : "Organisation"}{" "}
                        · {contact.reference}
                      </span>
                    </span>
                    {current.has(contact.id) ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Already on this instruction
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Choose ${contact.label}`}
                        onClick={() => setChosen(contact)}
                      >
                        Choose
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No matching active contacts. Try another search.
              </p>
            ))}
        </>
      )}
      <FieldError name="contactId" errors={error ? { contactId: error } : {}} />
    </div>
  );
}

export function AddLandlordButton({
  action,
  search,
  onInstruction,
}: {
  action: Action;
  search: (query: string) => Promise<LandlordContactResult[]>;
  onInstruction: readonly string[];
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
      {(errors) => (
        <>
          <LandlordSearch
            search={search}
            onInstruction={onInstruction}
            error={errors.contactId}
          />
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

const RECORDABLE_STEPS = ["prepared", "sent"] as const;

export function AgreementButton({
  action,
  current,
}: {
  action: Action;
  current: AgreementStatusCode | null;
}) {
  const [status, setStatus] = useState<string>(
    current === null ? "prepared" : "sent",
  );
  const correcting =
    current !== null &&
    (current === "signed" ||
      RECORDABLE_STEPS.indexOf(status as (typeof RECORDABLE_STEPS)[number]) <=
        RECORDABLE_STEPS.indexOf(current));
  return (
    <ActionDialog
      action={action}
      triggerLabel="Record progress"
      triggerIcon={<FileSignature aria-hidden="true" />}
      title="Agreement progress"
      description="Signing happens outside Zayto. Record that the agreement is prepared or sent. A signed copy is added by uploading it."
    >
      {() => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="status">Now</Label>
            <OptionSelect
              id="status"
              name="status"
              value={status}
              onValueChange={setStatus}
              options={RECORDABLE_STEPS.map((value) => ({
                value,
                label: AGREEMENT_STATUS_LABELS[value],
              }))}
            />
          </div>
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

function uploadMessage(error: string | undefined) {
  switch (error) {
    case "unsupported_type":
    case "type_not_allowed":
      return "Only a PDF can be uploaded as the signed agreement.";
    case "encrypted_pdf":
      return "That PDF is password protected. Upload an unprotected copy.";
    case "too_large":
      return "That file is over 10 MB.";
    case "empty":
    case "incomplete_file":
      return "That file looks empty or damaged. Choose it again.";
    case "record_closed":
      return "This instruction has ended, so no agreement can be added.";
    case "access_denied":
      return "You do not have access to add an agreement here.";
    default:
      return "The file could not be uploaded. If a draft agreement is already waiting, finish or discard it first.";
  }
}

/**
 * Adds the signed agreement PDF, or finishes a draft whose upload already
 * worked. The file uploads first and becomes a draft; completing it follows in
 * the same save. If completing is refused, the draft stays and can be finished
 * or discarded.
 */
export function SignedAgreementButton({
  workspaceSlug,
  instructionId,
  action,
  today,
  landlords,
  draftDocumentId,
  hasAgreement,
}: {
  workspaceSlug: string;
  instructionId: string;
  action: Action;
  today: string;
  /** Who must have signed: the draft's signers, or the current landlords. */
  landlords: string[];
  draftDocumentId: string | null;
  hasAgreement: boolean;
}) {
  const router = useRouter();
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const documentId = draftDocumentId ?? uploadedId;

  const run: Action = async (state, data) => {
    let id = documentId;
    if (!id) {
      const file = data.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return { status: "error", message: "Choose the signed agreement PDF." };
      }
      const query = new URLSearchParams({
        kind: "instruction_agreement",
        recordId: instructionId,
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
            },
            body: file,
          },
        );
        const body = (await response.json()) as {
          ok: boolean;
          error?: string;
          document?: { id: string };
        };
        if (!response.ok || !body.ok || !body.document) {
          return { status: "error", message: uploadMessage(body.error) };
        }
        id = body.document.id;
        setUploadedId(id);
        // Show the draft behind the dialog, so it can be finished later.
        router.refresh();
      } catch {
        return {
          status: "error",
          message: "The file could not be uploaded. Try again.",
        };
      }
    }
    data.delete("file");
    data.set("documentId", id);
    const result = await action(state, data);
    if (result.status === "saved") setUploadedId(null);
    return result;
  };

  return (
    <ActionDialog
      action={run}
      triggerLabel={
        draftDocumentId
          ? "Finish agreement"
          : hasAgreement
            ? "Add new signed copy"
            : "Add signed agreement"
      }
      triggerIcon={<FileUp aria-hidden="true" />}
      title={
        documentId ? "Finish the signed agreement" : "Add signed agreement"
      }
      description="Signing happens outside Zayto. Upload the PDF with every landlord's signature, then confirm it."
      submitLabel={documentId ? "Complete agreement" : "Upload and complete"}
    >
      {(errors) => (
        <>
          {documentId ? (
            <p className="text-sm text-muted-foreground">
              The file is uploaded and waiting to be completed.
            </p>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="agreement-file">Signed agreement (PDF)</Label>
              <Input
                id="agreement-file"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
              />
              <p className="text-xs text-muted-foreground">
                PDF only, up to 10 MB.
              </p>
            </div>
          )}
          <div className="grid gap-1 text-sm">
            <p className="font-medium">Landlords who must have signed</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {landlords.map((name, index) => (
                <li key={`${name}-${index}`}>{name}</li>
              ))}
            </ul>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="signaturesConfirmed"
              value="yes"
              className="mt-0.5 size-4 accent-primary"
            />
            <span>Every landlord listed above has signed this copy</span>
          </label>
          <div className="grid gap-2">
            <Label htmlFor="signedOn">Date signed</Label>
            <DatePicker
              id="signedOn"
              name="signedOn"
              max={today}
              defaultValue={today}
              required
            />
            <p className="text-xs text-muted-foreground">
              The date shown on the document.
            </p>
            <FieldError name="signedOn" errors={errors} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function DiscardAgreementDraftButton({ action }: { action: Action }) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Discard draft"
      triggerIcon={<Trash2 aria-hidden="true" />}
      triggerVariant="ghost"
      title="Discard the draft agreement"
      description="The uploaded file is deleted. Upload a fresh signed copy afterwards."
      submitLabel="Discard draft"
      destructive
    >
      {() => (
        <div className="grid gap-2">
          <Label htmlFor="discard-reason">Reason</Label>
          <Textarea
            id="discard-reason"
            name="reason"
            rows={2}
            maxLength={500}
            required
          />
        </div>
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

export function ReturnToOnboardingButton({
  action,
  hasListing = false,
}: {
  action: Action;
  /** The instruction has a current listing, which this takes back to Draft. */
  hasListing?: boolean;
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Return to Onboarding"
      triggerVariant="ghost"
      triggerSize="xs"
      triggerIcon={<ArrowDownToLine aria-hidden="true" />}
      title="Return to Onboarding"
      description={
        hasListing
          ? "Use this if the property should not be marketed yet. Its listing goes back to Draft too. The reason is kept in the journey history."
          : "Use this if the property should not be marketed yet. The reason is kept in the journey history."
      }
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
  hasListing = false,
}: {
  action: Action;
  today: string;
  instructedOn: string;
  /** The instruction has a current listing, which this withdraws. */
  hasListing?: boolean;
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="End instruction"
      triggerVariant="outline"
      triggerSize="default"
      triggerIcon={<Plus className="rotate-45" aria-hidden="true" />}
      title="End this instruction?"
      description={`All of its history is kept, and routine changes stop. The property moves to Withdrawn with the same reason, and no longer counts as a current instruction.${hasListing ? " Its listing is withdrawn too." : ""} A later appointment starts a new instruction.`}
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
