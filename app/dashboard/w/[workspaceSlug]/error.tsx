"use client";

import { useParams } from "next/navigation";
import { SegmentError } from "@/components/feedback/segment-error";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return (
    <SegmentError
      error={error}
      reset={reset}
      homeHref={`/dashboard/w/${workspaceSlug}`}
      homeLabel="the dashboard"
    />
  );
}
