"use client";

import { Plus } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { PropertyForm } from "@/components/properties/property-form";
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
 * "New property" opens as a modal (ADR-038): the address, type, rooms, branch
 * and owners. Features, council tax, floor area and notes are added with Edit
 * property afterwards.
 */
export function NewPropertyDialog({
  defaultOpen = false,
  ...formProps
}: {
  defaultOpen?: boolean;
} & Omit<ComponentProps<typeof PropertyForm>, "compact" | "onCancel">) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        New property
      </DialogTrigger>
      <DialogContent className="top-auto bottom-0 left-0 max-h-[92dvh] max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none md:top-1/2 md:bottom-auto md:left-1/2 md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
        <DialogHeader>
          <DialogTitle>New property</DialogTitle>
          <DialogDescription>
            The address, type, rooms, branch and owners. Features and other
            details can be added with Edit property afterwards.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PropertyForm
            {...formProps}
            compact
            onCancel={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
