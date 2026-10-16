"use client";

import { useState, useTransition } from "react";
import { completeWorkItemAction } from "@/app/dashboard/w/[workspaceSlug]/work-item-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import type { ActionFormOptions } from "@/core/actions/application/form-options";
import type { WorkItem } from "@/core/actions/application/work-items";
import { addDays } from "./work-item-format";

/** Asks what happens next whenever an action is finished. */
export function FinishActionDialog({
  workspaceSlug,
  item,
  options,
  today,
  onClose,
  onFinished,
}: {
  workspaceSlug: string;
  item: WorkItem;
  options: ActionFormOptions;
  today: string;
  onClose: () => void;
  onFinished: (message: string) => void;
}) {
  const isLead = item.source === "lead_task";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  // A landlord lead should always have a next action, so that is the default.
  const [addNext, setAddNext] = useState(isLead);
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState(addDays(today, 1));
  const [assignee, setAssignee] = useState(item.assignee.membershipId);
  const [tried, setTried] = useState(false);

  const people = options.assignees.filter(
    (person) =>
      (!isLead || person.canWorkLeads) &&
      (person.branchIds === null || person.branchIds.includes(item.branchId)),
  );
  const assigneeValue = people.some((p) => p.membershipId === assignee)
    ? assignee
    : "";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    if (
      addNext &&
      (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || !assigneeValue)
    ) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await completeWorkItemAction(
        workspaceSlug,
        { source: item.source, id: item.id },
        addNext ? { title, dueOn, assignedMembershipId: assigneeValue } : null,
      );
      if (result.ok) {
        onFinished(
          addNext
            ? `Finished, next action added.`
            : `Finished “${item.title}”.`,
        );
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>What happens next?</DialogTitle>
            <DialogDescription>
              Finishing “{item.title}”.{" "}
              {isLead
                ? "A landlord lead should always have a next action."
                : "Add a follow-up now, or finish with nothing more to do."}
            </DialogDescription>
          </DialogHeader>
          <div
            role="radiogroup"
            aria-label="What happens next"
            className="grid gap-2"
          >
            {[
              { value: true, label: "Add a next action" },
              { value: false, label: "Nothing more to do" },
            ].map((choice) => (
              <label
                key={String(choice.value)}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="addNext"
                  checked={addNext === choice.value}
                  onChange={() => setAddNext(choice.value)}
                  className="size-4 accent-primary"
                />
                {choice.label}
              </label>
            ))}
          </div>
          {addNext ? (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="next-title">Next action</Label>
                <Input
                  id="next-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  autoComplete="off"
                  aria-invalid={tried && !title.trim()}
                  placeholder="Book the appraisal"
                />
                {tried && !title.trim() && (
                  <p className="text-xs text-destructive">
                    Say what needs doing.
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="next-due">Due</Label>
                  <Input
                    id="next-due"
                    type="date"
                    value={dueOn}
                    onChange={(event) => setDueOn(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="next-assignee">Assign to</Label>
                  <OptionSelect
                    id="next-assignee"
                    value={assigneeValue}
                    onValueChange={setAssignee}
                    placeholder="Choose a colleague"
                    options={people.map((person) => ({
                      value: person.membershipId,
                      label:
                        person.membershipId === options.currentMembershipId
                          ? `${person.name} (you)`
                          : person.name,
                    }))}
                  />
                  {tried && !assigneeValue && (
                    <p className="text-xs text-destructive">
                      Choose who will do it.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            isLead && (
              <p className="text-sm text-warning">
                This landlord lead will show as needing a next action.
              </p>
            )
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Finish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
