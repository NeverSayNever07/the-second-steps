"use client";

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  ImagePlus,
  LoaderCircle,
  MessageSquareText,
  Star,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { ActionDialog } from "@/components/instructions/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_MAX_BYTES } from "@/core/documents/domain/document-file";
import type { ListingMediaView } from "@/core/listings/application/listings";
import { MEDIA_RULES } from "@/core/listings/domain/listing-rules";

type DialogAction = (
  state: InstructionActionState,
  data: FormData,
) => Promise<InstructionActionState>;

export type ListingMediaItem = ListingMediaView & {
  captionAction: DialogAction;
  removeAction: DialogAction;
};

type Kind = "listing_photo" | "listing_floorplan";
type Upload = {
  key: number;
  name: string;
  status: "waiting" | "uploading" | "done" | "error";
  message?: string;
};

/** At most this many files travel at once, to keep memory low on the host. */
const CONCURRENCY = 2;

/** The upload route accepts names up to 255 characters. */
const NAME_MAX = 255;

/** A long name cut to fit, keeping its extension; the server renames anyway. */
function uploadName(name: string) {
  if (name.length <= NAME_MAX) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
  return name.slice(0, NAME_MAX - extension.length) + extension;
}

function uploadMessage(error: string | undefined) {
  switch (error) {
    case "unsupported_type":
    case "type_not_allowed":
      return "That file type is not allowed here.";
    case "encrypted_pdf":
      return "That PDF is password protected.";
    case "too_large":
      return "That file is over 10 MB.";
    case "empty":
    case "incomplete_file":
      return "That file looks empty or damaged.";
    case "media_limit":
      return "The listing already has the most files allowed.";
    case "record_closed":
      return "Return the listing to Draft before changing its media.";
    case "access_denied":
      return "You do not have access to add media here.";
    default:
      return "The file could not be uploaded. Try again.";
  }
}

export function ListingMediaManager({
  workspaceSlug,
  listingId,
  items,
  canEdit,
  lockedNote,
  moveAction,
}: {
  workspaceSlug: string;
  listingId: string;
  items: readonly ListingMediaItem[];
  canEdit: boolean;
  /** Why the media cannot change right now, when it cannot. */
  lockedNote: string | null;
  moveAction: (
    mediaId: string,
    move: string,
  ) => Promise<InstructionActionState>;
}) {
  const router = useRouter();
  const photos = items.filter((item) => item.role === "photo");
  const floorplans = items.filter((item) => item.role === "floorplan");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const planInput = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  const patch = (key: number, change: Partial<Upload>) =>
    setUploads((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );

  async function sendOne(kind: Kind, file: File, key: number) {
    if (file.size > DOCUMENT_MAX_BYTES) {
      patch(key, { status: "error", message: uploadMessage("too_large") });
      return;
    }
    patch(key, { status: "uploading" });
    const query = new URLSearchParams({
      kind,
      recordId: listingId,
      name: uploadName(file.name),
    });
    try {
      const response = await fetch(
        `/dashboard/w/${encodeURIComponent(workspaceSlug)}/documents/upload?${query}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            "x-zayto-upload": "1",
          },
          body: file,
        },
      );
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) {
        patch(key, { status: "error", message: uploadMessage(body.error) });
        return;
      }
      patch(key, { status: "done" });
    } catch {
      patch(key, { status: "error", message: uploadMessage(undefined) });
    }
  }

  async function addFiles(kind: Kind, files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    const batch = Array.from(files).map((file) => ({
      file,
      key: (counter.current += 1),
    }));
    setUploads(
      batch.map(({ file, key }) => ({
        key,
        name: file.name,
        status: "waiting" as const,
      })),
    );
    setBusy(true);
    // A small pool: each worker takes the next file until none are left.
    const queue = [...batch];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await sendOne(kind, next.file, next.key);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setBusy(false);
    router.refresh();
  }

  const failed = uploads.filter((item) => item.status === "error").length;
  const done = uploads.filter((item) => item.status === "done").length;

  return (
    <div className="grid gap-8">
      <section className="grid gap-3" aria-label="Media summary">
        <div>
          <h3 className="text-base font-semibold">Photos and floorplans</h3>
          <p className="text-sm text-muted-foreground">
            Needs at least {MEDIA_RULES.minPhotos} photos and{" "}
            {MEDIA_RULES.minFloorplans} floorplan to reach Ready to advertise.
            Files stay private to staff inside Zayto; nothing is published. The
            first photo is the main image.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={
              photos.length >= MEDIA_RULES.minPhotos ? "success" : "outline"
            }
          >
            {photos.length} of {MEDIA_RULES.minPhotos} photos
          </Badge>
          <Badge
            variant={
              floorplans.length >= MEDIA_RULES.minFloorplans
                ? "success"
                : "outline"
            }
          >
            {floorplans.length} of {MEDIA_RULES.minFloorplans} floorplan
          </Badge>
        </div>
        {lockedNote && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm" role="status">
            {lockedNote}
          </p>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={photoInput}
              type="file"
              multiple
              accept="image/jpeg,image/png"
              className="sr-only"
              aria-label="Choose photos"
              onChange={(event) => {
                void addFiles("listing_photo", event.target.files);
                event.target.value = "";
              }}
            />
            <input
              ref={planInput}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png"
              className="sr-only"
              aria-label="Choose floorplans"
              onChange={(event) => {
                void addFiles("listing_floorplan", event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              disabled={busy || photos.length >= MEDIA_RULES.maxPhotos}
              onClick={() => photoInput.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              Add photos
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || floorplans.length >= MEDIA_RULES.maxFloorplans}
              onClick={() => planInput.current?.click()}
            >
              <Upload aria-hidden="true" />
              Add floorplans
            </Button>
            <p className="text-xs text-muted-foreground">
              JPEG or PNG photos, floorplans as PDF, JPEG or PNG. Up to 10 MB
              each; up to {MEDIA_RULES.maxPhotos} photos and{" "}
              {MEDIA_RULES.maxFloorplans} floorplans.
            </p>
          </div>
        )}
        {uploads.length > 0 && (
          <div className="grid gap-1" role="status" aria-live="polite">
            <p className="text-sm font-medium">
              {busy
                ? `Uploading… ${done} of ${uploads.length} done`
                : failed > 0
                  ? `${done} of ${uploads.length} added; ${failed} could not be added`
                  : `${done} added`}
            </p>
            <ul className="grid gap-1 text-sm">
              {uploads.map((item) => (
                <li key={item.key} className="flex items-start gap-2">
                  {item.status === "done" ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : item.status === "error" ? (
                    <TriangleAlert
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                      aria-hidden="true"
                    />
                  ) : (
                    <LoaderCircle
                      className={`mt-0.5 size-4 shrink-0 text-muted-foreground ${item.status === "uploading" ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {item.name}
                    {item.message && (
                      <span className="text-destructive">
                        {" "}
                        — {item.message}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <MediaGroup
        title="Photos"
        empty="No photos yet."
        items={photos}
        workspaceSlug={workspaceSlug}
        canEdit={canEdit}
        moveAction={moveAction}
      />
      <MediaGroup
        title="Floorplans"
        empty="No floorplans yet."
        items={floorplans}
        workspaceSlug={workspaceSlug}
        canEdit={canEdit}
        moveAction={moveAction}
      />
    </div>
  );
}

function MediaGroup({
  title,
  empty,
  items,
  workspaceSlug,
  canEdit,
  moveAction,
}: {
  title: string;
  empty: string;
  items: readonly ListingMediaItem[];
  workspaceSlug: string;
  canEdit: boolean;
  moveAction: (
    mediaId: string,
    move: string,
  ) => Promise<InstructionActionState>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const move = (mediaId: string, how: "up" | "down" | "first") =>
    start(async () => {
      const result = await moveAction(mediaId, how);
      setError(result.status === "error" ? result.message : "");
    });

  return (
    <section className="grid gap-3" aria-label={title}>
      <h3 className="text-base font-semibold">{title}</h3>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => {
            const href = `/dashboard/w/${encodeURIComponent(workspaceSlug)}/documents/${item.documentId}`;
            const label = item.caption || item.displayName;
            return (
              <li
                key={item.id}
                className="grid content-start gap-2 rounded-lg ring-1 ring-foreground/10"
              >
                {item.mediaType === "pdf" ? (
                  <a
                    href={href}
                    className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-t-lg bg-muted text-sm text-primary underline-offset-4 hover:underline"
                  >
                    <FileText className="size-8" aria-hidden="true" />
                    Download {item.displayName}
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- a private, checked route; next/image cannot fetch it
                  <img
                    src={href}
                    alt={label}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-t-lg bg-muted object-cover"
                  />
                )}
                <div className="grid gap-2 px-3 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.isMainImage && <Badge>Main image</Badge>}
                    <p className="min-w-0 text-sm [overflow-wrap:anywhere]">
                      {item.caption || (
                        <span className="text-muted-foreground">
                          No caption
                        </span>
                      )}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={pending || index === 0}
                        onClick={() => move(item.id, "up")}
                        aria-label={`Move ${label} earlier`}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={pending || index === items.length - 1}
                        onClick={() => move(item.id, "down")}
                        aria-label={`Move ${label} later`}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      {item.role === "photo" && !item.isMainImage && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={pending}
                          onClick={() => move(item.id, "first")}
                        >
                          <Star aria-hidden="true" />
                          Make main
                        </Button>
                      )}
                      <ActionDialog
                        action={item.captionAction}
                        triggerLabel="Caption"
                        triggerIcon={<MessageSquareText aria-hidden="true" />}
                        triggerSize="xs"
                        title="Caption"
                        description="Describe what the picture shows. It is also the alternative text for people who cannot see it."
                      >
                        {(errors) => (
                          <div className="grid gap-2">
                            <Label htmlFor={`caption-${item.id}`}>
                              Caption
                            </Label>
                            <Input
                              id={`caption-${item.id}`}
                              name="caption"
                              defaultValue={item.caption}
                              maxLength={200}
                            />
                            {errors.caption && (
                              <p className="text-xs text-destructive">
                                {errors.caption}
                              </p>
                            )}
                          </div>
                        )}
                      </ActionDialog>
                      <ActionDialog
                        action={item.removeAction}
                        triggerLabel="Remove"
                        triggerIcon={<Trash2 aria-hidden="true" />}
                        triggerVariant="ghost"
                        triggerSize="xs"
                        title="Remove this file"
                        description="The file is deleted. The reason is kept in the listing's history of changes."
                        submitLabel="Remove file"
                        destructive
                      >
                        {(errors) => (
                          <div className="grid gap-2">
                            <Label htmlFor={`remove-${item.id}`}>
                              Why is it being removed?
                            </Label>
                            <Textarea
                              id={`remove-${item.id}`}
                              name="reason"
                              rows={3}
                              maxLength={500}
                            />
                            {errors.reason && (
                              <p className="text-xs text-destructive">
                                {errors.reason}
                              </p>
                            )}
                          </div>
                        )}
                      </ActionDialog>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
