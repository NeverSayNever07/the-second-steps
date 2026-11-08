"use client";

import { Archive, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContactForm,
  type InitialContact,
} from "@/components/contacts/contact-form";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ContactFormState } from "@/app/dashboard/w/[workspaceSlug]/contacts/actions";

type FormAction = (
  state: ContactFormState,
  data: FormData,
) => Promise<ContactFormState>;

export function ContactEditor({
  action,
  branches,
  initial,
  kind,
  canManageIdentity = false,
}: {
  action: FormAction;
  branches: readonly { id: string; name: string }[];
  initial: InitialContact;
  kind: "person" | "organisation";
  canManageIdentity?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>
        <Pencil aria-hidden="true" />
        Edit contact
      </DialogTrigger>
      <DialogContent className="inset-0 top-0 left-0 h-dvh max-h-dvh max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-4 md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100vh-2rem)] md:max-w-4xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogDescription>
            Update contact details in one place.
          </DialogDescription>
        </DialogHeader>
        <ContactForm
          action={action}
          branches={branches}
          initial={initial}
          kind={kind}
          submitLabel="Save contact"
          inDialog
          canManageIdentity={canManageIdentity}
        />
      </DialogContent>
    </Dialog>
  );
}

export function ContactArchiveControl({
  action,
  archived,
}: {
  action: () => Promise<void>;
  archived: boolean;
}) {
  if (archived)
    return (
      <form action={action}>
        <Button type="submit" variant="secondary">
          <RotateCcw aria-hidden="true" />
          Reactivate
        </Button>
      </form>
    );
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>
        <Archive aria-hidden="true" />
        Archive
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this contact?</DialogTitle>
          <DialogDescription>
            The record will be hidden from normal contact lists but retained
            with its history. It can be reactivated later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <form action={action}>
            <Button type="submit" variant="destructive">
              Archive contact
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
