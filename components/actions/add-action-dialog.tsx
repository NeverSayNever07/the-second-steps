"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { addWorkItemAction } from "@/app/dashboard/w/[workspaceSlug]/work-item-actions";
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
import type { ActionFormOptions } from "@/core/actions/application/form-options";
import type { ActionKindCode } from "@/core/actions/domain/action";
import { KIND_OPTIONS } from "./work-item-format";

const NO_LEAD = "none";

/** The one entry point for adding an action from the dashboard. */
export function AddActionDialog({
  workspaceSlug,
  options,
  today,
}: {
  workspaceSlug: string;
  options: ActionFormOptions;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ActionKindCode>("call");
  const [leadId, setLeadId] = useState(NO_LEAD);
  const [dueOn, setDueOn] = useState(today);
  const [branchId, setBranchId] = useState(options.branches[0]?.id ?? "");
  const [assignee, setAssignee] = useState(options.currentMembershipId);
  const [tried, setTried] = useState(false);

  const lead = options.leads.find(({ id }) => id === leadId);
  const effectiveBranch = lead?.branchId ?? branchId;
  // Whoever takes it must be able to work it in that branch (and, for a
  // lead, to work landlord leads).
  const people = options.assignees.filter(
    (person) =>
      (!lead || person.canWorkLeads) &&
      (person.branchIds === null || person.branchIds.includes(effectiveBranch)),
  );
  const assigneeValue = people.some((p) => p.membershipId === assignee)
    ? assignee
    : "";

  const titleError = tried && !title.trim() ? "Say what needs doing." : "";
  const dateError =
    tried && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? "Choose a due date." : "";
  const assigneeError = tried && !assigneeValue ? "Choose who will do it." : "";

  function reset() {
    setTitle("");
    setKind("call");
    setLeadId(NO_LEAD);
    setDueOn(today);
    setBranchId(options.branches[0]?.id ?? "");
    setAssignee(options.currentMembershipId);
    setTried(false);
    setError("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || !assigneeValue) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await addWorkItemAction(workspaceSlug, {
        title,
        kind,
        dueOn,
        assignedMembershipId: assigneeValue,
        branchId: effectiveBranch,
        enquiryId: lead?.id ?? "",
      });
      if (result.ok) {
        setOpen(false);
        reset();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus aria-hidden="true" />
        Add action
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Add an action</DialogTitle>
            <DialogDescription>
              It joins your list in due order. Link it to a landlord lead if it
              belongs to one.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="action-title">What needs doing?</Label>
            <Input
              id="action-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              autoComplete="off"
              aria-invalid={Boolean(titleError)}
              placeholder="Ring the council about the licence"
            />
            {titleError && (
              <p className="text-xs text-destructive">{titleError}</p>
            )}
          </div>
          {options.leads.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="action-lead">Landlord lead</Label>
              <OptionSelect
                id="action-lead"
                value={leadId}
                onValueChange={setLeadId}
                options={[
                  { value: NO_LEAD, label: "Not linked to a lead" },
                  ...options.leads.map((item) => ({
                    value: item.id,
                    label: `${item.name} (${item.reference})`,
                  })),
                ]}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {!lead && (
              <div className="grid gap-1.5">
                <Label htmlFor="action-kind">Type</Label>
                <OptionSelect
                  id="action-kind"
                  value={kind}
                  onValueChange={(value) => setKind(value as ActionKindCode)}
                  options={KIND_OPTIONS}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="action-due">Due</Label>
              <Input
                id="action-due"
                type="date"
                value={dueOn}
                onChange={(event) => setDueOn(event.target.value)}
                aria-invalid={Boolean(dateError)}
              />
              {dateError && (
                <p className="text-xs text-destructive">{dateError}</p>
              )}
            </div>
          </div>
          {!lead && options.branches.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="action-branch">Branch</Label>
              <OptionSelect
                id="action-branch"
                value={branchId}
                onValueChange={setBranchId}
                options={options.branches.map(({ id, name }) => ({
                  value: id,
                  label: name,
                }))}
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="action-assignee">Assign to</Label>
            <OptionSelect
              id="action-assignee"
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
            {assigneeError && (
              <p className="text-xs text-destructive">{assigneeError}</p>
            )}
          </div>
          {!effectiveBranch && (
            <p className="text-sm text-destructive" role="alert">
              You are not assigned to a branch, so general actions cannot be
              added yet.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || !effectiveBranch}>
              {pending ? "Saving…" : "Add action"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
