"use client";

import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function PropertyArchiveControl({
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
          <DialogTitle>Archive this property?</DialogTitle>
          <DialogDescription>
            The property will be hidden from normal lists but kept with its
            owners, notes and history. It can be reactivated later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <form action={action}>
            <Button type="submit" variant="destructive">
              Archive property
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
