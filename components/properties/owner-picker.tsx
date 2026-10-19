"use client";

import { LoaderCircle, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import type {
  OwnerContactResult,
  QuickAddOwnerInput,
  QuickAddOwnerState,
} from "@/app/dashboard/w/[workspaceSlug]/properties/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-time-picker";
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

type Owner = OwnerContactResult & { isLead: boolean; startedOn: string };

export type QuickAdd = (
  branchId: string,
  input: QuickAddOwnerInput & {
    email: string;
    telephone: string;
    reviewToken: string;
  },
) => Promise<QuickAddOwnerState>;

export function kindLabel(kind: OwnerContactResult["kind"]) {
  return kind === "person" ? "Person" : "Organisation";
}

export function QuickAddDialog({
  branchId,
  onCreated,
  quickAdd,
}: {
  branchId: string;
  onCreated: (contact: OwnerContactResult) => void;
  quickAdd: QuickAdd;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"person" | "organisation">("person");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [state, setState] = useState<QuickAddOwnerState | null>(null);
  const [pending, startSubmit] = useTransition();
  const fieldErrors = state?.status === "error" ? state.fieldErrors : undefined;

  function reset() {
    setFirstName("");
    setLastName("");
    setLegalName("");
    setEmail("");
    setTelephone("");
    setState(null);
  }

  function submit(reviewToken: string) {
    if (!branchId) {
      setState({
        status: "error",
        message: "Choose the responsible branch before adding a contact.",
      });
      return;
    }
    startSubmit(async () => {
      const result = await quickAdd(branchId, {
        ...(kind === "person"
          ? { kind, firstName, lastName }
          : { kind, legalName }),
        email,
        telephone,
        reviewToken,
      });
      if (result.status === "created") {
        onCreated(result.contact);
        reset();
        setOpen(false);
      } else {
        setState(result);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <UserPlus aria-hidden="true" />
        Add a new contact
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a new owner</DialogTitle>
          <DialogDescription>
            Create a contact now and add them as an owner. More details can be
            added from their contact record later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="quick-owner-kind">Type</Label>
            <OptionSelect
              id="quick-owner-kind"
              value={kind}
              onValueChange={(next) => {
                setKind(next === "organisation" ? "organisation" : "person");
                setState(null);
              }}
              options={[
                { value: "person", label: "Person" },
                { value: "organisation", label: "Organisation" },
              ]}
            />
          </div>
          {kind === "person" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="quick-owner-first">First name</Label>
                <Input
                  id="quick-owner-first"
                  value={firstName}
                  autoComplete="off"
                  onChange={(event) => setFirstName(event.currentTarget.value)}
                  aria-invalid={Boolean(fieldErrors?.firstName)}
                />
                {fieldErrors?.firstName && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.firstName}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="quick-owner-last">Surname</Label>
                <Input
                  id="quick-owner-last"
                  value={lastName}
                  autoComplete="off"
                  onChange={(event) => setLastName(event.currentTarget.value)}
                  aria-invalid={Boolean(fieldErrors?.lastName)}
                />
                {fieldErrors?.lastName && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.lastName}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="quick-owner-legal">Legal name</Label>
              <Input
                id="quick-owner-legal"
                value={legalName}
                autoComplete="off"
                onChange={(event) => setLegalName(event.currentTarget.value)}
                aria-invalid={Boolean(fieldErrors?.legalName)}
              />
              {fieldErrors?.legalName && (
                <p className="text-xs text-destructive">
                  {fieldErrors.legalName}
                </p>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="quick-owner-email">Email</Label>
              <Input
                id="quick-owner-email"
                type="email"
                value={email}
                autoComplete="off"
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quick-owner-tel">Telephone</Label>
              <Input
                id="quick-owner-tel"
                type="tel"
                value={telephone}
                autoComplete="off"
                onChange={(event) => setTelephone(event.currentTarget.value)}
              />
            </div>
          </div>
          {fieldErrors?.contactMethods && (
            <p className="text-xs text-destructive">
              {fieldErrors.contactMethods}
            </p>
          )}
          {state?.status === "error" && (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          )}
          {state?.status === "duplicates" && (
            <div className="grid gap-3 rounded-lg bg-warning-soft p-4 text-sm">
              <p role="alert">{state.message}</p>
              <ul className="grid divide-y">
                {state.duplicates.map((duplicate) => (
                  <li
                    key={duplicate.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="font-medium [overflow-wrap:anywhere]">
                        {duplicate.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {kindLabel(duplicate.kind)} · {duplicate.reference} ·{" "}
                        {duplicate.strength === "strong"
                          ? "Strong match"
                          : "Possible match"}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onCreated(duplicate);
                        reset();
                        setOpen(false);
                      }}
                    >
                      Use this contact
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {state?.status === "duplicates" ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() => submit(state.reviewToken)}
              >
                {pending && (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                )}
                Create a new contact anyway
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pending}
                onClick={() => submit("")}
              >
                {pending && (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                )}
                Create and add as owner
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OwnerPicker({
  branchId,
  quickAdd,
  search,
}: {
  branchId: string;
  quickAdd: QuickAdd;
  search: (query: string) => Promise<OwnerContactResult[]>;
}) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OwnerContactResult[] | null>(null);
  const [searching, startSearch] = useTransition();

  function addOwner(contact: OwnerContactResult) {
    setOwners((current) =>
      current.some(({ id }) => id === contact.id)
        ? current
        : [
            ...current,
            // The first owner added is the lead landlord until changed.
            { ...contact, isLead: current.length === 0, startedOn: "" },
          ],
    );
  }

  function runSearch() {
    startSearch(async () => setResults(await search(query)));
  }

  const chosen = new Set(owners.map(({ id }) => id));
  return (
    <div className="grid gap-4">
      <input
        type="hidden"
        name="owners"
        value={JSON.stringify(
          owners.map(({ id, isLead, startedOn }) => ({
            contactId: id,
            isLead,
            startedOn,
          })),
        )}
      />
      {owners.length > 0 ? (
        <ul className="grid divide-y border-y">
          {owners.map((owner) => (
            <li key={owner.id} className="grid gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium [overflow-wrap:anywhere]">
                  {owner.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {kindLabel(owner.kind)}
                  {owner.reference && ` · ${owner.reference}`}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="leadOwnerChoice"
                    checked={owner.isLead}
                    onChange={() =>
                      setOwners((current) =>
                        current.map((item) => ({
                          ...item,
                          isLead: item.id === owner.id,
                        })),
                      )
                    }
                  />
                  Lead landlord
                </label>
                <div className="grid gap-1">
                  <Label
                    htmlFor={`owner-since-${owner.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    Owner since (optional)
                  </Label>
                  <DatePicker
                    id={`owner-since-${owner.id}`}
                    value={owner.startedOn}
                    onChange={(startedOn) =>
                      setOwners((current) =>
                        current.map((item) =>
                          item.id === owner.id ? { ...item, startedOn } : item,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-10"
                  aria-label={`Remove ${owner.label}`}
                  onClick={() =>
                    setOwners((current) => {
                      const remaining = current.filter(
                        ({ id }) => id !== owner.id,
                      );
                      // Keep a lead whenever there is at least one owner.
                      return remaining.length &&
                        !remaining.some(({ isLead }) => isLead)
                        ? remaining.map((item, index) => ({
                            ...item,
                            isLead: index === 0,
                          }))
                        : remaining;
                    })
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No owners added yet. You can add them now or later.
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor="owner-search">Find an existing contact</Label>
        <div className="flex gap-2">
          <Input
            id="owner-search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                runSearch();
              }
            }}
            placeholder="Name, reference, email or telephone"
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
      </div>
      {results &&
        (results.length ? (
          <ul className="grid divide-y rounded-lg border">
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
                    {kindLabel(contact.kind)} · {contact.reference}
                  </span>
                </span>
                {chosen.has(contact.id) ? (
                  <Badge variant="secondary">Added</Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addOwner(contact)}
                  >
                    <Plus aria-hidden="true" />
                    Add as owner
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No matching contacts. Try another search or add a new contact.
          </p>
        ))}
      <div>
        <QuickAddDialog
          branchId={branchId}
          quickAdd={quickAdd}
          onCreated={addOwner}
        />
      </div>
    </div>
  );
}
