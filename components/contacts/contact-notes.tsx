"use client";

import { GitBranch, LoaderCircle } from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import type { NoteFormState } from "@/app/dashboard/w/[workspaceSlug]/contacts/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type NoteAction = (
  state: NoteFormState,
  data: FormData,
) => Promise<NoteFormState>;

export type NoteItem = {
  id: string;
  body: string;
  occurredAt: string;
  authorName: string;
  branchName: string;
  agencyWide: boolean;
  edited: boolean;
  voided: boolean;
  voidReason: string | null;
  voidedByName: string | null;
  canManage: boolean;
  editAction: NoteAction | null;
  voidAction: NoteAction | null;
};

const IDLE: NoteFormState = { status: "idle", message: "" };

// Browsers give a local time with no zone, so convert it to an exact instant
// before sending it to the server.
function withInstant(data: FormData) {
  const local = data.get("occurredAtLocal");
  data.delete("occurredAtLocal");
  if (typeof local === "string" && local) {
    const instant = new Date(local);
    if (!Number.isNaN(instant.getTime())) {
      data.set("occurredAt", instant.toISOString());
    }
  }
  return data;
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function Message({ state }: { state: NoteFormState }) {
  if (state.status !== "error") return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {state.message}
    </p>
  );
}

function NoteFields({
  idPrefix,
  defaults,
  shareable,
}: {
  idPrefix: string;
  defaults?: { body: string; occurredAt: string; agencyWide: boolean };
  shareable: boolean;
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-body`}>Note</Label>
        <Textarea
          id={`${idPrefix}-body`}
          name="body"
          required
          maxLength={5000}
          defaultValue={defaults?.body}
          placeholder="What was discussed or agreed?"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-when`}>
            When it happened (optional)
          </Label>
          <DateTimePicker
            id={`${idPrefix}-when`}
            name="occurredAtLocal"
            placeholder="Now, or choose when"
            defaultValue={defaults ? toLocalInput(defaults.occurredAt) : ""}
          />
        </div>
        {shareable && (
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="shareWithAllBranches"
              defaultChecked={defaults?.agencyWide}
            />
            Share with all branches
          </label>
        )}
      </div>
    </>
  );
}

function AddNoteForm({
  action,
  shareable,
}: {
  action: NoteAction;
  shareable: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [, startSubmit] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "saved") formRef.current?.reset();
  }, [state]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = withInstant(new FormData(event.currentTarget));
    startSubmit(() => formAction(data));
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4">
      <NoteFields idPrefix="add-note" shareable={shareable} />
      <Message state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          )}
          Add note
        </Button>
        {state.status === "saved" && (
          <p className="text-sm text-muted-foreground" role="status">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function ManageNoteForm({
  note,
  onSaved,
  shareable,
}: {
  note: NoteItem;
  onSaved: (open: boolean) => void;
  shareable: boolean;
}) {
  const [editState, editAction, editing] = useActionState(
    note.editAction as NoteAction,
    IDLE,
  );
  const [voidState, voidAction, voiding] = useActionState(
    note.voidAction as NoteAction,
    IDLE,
  );
  const [, startSubmit] = useTransition();
  const [confirmVoid, setConfirmVoid] = useState(false);

  useEffect(() => {
    if (editState.status === "saved" || voidState.status === "saved") {
      onSaved(false);
    }
  }, [editState, voidState, onSaved]);

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = withInstant(new FormData(event.currentTarget));
    startSubmit(() => editAction(data));
  }

  return (
    <div className="grid gap-5">
      <form onSubmit={submitEdit} className="grid gap-4">
        <NoteFields
          idPrefix={`edit-${note.id}`}
          shareable={shareable}
          defaults={{
            body: note.body,
            occurredAt: note.occurredAt,
            agencyWide: note.agencyWide,
          }}
        />
        <div className="grid gap-2">
          <Label htmlFor={`edit-${note.id}-reason`}>
            Reason for the change
          </Label>
          <Input
            id={`edit-${note.id}-reason`}
            name="reason"
            required
            maxLength={500}
            placeholder="For example Corrected a typo"
          />
        </div>
        <Message state={editState} />
        <DialogFooter>
          <Button type="submit" disabled={editing}>
            {editing && (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            )}
            Save correction
          </Button>
        </DialogFooter>
      </form>
      <div className="grid gap-3 border-t pt-4">
        {confirmVoid ? (
          <form action={voidAction} className="grid gap-3">
            <p className="text-sm">
              Voiding hides this note from the timeline. It is kept for managers
              and cannot be restored.
            </p>
            <div className="grid gap-2">
              <Label htmlFor={`void-${note.id}-reason`}>
                Reason for voiding
              </Label>
              <Input
                id={`void-${note.id}-reason`}
                name="reason"
                required
                maxLength={500}
                placeholder="For example Added to the wrong record"
              />
            </div>
            <Message state={voidState} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" disabled={voiding}>
                Void note
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmVoid(false)}
              >
                Keep note
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="w-fit"
            onClick={() => setConfirmVoid(true)}
          >
            Void note…
          </Button>
        )}
      </div>
    </div>
  );
}

function ManageNoteDialog({
  note,
  shareable,
}: {
  note: NoteItem;
  shareable: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" />}
        aria-label={`Manage note by ${note.authorName}`}
      >
        Manage
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct or void note</DialogTitle>
          <DialogDescription>
            The original wording is kept in the note&apos;s history.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ManageNoteForm note={note} onSaved={setOpen} shareable={shareable} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ContactNotes({
  addAction,
  canAdd,
  canSeeVoided,
  notes,
  showVoided,
  toggleHref,
  shareable = true,
}: {
  addAction: NoteAction;
  canAdd: boolean;
  canSeeVoided: boolean;
  notes: readonly NoteItem[];
  showVoided: boolean;
  toggleHref: string;
  /** Contact notes belong to a branch and can be shared; property notes cannot. */
  shareable?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {canAdd && <AddNoteForm action={addAction} shareable={shareable} />}
      {canSeeVoided && (
        <Link
          href={toggleHref}
          className="w-fit text-sm text-primary underline-offset-4 hover:underline"
        >
          {showVoided ? "Hide voided notes" : "Show voided notes"}
        </Link>
      )}
      {notes.length ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] divide-y border-t">
          {notes.map((note) => (
            <li
              key={note.id}
              className="grid gap-2 py-4"
              data-voided={note.voided || undefined}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {note.authorName}
                </span>
                <time suppressHydrationWarning dateTime={note.occurredAt}>
                  {formatWhen(note.occurredAt)}
                </time>
                {shareable && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="size-3" aria-hidden="true" />
                    {note.agencyWide ? "All branches" : note.branchName}
                  </span>
                )}
                {note.edited && <Badge variant="secondary">Edited</Badge>}
                {note.voided && <Badge variant="secondary">Voided</Badge>}
                {note.canManage && note.editAction && note.voidAction && (
                  <span className="ml-auto">
                    <ManageNoteDialog note={note} shareable={shareable} />
                  </span>
                )}
              </div>
              <p
                className={`whitespace-pre-wrap text-sm ${
                  note.voided ? "text-muted-foreground line-through" : ""
                }`}
              >
                {note.body}
              </p>
              {note.voided && (
                <p className="text-xs text-muted-foreground">
                  Voided by {note.voidedByName ?? "a manager"}:{" "}
                  {note.voidReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}
    </div>
  );
}
