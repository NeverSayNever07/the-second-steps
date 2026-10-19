"use client";

import { RotateCcw, Trophy } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";

const IDLE: EnquiryActionState = { status: "idle", message: "" };

export function EnquiryStageActions({
  closeAction,
  reopenAction,
  canClose,
  canReopen,
  reasons,
  compact = false,
}: {
  closeAction: (
    state: EnquiryActionState,
    data: FormData,
  ) => Promise<EnquiryActionState>;
  reopenAction: (
    state: EnquiryActionState,
    data: FormData,
  ) => Promise<EnquiryActionState>;
  canClose: boolean;
  canReopen: boolean;
  reasons: readonly {
    id: string;
    name: string;
    appliesTo: "lost" | "postponed" | "both";
  }[];
  /** A smaller, outline trigger for use inside a card. */
  compact?: boolean;
}) {
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [closeState, closeFormAction, closePending] = useActionState(
    async (previous: EnquiryActionState, data: FormData) => {
      const result = await closeAction(previous, data);
      if (result.status === "saved") setCloseOpen(false);
      return result;
    },
    IDLE,
  );
  const [reopenState, reopenFormAction, reopenPending] = useActionState(
    async (previous: EnquiryActionState, data: FormData) => {
      const result = await reopenAction(previous, data);
      if (result.status === "saved") setReopenOpen(false);
      return result;
    },
    IDLE,
  );
  // Winning a landlord lead is done by starting its instruction.
  const [outcome, setOutcome] = useState<"lost" | "postponed">("lost");
  const outcomeReasons = reasons.filter(
    ({ appliesTo }) => appliesTo === outcome || appliesTo === "both",
  );

  return (
    <div className="flex flex-wrap gap-2">
      {canClose && (
        <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
          <DialogTrigger
            render={
              compact ? <Button size="xs" variant="outline" /> : <Button />
            }
          >
            <Trophy aria-hidden="true" />
            {compact ? "Record outcome" : "Close landlord lead"}
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
            <form action={closeFormAction} className="grid gap-5">
              <DialogHeader>
                <DialogTitle>Record lead outcome</DialogTitle>
                <DialogDescription>
                  This closes open next actions and any scheduled appraisal.
                  Lost and postponed landlord leads can be reopened later.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="outcome">Outcome</Label>
                <OptionSelect
                  id="outcome"
                  name="outcome"
                  value={outcome}
                  onValueChange={(value) => setOutcome(value as typeof outcome)}
                  options={[
                    { value: "lost", label: "Lost" },
                    { value: "postponed", label: "Postponed" },
                  ]}
                />
              </div>
              <>
                <div className="grid gap-2">
                  <Label htmlFor="outcomeReasonId">Reason</Label>
                  <OptionSelect
                    id="outcomeReasonId"
                    name="outcomeReasonId"
                    required
                    placeholder="Choose a reason"
                    options={outcomeReasons.map(({ id, name }) => ({
                      value: id,
                      label: name,
                    }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="outcomeNote">Note (optional)</Label>
                  <Textarea id="outcomeNote" name="outcomeNote" rows={3} />
                </div>
                {outcome === "postponed" && (
                  <div className="grid gap-2">
                    <Label htmlFor="followUpOn">
                      Follow-up date (optional)
                    </Label>
                    <Input id="followUpOn" name="followUpOn" type="date" />
                  </div>
                )}
              </>
              {closeState.status === "error" && (
                <p className="text-sm text-destructive" role="alert">
                  {closeState.message}
                </p>
              )}
              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="outline" />}
                >
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={closePending}>
                  {closePending ? "Saving…" : "Save outcome"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {canReopen && (
        <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
          <DialogTrigger render={<Button variant="outline" />}>
            <RotateCcw aria-hidden="true" />
            Reopen
          </DialogTrigger>
          <DialogContent>
            <form action={reopenFormAction} className="grid gap-5">
              <DialogHeader>
                <DialogTitle>Reopen this landlord lead?</DialogTitle>
                <DialogDescription>
                  The outcome is cleared. Closed next actions are kept as
                  history, so add a new next action afterwards.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="reopenReason">Reason</Label>
                <Textarea id="reopenReason" name="reason" required rows={3} />
              </div>
              {reopenState.status === "error" && (
                <p className="text-sm text-destructive" role="alert">
                  {reopenState.message}
                </p>
              )}
              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="outline" />}
                >
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={reopenPending}>
                  {reopenPending ? "Reopening…" : "Reopen landlord lead"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
