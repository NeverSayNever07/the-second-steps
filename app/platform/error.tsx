"use client";

import { SegmentError } from "@/components/feedback/segment-error";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentError
      error={error}
      reset={reset}
      homeHref="/platform"
      homeLabel="the platform overview"
    />
  );
}
