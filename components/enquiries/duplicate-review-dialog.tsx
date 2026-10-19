"use client";

import { LoaderCircle, SearchCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DuplicateMatches = {
  contactMatches?: {
    id: string;
    name: string;
    reference: string;
    strength: "strong" | "possible";
    matchedFields: string[];
  }[];
  propertyMatches?: {
    id: string;
    reference: string;
    strength: "strong" | "possible";
    archived: boolean;
    addressLine: string;
    postcode: string;
  }[];
};

export type DuplicateChoices = {
  contactChoice: string;
  propertyChoice: string;
  reviewedContactId: string[];
  reviewedPropertyId: string[];
};

/**
 * The pop-up shown only when a landlord or property may already exist. The
 * person picks an existing record or creates a new one. Closing it keeps
 * everything typed on the page behind it.
 */
export function DuplicateReviewDialog({
  open,
  matches,
  pending,
  onClose,
  onConfirm,
  confirmLabel,
}: {
  open: boolean;
  matches: DuplicateMatches;
  pending: boolean;
  onClose: () => void;
  onConfirm: (choices: DuplicateChoices) => void;
  confirmLabel: string;
}) {
  const [contactChoice, setContactChoice] = useState("new");
  const [propertyChoice, setPropertyChoice] = useState("new");
  const contacts = matches.contactMatches ?? [];
  const properties = matches.propertyMatches ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchCheck className="size-4" aria-hidden="true" />
            Possible matches
          </DialogTitle>
          <DialogDescription>
            Zayto found records that may be the same landlord or property.
            Choose an existing one, or create a new record. Nothing is saved
            until you confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          {contacts.length > 0 && (
            <fieldset className="grid gap-3">
              <legend className="font-medium">Landlord</legend>
              {contacts.map((match) => (
                <label
                  key={match.id}
                  className="flex gap-3 rounded-lg border p-3 text-sm"
                >
                  <input
                    type="radio"
                    name="contactChoice"
                    value={match.id}
                    checked={contactChoice === match.id}
                    onChange={() => setContactChoice(match.id)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <strong>{match.name}</strong> ({match.reference})
                    <br />
                    <span className="text-muted-foreground">
                      Matched {match.matchedFields.join(", ")} ·{" "}
                      {match.strength}
                    </span>
                  </span>
                </label>
              ))}
              <label className="flex gap-3 rounded-lg border p-3 text-sm">
                <input
                  type="radio"
                  name="contactChoice"
                  value="new"
                  checked={contactChoice === "new"}
                  onChange={() => setContactChoice("new")}
                  className="mt-0.5 size-4 accent-primary"
                />
                Create a new landlord
              </label>
            </fieldset>
          )}
          {properties.length > 0 && (
            <fieldset className="grid gap-3">
              <legend className="font-medium">Property</legend>
              {properties.map((match) => (
                <label
                  key={match.id}
                  className="flex gap-3 rounded-lg border p-3 text-sm"
                >
                  <input
                    type="radio"
                    name="propertyChoice"
                    value={match.id}
                    disabled={match.archived}
                    checked={propertyChoice === match.id}
                    onChange={() => setPropertyChoice(match.id)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <strong>{match.addressLine}</strong> ({match.reference})
                    <br />
                    <span className="text-muted-foreground">
                      {match.postcode} · {match.strength}
                      {match.archived ? " · Archived" : ""}
                    </span>
                  </span>
                </label>
              ))}
              <label className="flex gap-3 rounded-lg border p-3 text-sm">
                <input
                  type="radio"
                  name="propertyChoice"
                  value="new"
                  checked={propertyChoice === "new"}
                  onChange={() => setPropertyChoice("new")}
                  className="mt-0.5 size-4 accent-primary"
                />
                Create a new property
              </label>
            </fieldset>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Back to the details
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              onConfirm({
                contactChoice,
                propertyChoice,
                reviewedContactId: contacts.map(({ id }) => id),
                reviewedPropertyId: properties.map(({ id }) => id),
              })
            }
          >
            {pending && (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
