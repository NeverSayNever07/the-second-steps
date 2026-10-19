"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function InstructionsError({ reset }: { reset: () => void }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="grid justify-items-center gap-4 py-12 text-center">
        <CircleAlert className="size-8 text-destructive" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-semibold">
            The instruction could not be loaded
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Try again. If the problem continues, nothing has been changed.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={reset}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
