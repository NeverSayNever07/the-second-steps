"use client";

import { LoaderCircle } from "lucide-react";
import {
  startTransition,
  useActionState,
  useState,
  type ReactNode,
} from "react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
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

const IDLE: InstructionActionState = { status: "idle", message: "" };

/**
 * One reviewed task in a dialog: the fields, one save, a clear error. When a
 * change would take the property back from Ready to market, the person is
 * told and must tick a box before it saves.
 */
export function ActionDialog({
  action,
  triggerLabel,
  triggerIcon,
  triggerVariant = "outline",
  triggerSize = "sm",
  title,
  description,
  submitLabel = "Save",
  destructive = false,
  wide = false,
  children,
}: {
  action: (
    state: InstructionActionState,
    data: FormData,
  ) => Promise<InstructionActionState>;
  triggerLabel: string;
  triggerIcon?: ReactNode;
  triggerVariant?: "default" | "outline" | "ghost" | "destructive";
  triggerSize?: "default" | "sm" | "xs";
  title: string;
  description?: ReactNode;
  submitLabel?: string;
  destructive?: boolean;
  /** For long forms such as the terms. */
  wide?: boolean;
  children: (errors: Partial<Record<string, string>>) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (previous: InstructionActionState, data: FormData) => {
      const result = await action(previous, data);
      if (result.status === "saved") setOpen(false);
      return result;
    },
    IDLE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={triggerVariant} size={triggerSize} />}
      >
        {triggerIcon}
        {triggerLabel}
      </DialogTrigger>
      <DialogContent
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <form
          // Not `action={...}`: React clears the fields of an action form after
          // every submit, which would wipe what the person typed when a save is
          // refused or needs confirming.
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(() => formAction(data));
          }}
          className="grid gap-5"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          {children(state.fieldErrors ?? {})}
          {state.status === "error" && (
            <div
              className="grid gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              <p>{state.message}</p>
              {state.needsConfirmation && (
                <label className="flex items-start gap-2 text-foreground">
                  <input
                    type="checkbox"
                    name="confirm"
                    value="yes"
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>Save the change and return to Onboarding</span>
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
            >
              {pending && (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              )}
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
