"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import {
  ContactForm,
  type ContactFormAction,
} from "@/components/contacts/contact-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "New contact" opens as a short modal (ADR-038): choose person or
 * organisation, add the essentials, and the new contact opens. Addresses and
 * communication preferences are added on the record afterwards.
 */
export function NewContactDialog({
  personAction,
  organisationAction,
  branches,
  defaultOpen = false,
  defaultKind = "person",
}: {
  personAction: ContactFormAction;
  organisationAction: ContactFormAction;
  branches: readonly { id: string; name: string }[];
  defaultOpen?: boolean;
  defaultKind?: "person" | "organisation";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<"person" | "organisation">(defaultKind);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        New contact
      </DialogTrigger>
      <DialogContent className="top-auto bottom-0 left-0 max-h-[92dvh] max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none md:top-1/2 md:bottom-auto md:left-1/2 md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
        <DialogHeader>
          <DialogTitle>New contact</DialogTitle>
          <DialogDescription>
            Just the essentials. Addresses and preferences can be added on the
            contact afterwards.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <>
            <div
              role="group"
              aria-label="Type of contact"
              className="flex gap-2"
            >
              {(
                [
                  ["person", "Person"],
                  ["organisation", "Organisation"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={kind === value ? "default" : "outline"}
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <ContactForm
              key={kind}
              action={kind === "person" ? personAction : organisationAction}
              branches={branches}
              kind={kind}
              compact
              inDialog
              onCancel={() => setOpen(false)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
