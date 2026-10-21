"use client";

import { CalendarX, ClipboardCheck, Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import type { EnquiryActionState } from "@/app/dashboard/w/[workspaceSlug]/enquiries/actions";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";

const IDLE: EnquiryActionState = { status: "idle", message: "" };

export function AppraisalControls({
  editAction,
  completeAction,
  finishAction,
  booking,
  assignees,
}: {
  editAction: (
    state: EnquiryActionState,
    data: FormData,
  ) => Promise<EnquiryActionState>;
  completeAction: (
    state: EnquiryActionState,
    data: FormData,
  ) => Promise<EnquiryActionState>;
  finishAction: (
    state: EnquiryActionState,
    data: FormData,
  ) => Promise<EnquiryActionState>;
  booking: {
    scheduledAt: string;
    assignedMembershipId: string;
    notes: string;
  };
  assignees: readonly { membershipId: string; name: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [completeState, completeFormAction, completePending] = useActionState(
    async (previous: EnquiryActionState, data: FormData) => {
      const result = await completeAction(previous, data);
      if (result.status === "saved") setCompleteOpen(false);
      return result;
    },
    IDLE,
  );
  const [finishState, finishFormAction, finishPending] = useActionState(
    async (previous: EnquiryActionState, data: FormData) => {
      const result = await finishAction(previous, data);
      if (result.status === "saved") setFinishOpen(false);
      return result;
    },
    IDLE,
  );
  const [editState, editFormAction, editPending] = useActionState(
    async (previous: EnquiryActionState, data: FormData) => {
      const result = await editAction(previous, data);
      if (result.status === "saved") setEditOpen(false);
      return result;
    },
    IDLE,
  );
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <Pencil aria-hidden="true" />
          Edit booking
        </DialogTrigger>
        <DialogContent>
          <form action={editFormAction} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Edit appraisal booking</DialogTitle>
              <DialogDescription>
                Change the appointment, attendee or practical notes before the
                appraisal is completed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="editScheduledAt">Date and time</Label>
              <DateTimePicker
                id="editScheduledAt"
                name="scheduledAt"
                defaultValue={booking.scheduledAt}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editAssignedMembershipId">Assigned to</Label>
              <OptionSelect
                id="editAssignedMembershipId"
                name="assignedMembershipId"
                defaultValue={booking.assignedMembershipId}
                required
                options={assignees.map(({ membershipId, name }) => ({
                  value: membershipId,
                  label: name,
                }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editBookingNotes">
                Appointment notes (optional)
              </Label>
              <Textarea
                id="editBookingNotes"
                name="bookingNotes"
                defaultValue={booking.notes}
                rows={3}
                maxLength={2000}
                placeholder="For example, gate code, dog or directions"
              />
            </div>
            {editState.status === "error" && (
              <p className="text-sm text-destructive" role="alert">
                {editState.message}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Savingâ€¦" : "Save booking"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogTrigger render={<Button size="sm" />}>
          <ClipboardCheck aria-hidden="true" />
          Complete appraisal
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <form action={completeFormAction} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Complete appraisal</DialogTitle>
              <DialogDescription>
                Record the recommendation and proposed fee. Lead source must
                already be recorded.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="expectedMonthlyRent">
                  Expected monthly rent
                </Label>
                <Input
                  id="expectedMonthlyRent"
                  name="expectedMonthlyRent"
                  inputMode="decimal"
                  placeholder="1500"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="recommendedService">Recommended service</Label>
                <OptionSelect
                  id="recommendedService"
                  name="recommendedService"
                  placeholder="Not recorded"
                  options={[
                    { value: "", label: "Not recorded" },
                    { value: "let_only", label: "Let only" },
                    { value: "rent_collection", label: "Rent collection" },
                    { value: "fully_managed", label: "Fully managed" },
                  ]}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="feeKind">Fee type</Label>
                <OptionSelect
                  id="feeKind"
                  name="feeKind"
                  placeholder="No proposed fee"
                  options={[
                    { value: "", label: "No proposed fee" },
                    { value: "percentage", label: "Percentage" },
                    { value: "fixed", label: "Fixed amount" },
                  ]}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="feeValue">Fee value</Label>
                <Input
                  id="feeValue"
                  name="feeValue"
                  inputMode="decimal"
                  placeholder="12.5 or 750"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="feeVat">VAT</Label>
                <OptionSelect
                  id="feeVat"
                  name="feeVat"
                  placeholder="Choose VAT treatment"
                  options={[
                    { value: "", label: "Not recorded" },
                    { value: "inclusive", label: "VAT inclusive" },
                    { value: "exclusive", label: "VAT exclusive" },
                  ]}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="appraisalNotes">Notes</Label>
              <Textarea id="appraisalNotes" name="notes" rows={4} />
            </div>
            {completeState.status === "error" && (
              <p className="text-sm text-destructive" role="alert">
                {completeState.message}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={completePending}>
                {completePending ? "Saving…" : "Complete appraisal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <CalendarX aria-hidden="true" />
          Could not complete
        </DialogTrigger>
        <DialogContent>
          <form action={finishFormAction} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Close this appointment</DialogTitle>
              <DialogDescription>
                The landlord lead returns to New lead so another appraisal can
                be booked.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="disposition">What happened?</Label>
              <OptionSelect
                id="disposition"
                name="disposition"
                required
                placeholder="Choose an outcome"
                options={[
                  { value: "cancelled", label: "Cancelled" },
                  { value: "did_not_attend", label: "Landlord did not attend" },
                ]}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="appraisalFinishReason">Reason</Label>
              <Textarea
                id="appraisalFinishReason"
                name="reason"
                required
                rows={3}
              />
            </div>
            {finishState.status === "error" && (
              <p className="text-sm text-destructive" role="alert">
                {finishState.message}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Back
              </DialogClose>
              <Button type="submit" disabled={finishPending}>
                {finishPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
