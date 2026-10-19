"use client";

import { LoaderCircle, Plus, Search, Users } from "lucide-react";
import { useState, useTransition } from "react";
import type {
  OwnerChangeState,
  OwnerContactResult,
} from "@/app/dashboard/w/[workspaceSlug]/properties/actions";
import {
  QuickAddDialog,
  kindLabel,
  type QuickAdd,
} from "@/components/properties/owner-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";

export type ManagedOwner = {
  ownershipId: string;
  contactId: string;
  name: string;
  kind: "person" | "organisation";
  reference: string;
  isLead: boolean;
  /** Pre-formatted for display, for example 01/07/2021. */
  since: string | null;
};

type Message = { tone: "saved" | "error"; text: string } | null;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" }).format(date);
}

function EndOwnershipForm({
  owner,
  disabled,
  onCancel,
  onEnd,
}: {
  owner: ManagedOwner;
  disabled: boolean;
  onCancel: () => void;
  onEnd: (input: { reason: string; endedOn: string }) => void;
}) {
  const [reason, setReason] = useState("");
  const [endedOn, setEndedOn] = useState("");
  const today = formatDate(new Date()).split("/").reverse().join("-");
  return (
    <div className="grid gap-3 rounded-lg bg-muted/60 p-4">
      <p className="text-sm">
        End {owner.name}&apos;s ownership. They stay on the record as a former
        owner.
        {owner.isLead &&
          " They are the lead landlord, so choose a new lead afterwards."}
      </p>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor={`end-reason-${owner.ownershipId}`}>Reason</Label>
          <Input
            id={`end-reason-${owner.ownershipId}`}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.currentTarget.value)}
            placeholder="For example Sold the property"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`end-date-${owner.ownershipId}`}>
            Ended on (optional)
          </Label>
          <DatePicker
            id={`end-date-${owner.ownershipId}`}
            max={today}
            value={endedOn}
            onChange={setEndedOn}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={disabled || !reason.trim()}
          onClick={() => onEnd({ reason, endedOn })}
        >
          End ownership
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Keep as owner
        </Button>
      </div>
    </div>
  );
}

export function ManageOwners({
  addOwner,
  endOwnership,
  owners,
  propertyBranchId,
  quickAdd,
  search,
  setLead,
}: {
  addOwner: (owner: {
    contactId: string;
    isLead: boolean;
    startedOn: string;
  }) => Promise<OwnerChangeState>;
  endOwnership: (
    ownershipId: string,
    input: { reason: string; endedOn: string },
  ) => Promise<OwnerChangeState>;
  owners: readonly ManagedOwner[];
  propertyBranchId: string;
  quickAdd: QuickAdd;
  search: (query: string) => Promise<OwnerContactResult[]>;
  setLead: (ownershipId: string) => Promise<OwnerChangeState>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [pending, startChange] = useTransition();
  const [ending, setEnding] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OwnerContactResult[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [makeLead, setMakeLead] = useState(false);
  const [startedOn, setStartedOn] = useState("");

  const current = new Set(owners.map(({ contactId }) => contactId));

  function run(change: () => Promise<OwnerChangeState>, onSaved?: () => void) {
    setMessage(null);
    startChange(async () => {
      const result = await change();
      setMessage({ tone: result.status, text: result.message });
      if (result.status === "saved") onSaved?.();
    });
  }

  function add(contact: OwnerContactResult) {
    run(
      () => addOwner({ contactId: contact.id, isLead: makeLead, startedOn }),
      () => {
        setMakeLead(false);
        setStartedOn("");
      },
    );
  }

  function runSearch() {
    startSearch(async () => setResults(await search(query)));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setMessage(null);
          setEnding(null);
          setResults(null);
          setQuery("");
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <Users aria-hidden="true" />
        Manage owners
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage owners</DialogTitle>
          <DialogDescription>
            Each change is saved as soon as you confirm it, and ended ownerships
            are kept as history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-8">
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={`rounded-lg p-3 text-sm ${
                message.tone === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-success-soft text-success"
              }`}
            >
              {message.text}
            </p>
          )}

          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Current owners</h3>
            {owners.length ? (
              <ul className="grid divide-y border-y">
                {owners.map((owner) => (
                  <li key={owner.ownershipId} className="grid gap-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium [overflow-wrap:anywhere]">
                            {owner.name}
                          </span>
                          {owner.isLead && (
                            <Badge variant="secondary">Lead landlord</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[
                            kindLabel(owner.kind),
                            owner.reference,
                            owner.since && `Owner since ${owner.since}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {ending !== owner.ownershipId && (
                        <div className="flex flex-wrap gap-2">
                          {!owner.isLead && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                run(() => setLead(owner.ownershipId))
                              }
                            >
                              Make lead landlord
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              setMessage(null);
                              setEnding(owner.ownershipId);
                            }}
                          >
                            End ownership…
                          </Button>
                        </div>
                      )}
                    </div>
                    {ending === owner.ownershipId && (
                      <EndOwnershipForm
                        owner={owner}
                        disabled={pending}
                        onCancel={() => setEnding(null)}
                        onEnd={(input) =>
                          run(
                            () => endOwnership(owner.ownershipId, input),
                            () => setEnding(null),
                          )
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                There are no current owners.
              </p>
            )}
          </section>

          <section className="grid gap-4">
            <h3 className="text-sm font-semibold">Add an owner</h3>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={makeLead}
                  onChange={(event) => setMakeLead(event.currentTarget.checked)}
                />
                Make them the lead landlord
              </label>
              <div className="grid gap-1">
                <Label
                  htmlFor="new-owner-since"
                  className="text-xs text-muted-foreground"
                >
                  Owner since (optional)
                </Label>
                <DatePicker
                  id="new-owner-since"
                  value={startedOn}
                  onChange={setStartedOn}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manage-owner-search">
                Find an existing contact
              </Label>
              <div className="flex gap-2">
                <Input
                  id="manage-owner-search"
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
                      {current.has(contact.id) ? (
                        <Badge variant="secondary">Already an owner</Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => add(contact)}
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
                branchId={propertyBranchId}
                quickAdd={quickAdd}
                onCreated={add}
              />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
