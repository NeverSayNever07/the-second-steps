"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { startTransition, useState, useTransition } from "react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import type { EnquiryApplicantChoice } from "@/app/dashboard/w/[workspaceSlug]/applicants/search-actions";
import { ActionDialog } from "@/components/instructions/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";

type Errors = Partial<Record<string, string>>;

function ApplicantPicker({
  find,
  errors,
  applicantsPath,
}: {
  find: (query: string) => Promise<EnquiryApplicantChoice[]>;
  errors: Errors;
  applicantsPath: string;
}) {
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<EnquiryApplicantChoice[] | null>(null);
  const [chosen, setChosen] = useState<EnquiryApplicantChoice | null>(null);
  const [pending, startSearch] = useTransition();

  function search() {
    startSearch(async () => {
      setChoices(await find(query));
    });
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="enquiry-applicant-query">Applicant</Label>
      <input type="hidden" name="applicantId" value={chosen?.id ?? ""} />
      {chosen ? (
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{chosen.name}</span>{" "}
            <span className="text-muted-foreground">
              {chosen.reference} · {chosen.branch}
            </span>
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setChosen(null)}
          >
            Change
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              id="enquiry-applicant-query"
              value={query}
              autoComplete="off"
              placeholder="Search by name or reference"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  search();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending || query.trim().length < 2}
              onClick={search}
            >
              <Search aria-hidden="true" />
              {pending ? "Searching…" : "Search"}
            </Button>
          </div>
          {choices && choices.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No active applicant found.{" "}
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href={`${applicantsPath}?new=1`}
              >
                Add them as a new applicant
              </Link>{" "}
              first, then come back.
            </p>
          )}
          {choices && choices.length > 0 && (
            <ul
              className="grid divide-y rounded-md border"
              aria-label="Matching applicants"
            >
              {choices.map((choice) => (
                <li key={choice.id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => startTransition(() => setChosen(choice))}
                  >
                    <span className="font-medium">{choice.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {choice.reference} · {choice.branch}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {errors.applicantId && (
        <p className="text-xs text-destructive">{errors.applicantId}</p>
      )}
    </div>
  );
}

/**
 * Record a new property enquiry: who, which home, and where it came from.
 * Only a Ready to advertise home can take one.
 */
export function NewEnquiryDialog({
  action,
  find,
  homes,
  sources,
  applicantsPath,
}: {
  action: (
    state: InstructionActionState,
    data: FormData,
  ) => Promise<InstructionActionState>;
  find: (query: string) => Promise<EnquiryApplicantChoice[]>;
  homes: readonly { id: string; label: string }[];
  sources: readonly { id: string; name: string }[];
  applicantsPath: string;
}) {
  return (
    <ActionDialog
      action={action}
      triggerSize="default"
      triggerVariant="default"
      triggerLabel="New enquiry"
      triggerIcon={<Plus aria-hidden="true" />}
      title="New property enquiry"
      description="An applicant who is interested in a home that is Ready to advertise. Nothing is sent to anyone."
      submitLabel="Record enquiry"
    >
      {(errors) => (
        <div className="grid gap-4">
          <ApplicantPicker
            find={find}
            errors={errors}
            applicantsPath={applicantsPath}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="enquiry-home">Home</Label>
            <OptionSelect
              id="enquiry-home"
              name="listingId"
              placeholder={
                homes.length
                  ? "Choose a home"
                  : "No homes are Ready to advertise"
              }
              options={[
                { value: "", label: "Choose a home" },
                ...homes.map(({ id, label }) => ({ value: id, label })),
              ]}
            />
            {errors.listingId && (
              <p className="text-xs text-destructive">{errors.listingId}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="enquiry-source">Where did it come from?</Label>
            <OptionSelect
              id="enquiry-source"
              name="leadSourceId"
              placeholder="Not known yet"
              options={[
                { value: "", label: "Not known yet" },
                ...sources.map(({ id, name }) => ({ value: id, label: name })),
              ]}
            />
            {errors.leadSourceId && (
              <p className="text-xs text-destructive">{errors.leadSourceId}</p>
            )}
          </div>
        </div>
      )}
    </ActionDialog>
  );
}
