"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { TermsFields, type TermsFieldValues } from "./terms-fields";

const IDLE: InstructionActionState = { status: "idle", message: "" };

export function StartInstructionForm({
  action,
  cancelHref,
  appraisalId,
  today,
  landlords,
  defaultMainId,
  staff,
  defaultStaffId,
  terms,
}: {
  action: (
    state: InstructionActionState,
    data: FormData,
  ) => Promise<InstructionActionState>;
  cancelHref: string;
  appraisalId: string | null;
  today: string;
  /** The lead's landlord and the property's current owners, to confirm. */
  landlords: { id: string; name: string; reference: string; note: string }[];
  defaultMainId: string;
  staff: { membershipId: string; name: string }[];
  defaultStaffId: string;
  terms: TermsFieldValues;
}) {
  const [state, formAction, pending] = useActionState(
    (previous: InstructionActionState, data: FormData) =>
      action(previous, data),
    IDLE,
  );
  const [main, setMain] = useState(defaultMainId);
  const [selected, setSelected] = useState(
    () => new Set(landlords.map(({ id }) => id)),
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form
      // Not `action={...}`: React would clear the fields after a refused save.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="grid gap-10"
      noValidate
    >
      {appraisalId && (
        <input type="hidden" name="appraisalId" value={appraisalId} />
      )}
      <section className="grid gap-4" aria-labelledby="start-landlords">
        <div>
          <h2 id="start-landlords" className="text-base font-semibold">
            Landlords
          </h2>
          <p className="text-sm text-muted-foreground">
            Confirm who is instructing us. Being listed here is not a check of
            legal ownership. You can add or remove landlords afterwards.
          </p>
        </div>
        <ul className="grid divide-y border-y">
          {landlords.map((landlord) => (
            <li
              key={landlord.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <label className="flex min-w-0 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="partyId"
                  value={landlord.id}
                  checked={selected.has(landlord.id)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.currentTarget.checked) next.add(landlord.id);
                    else next.delete(landlord.id);
                    setSelected(next);
                    if (!next.has(main)) setMain([...next][0] ?? "");
                  }}
                  className="size-4 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block font-medium [overflow-wrap:anywhere]">
                    {landlord.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {landlord.reference} · {landlord.note}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="mainPartyId"
                  value={landlord.id}
                  checked={main === landlord.id}
                  disabled={!selected.has(landlord.id)}
                  onChange={() => setMain(landlord.id)}
                  className="size-4 accent-primary"
                />
                Main contact
              </label>
            </li>
          ))}
        </ul>
        {(errors.partyId || errors.mainPartyId) && (
          <p className="text-xs text-destructive" role="alert">
            {errors.partyId ?? errors.mainPartyId}
          </p>
        )}
      </section>

      <section
        className="grid gap-4 border-t pt-8"
        aria-labelledby="start-details"
      >
        <h2 id="start-details" className="text-base font-semibold">
          Instruction details
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="instructedOn">Instruction date</Label>
            <DatePicker
              id="instructedOn"
              name="instructedOn"
              max={today}
              defaultValue={today}
              required
              invalid={Boolean(errors.instructedOn)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="leadMembershipId">Lead staff member</Label>
            <OptionSelect
              id="leadMembershipId"
              name="leadMembershipId"
              defaultValue={defaultStaffId}
              placeholder="Not chosen yet"
              options={[
                { value: "", label: "Not chosen yet" },
                ...staff.map(({ membershipId, name }) => ({
                  value: membershipId,
                  label: name,
                })),
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Needed before Ready to market.
            </p>
            {errors.leadMembershipId && (
              <p className="text-xs text-destructive">
                {errors.leadMembershipId}
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        className="grid gap-4 border-t pt-8"
        aria-labelledby="start-terms"
      >
        <div>
          <h2 id="start-terms" className="text-base font-semibold">
            Terms
          </h2>
          <p className="text-sm text-muted-foreground">
            Pre-filled from the appraisal. Change anything before you confirm;
            anything left empty shows as incomplete on the instruction.
          </p>
        </div>
        <TermsFields values={terms} errors={errors} />
      </section>

      <div className="grid gap-4 border-t pt-6">
        {state.status === "error" && (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Confirming marks the landlord lead as <strong>Instruction won</strong>
          , closes its open next actions and creates the instruction. All of it
          is saved together, and nothing changes if you leave this page.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending && (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            )}
            {pending ? "Starting…" : "Confirm and start instruction"}
          </Button>
          <Button
            variant="outline"
            render={<Link href={cancelHref} />}
            nativeButton={false}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
