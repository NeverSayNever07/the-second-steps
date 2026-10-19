"use client";

import { Check, Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import type { EnquiryActionState } from "@/app/dashboard/w/[workspaceSlug]/enquiries/actions";
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
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";

const IDLE: EnquiryActionState = { status: "idle", message: "" };

export function AddEnquiryTask({
  action,
  assignees,
  currentMembershipId,
}: {
  action: (
    state: EnquiryActionState,
    data: FormData,
  ) => Promise<EnquiryActionState>;
  assignees: readonly { membershipId: string; name: string }[];
  currentMembershipId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (previous: EnquiryActionState, data: FormData) => {
      const result = await action(previous, data);
      if (result.status === "saved") setOpen(false);
      return result;
    },
    IDLE,
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus aria-hidden="true" />
        Add next action
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Add next action</DialogTitle>
            <DialogDescription>
              Give this landlord lead a clear owner and due date.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="taskTitle">What needs doing?</Label>
            <Input id="taskTitle" name="title" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="taskDueOn">Due date</Label>
              <DatePicker id="taskDueOn" name="dueOn" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="taskAssigned">Assigned to</Label>
              <OptionSelect
                id="taskAssigned"
                name="assignedMembershipId"
                required
                defaultValue={
                  assignees.some(
                    ({ membershipId }) => membershipId === currentMembershipId,
                  )
                    ? currentMembershipId
                    : ""
                }
                placeholder="Choose a staff member"
                options={assignees.map(({ membershipId, name }) => ({
                  value: membershipId,
                  label: name,
                }))}
              />
            </div>
          </div>
          {state.status === "error" && (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add action"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaskCloseButtons({
  completeAction,
  cancelAction,
}: {
  completeAction: () => Promise<void>;
  cancelAction: () => Promise<void>;
}) {
  return (
    <div className="relative z-10 flex gap-2">
      <form action={completeAction}>
        <Button type="submit" size="sm" variant="outline">
          <Check aria-hidden="true" />
          Done
        </Button>
      </form>
      <form action={cancelAction}>
        <Button type="submit" size="sm" variant="ghost">
          <X aria-hidden="true" />
          Cancel
        </Button>
      </form>
    </div>
  );
}
