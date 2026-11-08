"use client";

import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import type { ContactFormState } from "@/app/dashboard/w/[workspaceSlug]/contacts/actions";

export type ContactFormAction = (
  state: ContactFormState,
  data: FormData,
) => Promise<ContactFormState>;
type FormAction = ContactFormAction;
type Point = {
  id?: string;
  key?: string;
  label: string;
  value: string;
  isPreferred: boolean;
};
type Address = {
  id?: string;
  addressLine1: string;
  addressLine2: string;
  locality: string;
  townCity: string;
  county: string;
  postcode: string;
};
export type InitialContact = {
  title?: string;
  firstName?: string;
  middleNames?: string;
  lastName?: string;
  preferredName?: string;
  organisationType?: string;
  legalName?: string;
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  emails?: Point[];
  telephones?: Point[];
  individualAddress?: Address;
  registeredAddress?: Address;
  correspondenceAddress?: Address;
  preferredCommunication?: string;
  doNotEmail?: boolean;
  doNotTelephone?: boolean;
  doNotSms?: boolean;
  doNotWhatsApp?: boolean;
  doNotPost?: boolean;
  branchId?: string;
};

const INITIAL_STATE: ContactFormState = { status: "idle", message: "" };
const EMPTY_POINT: Point = { label: "", value: "", isPreferred: false };
const CONTACT_POINT_LABELS = {
  email: ["Personal", "Work", "Accounts", "Other"],
  telephone: ["Mobile", "Home", "Work", "Other"],
} as const;

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  autoComplete,
  disabled,
  id,
  error,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: "text" | "email" | "tel";
  autoComplete?: string;
  disabled?: boolean;
  id?: string;
  error?: string;
}) {
  const fieldId = id ?? name;
  const errorId = `${fieldId}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ContactPointFields({
  kind,
  initial,
}: {
  kind: "email" | "telephone";
  initial: Point[];
}) {
  const [points, setPoints] = useState(
    (initial.length ? initial : [{ ...EMPTY_POINT }]).map((point, index) => ({
      ...point,
      key: point.id ?? `new-${kind}-${index}`,
    })),
  );
  const preferredIndex = initial.length
    ? points.findIndex(({ isPreferred }) => isPreferred)
    : 0;
  const title = kind === "email" ? "Email addresses" : "Telephone numbers";
  const labelOptions = CONTACT_POINT_LABELS[kind];
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setPoints([...points, { ...EMPTY_POINT, key: crypto.randomUUID() }])
          }
        >
          <Plus aria-hidden="true" />
          Add another
        </Button>
      </div>
      {points.map((point, index) => (
        <div
          key={point.key}
          className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[1fr_2fr_auto]"
        >
          <input type="hidden" name={`${kind}Id`} value={point.id ?? ""} />
          <div className="grid gap-2">
            <Label htmlFor={`${kind}Label-${index}`}>Label</Label>
            <OptionSelect
              id={`${kind}Label-${index}`}
              name={`${kind}Label`}
              defaultValue={point.label || labelOptions[0]}
              options={[
                ...(point.label &&
                !(labelOptions as readonly string[]).includes(point.label)
                  ? [{ value: point.label, label: point.label }]
                  : []),
                ...labelOptions.map((option) => ({
                  value: option,
                  label: option,
                })),
              ]}
            />
          </div>
          <Field
            label={kind === "email" ? "Email" : "Telephone"}
            name={`${kind}Value`}
            id={`${kind}Value-${index}`}
            defaultValue={point.value}
            type={kind === "email" ? "email" : "tel"}
            autoComplete={kind === "email" ? "email" : "tel"}
          />
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={
                  kind === "email" ? "preferredEmail" : "preferredTelephone"
                }
                value={index}
                defaultChecked={index === preferredIndex}
              />
              Preferred
            </label>
            {points.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${kind}`}
                onClick={() =>
                  setPoints(
                    points.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddressFields({
  prefix,
  title,
  initial,
  required = false,
  disabled = false,
}: {
  prefix: string;
  title: string;
  initial?: Address;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <input type="hidden" name={`${prefix}Id`} value={initial?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Field
            label="Address line 1"
            name={`${prefix}Line1`}
            defaultValue={initial?.addressLine1}
            required={required}
            autoComplete="address-line1"
            disabled={disabled}
          />
        </div>
        <div className="lg:col-span-2">
          <Field
            label="Address line 2"
            name={`${prefix}Line2`}
            defaultValue={initial?.addressLine2}
            autoComplete="address-line2"
            disabled={disabled}
          />
        </div>
        <Field
          label="Locality"
          name={`${prefix}Locality`}
          defaultValue={initial?.locality}
          disabled={disabled}
        />
        <Field
          label="Town or city"
          name={`${prefix}TownCity`}
          defaultValue={initial?.townCity}
          required={required}
          autoComplete="address-level2"
          disabled={disabled}
        />
        <Field
          label="County"
          name={`${prefix}County`}
          defaultValue={initial?.county}
          autoComplete="address-level1"
          disabled={disabled}
        />
        <Field
          label="Postcode"
          name={`${prefix}Postcode`}
          defaultValue={initial?.postcode}
          required={required}
          autoComplete="postal-code"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function ContactForm({
  action,
  branches,
  kind,
  initial,
  submitLabel = "Create contact",
  canManageIdentity = false,
  inDialog = false,
  wide = false,
  compact = false,
  onCancel,
}: {
  action: FormAction;
  branches: readonly { id: string; name: string }[];
  kind: "person" | "organisation";
  initial?: InitialContact;
  submitLabel?: string;
  canManageIdentity?: boolean;
  inDialog?: boolean;
  /** Use two columns on extra-large screens (full pages, not dialogs). */
  wide?: boolean;
  /** Create modal: identity and contact methods only; the rest is added on the record. */
  compact?: boolean;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const duplicateConfirmed = state.status === "duplicates";
  const [sameAsRegistered, setSameAsRegistered] = useState(false);
  const [preferredCommunication, setPreferredCommunication] = useState(
    initial?.preferredCommunication ?? "",
  );
  const [availableMethods, setAvailableMethods] = useState(() => ({
    email: Boolean(initial?.emails?.some(({ value }) => value.trim())),
    telephone: Boolean(initial?.telephones?.some(({ value }) => value.trim())),
    post: Boolean(
      initial?.individualAddress ||
      initial?.registeredAddress ||
      initial?.correspondenceAddress,
    ),
  }));
  const [restrictions, setRestrictions] = useState(() => ({
    doNotEmail: Boolean(initial?.doNotEmail),
    doNotTelephone: Boolean(initial?.doNotTelephone),
    doNotSms: Boolean(initial?.doNotSms),
    doNotWhatsApp: Boolean(initial?.doNotWhatsApp),
    doNotPost: Boolean(initial?.doNotPost),
  }));

  function refreshAvailableMethods(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const next = {
      email: formData
        .getAll("emailValue")
        .some((value) => typeof value === "string" && value.trim()),
      telephone: formData
        .getAll("telephoneValue")
        .some((value) => typeof value === "string" && value.trim()),
      post: [
        "individualAddressLine1",
        "registeredAddressLine1",
        "correspondenceAddressLine1",
      ].some((name) => textValue(formData.get(name))),
    };
    setAvailableMethods(next);
    const supported =
      !preferredCommunication ||
      (preferredCommunication === "email" && next.email) ||
      (["telephone", "sms", "whatsapp"].includes(preferredCommunication) &&
        next.telephone) ||
      (preferredCommunication === "post" && next.post);
    if (!supported) setPreferredCommunication("");
  }

  function updateRestriction(name: keyof typeof restrictions, value: boolean) {
    setRestrictions((current) => ({ ...current, [name]: value }));
    const restrictedChannel = {
      doNotEmail: "email",
      doNotTelephone: "telephone",
      doNotSms: "sms",
      doNotWhatsApp: "whatsapp",
      doNotPost: "post",
    }[name];
    if (value && preferredCommunication === restrictedChannel) {
      setPreferredCommunication("");
    }
  }
  return (
    <form
      action={formAction}
      className="grid gap-6"
      onInput={refreshAvailableMethods}
    >
      {duplicateConfirmed && (
        <input
          type="hidden"
          name="duplicateReviewToken"
          value={state.duplicateReviewToken}
        />
      )}
      {/* Wide pages use two columns; the edit dialog stays a single column. */}
      <div
        className={`grid gap-6 ${
          wide ? "xl:grid-cols-2 xl:items-start xl:gap-x-14" : ""
        }`}
      >
        <div className="grid content-start gap-6">
          <section className="grid gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {kind === "person" ? "Person details" : "Organisation details"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Basic identity and branch information for this contact.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {kind === "person" ? (
                <>
                  <input
                    type="hidden"
                    name="preferredName"
                    value={initial?.preferredName ?? ""}
                  />
                  <Field
                    label="Title"
                    name="title"
                    defaultValue={initial?.title}
                    autoComplete="honorific-prefix"
                  />
                  <Field
                    label="First name"
                    name="firstName"
                    defaultValue={initial?.firstName}
                    required
                    autoComplete="given-name"
                    error={state.fieldErrors?.firstName}
                  />
                  <Field
                    label="Middle names"
                    name="middleNames"
                    defaultValue={initial?.middleNames}
                    autoComplete="additional-name"
                  />
                  <Field
                    label="Surname"
                    name="lastName"
                    defaultValue={initial?.lastName}
                    required
                    autoComplete="family-name"
                    error={state.fieldErrors?.lastName}
                  />
                </>
              ) : (
                <>
                  {initial && !canManageIdentity && (
                    <>
                      <input
                        type="hidden"
                        name="organisationType"
                        value={initial.organisationType ?? "other"}
                      />
                      <input
                        type="hidden"
                        name="legalName"
                        value={initial.legalName ?? ""}
                      />
                      <input
                        type="hidden"
                        name="registrationNumber"
                        value={initial.registrationNumber ?? ""}
                      />
                      <input
                        type="hidden"
                        name="vatNumber"
                        value={initial.vatNumber ?? ""}
                      />
                    </>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="organisationType">Organisation type</Label>
                    <OptionSelect
                      id="organisationType"
                      name="organisationType"
                      defaultValue={
                        initial?.organisationType ?? "limited_company"
                      }
                      disabled={Boolean(initial) && !canManageIdentity}
                      options={[
                        { value: "limited_company", label: "Limited company" },
                        { value: "llp", label: "LLP" },
                        { value: "partnership", label: "Partnership" },
                        { value: "trust", label: "Trust" },
                        { value: "charity", label: "Charity" },
                        { value: "other", label: "Other" },
                      ]}
                    />
                  </div>
                  <Field
                    label="Legal name"
                    name="legalName"
                    defaultValue={initial?.legalName}
                    required
                    autoComplete="organization"
                    disabled={Boolean(initial) && !canManageIdentity}
                    error={state.fieldErrors?.legalName}
                  />
                  <Field
                    label="Trading name"
                    name="tradingName"
                    defaultValue={initial?.tradingName}
                  />
                  <Field
                    label="Registration number"
                    name="registrationNumber"
                    defaultValue={initial?.registrationNumber}
                    disabled={Boolean(initial) && !canManageIdentity}
                  />
                  <Field
                    label="VAT number"
                    name="vatNumber"
                    defaultValue={initial?.vatNumber}
                    disabled={Boolean(initial) && !canManageIdentity}
                  />
                </>
              )}
              <div className="grid gap-2">
                <Label htmlFor="branchId">Responsible branch</Label>
                <OptionSelect
                  id="branchId"
                  name="branchId"
                  required
                  placeholder="Select a branch"
                  defaultValue={
                    initial?.branchId ??
                    (branches.length === 1 ? branches[0]?.id : "")
                  }
                  disabled={Boolean(initial)}
                  options={branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  }))}
                />
              </div>
            </div>
          </section>
          <section className="grid gap-4 border-t pt-6">
            <h2 className="text-lg font-semibold">Contact methods</h2>
            <div className="grid gap-6">
              {state.fieldErrors?.contactMethods && (
                <p className="text-sm text-destructive" role="alert">
                  {state.fieldErrors.contactMethods}
                </p>
              )}
              <ContactPointFields
                kind="email"
                initial={initial?.emails ?? []}
              />
              <ContactPointFields
                kind="telephone"
                initial={initial?.telephones ?? []}
              />
            </div>
          </section>
        </div>
        {!compact && (
          <div className="grid content-start gap-6">
            <section
              className={`grid gap-4 border-t pt-6 ${
                wide ? "xl:border-t-0 xl:pt-0" : ""
              }`}
            >
              <h2 className="text-lg font-semibold">Address</h2>
              <div className="grid gap-6">
                {state.fieldErrors?.addresses && (
                  <p className="text-sm text-destructive" role="alert">
                    {state.fieldErrors.addresses}
                  </p>
                )}
                {kind === "person" ? (
                  <AddressFields
                    prefix="individualAddress"
                    title="Individual address"
                    initial={initial?.individualAddress}
                  />
                ) : (
                  <>
                    <AddressFields
                      prefix="registeredAddress"
                      title="Registered address"
                      initial={initial?.registeredAddress}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="sameAsRegistered"
                        checked={sameAsRegistered}
                        onChange={(event) =>
                          setSameAsRegistered(event.currentTarget.checked)
                        }
                      />
                      Correspondence address is the same as the registered
                      address
                    </label>
                    <AddressFields
                      prefix="correspondenceAddress"
                      title="Correspondence address (optional)"
                      initial={initial?.correspondenceAddress}
                      disabled={sameAsRegistered}
                    />
                  </>
                )}
              </div>
            </section>
            <section className="grid gap-4 border-t pt-6">
              <h2 className="text-lg font-semibold">
                Communication preferences
              </h2>
              <div className="grid gap-4">
                {state.fieldErrors?.communication && (
                  <p className="text-sm text-destructive" role="alert">
                    {state.fieldErrors.communication}
                  </p>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="preferredCommunication">
                    Preferred contact method
                  </Label>
                  <OptionSelect
                    id="preferredCommunication"
                    name="preferredCommunication"
                    placeholder="No preference"
                    value={preferredCommunication}
                    onValueChange={setPreferredCommunication}
                    options={[
                      { value: "", label: "No preference" },
                      ...(availableMethods.email && !restrictions.doNotEmail
                        ? [{ value: "email", label: "Email" }]
                        : []),
                      ...(availableMethods.telephone &&
                      !restrictions.doNotTelephone
                        ? [{ value: "telephone", label: "Telephone" }]
                        : []),
                      ...(availableMethods.telephone && !restrictions.doNotSms
                        ? [{ value: "sms", label: "SMS" }]
                        : []),
                      ...(availableMethods.telephone &&
                      !restrictions.doNotWhatsApp
                        ? [{ value: "whatsapp", label: "WhatsApp" }]
                        : []),
                      ...(availableMethods.post && !restrictions.doNotPost
                        ? [{ value: "post", label: "Post" }]
                        : []),
                    ]}
                  />
                </div>
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-medium">
                    Do not use
                  </legend>
                  {[
                    ["doNotEmail", "Email"],
                    ["doNotTelephone", "Telephone"],
                    ["doNotSms", "SMS"],
                    ["doNotWhatsApp", "WhatsApp"],
                    ["doNotPost", "Post"],
                  ].map(([name, label]) => (
                    <label
                      key={name}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name={name}
                        checked={
                          restrictions[name as keyof typeof restrictions]
                        }
                        onChange={(event) =>
                          updateRestriction(
                            name as keyof typeof restrictions,
                            event.currentTarget.checked,
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              </div>
            </section>
          </div>
        )}
      </div>
      {state.status === "duplicates" && (
        <div className="rounded-lg border border-warning bg-warning-soft p-4">
          <p className="font-medium text-warning">
            Possible duplicate contacts
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          <ul className="mt-3 grid gap-2">
            {state.duplicates?.map((candidate) => (
              <li key={candidate.id} className="text-sm">
                <a
                  className="font-medium text-primary underline"
                  href={`./${candidate.id}`}
                  target="_blank"
                >
                  {candidate.label} ({candidate.reference})
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  · {candidate.matchedFields.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      {state.status === "idle" && state.message && (
        <p role="status" className="text-sm text-success">
          {state.message}
        </p>
      )}
      <div
        className={`sticky bottom-0 flex justify-end border-t py-4 ${
          inDialog ? "bg-popover" : "bg-background"
        }`}
      >
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="mr-2"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending && (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          )}
          {pending
            ? "Saving"
            : duplicateConfirmed
              ? "Continue creating"
              : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function textValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && Boolean(value.trim());
}
