"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * An error screen that sits inside the app shell, so the person keeps their
 * navigation and can try again or leave. Used by `error.tsx` files.
 */
export function SegmentError({
  error,
  reset,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    // Only the digest is logged by the browser console; details stay on the server.
    console.error("A Zayto page failed to render.", error.digest ?? "");
  }, [error]);

  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="grid justify-items-center gap-4 py-12 text-center">
        <CircleAlert className="size-8 text-destructive" aria-hidden="true" />
        <div role="alert">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This page could not be loaded. Nothing was changed. Try again, or go
            back to {homeLabel}.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" onClick={reset}>
            Try again
          </Button>
          <Button
            render={<Link href={homeHref} />}
            nativeButton={false}
            variant="ghost"
          >
            Back to {homeLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
