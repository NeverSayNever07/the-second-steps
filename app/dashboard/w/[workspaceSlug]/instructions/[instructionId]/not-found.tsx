import { Handshake } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function InstructionNotFound() {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="grid justify-items-center gap-4 py-12 text-center">
        <Handshake
          className="size-8 text-muted-foreground"
          aria-hidden="true"
        />
        <div>
          <h1 className="text-lg font-semibold">Instruction not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            It may be outside your branch access or no longer available.
          </p>
        </div>
        <Button
          render={<Link href="../../" />}
          nativeButton={false}
          variant="outline"
        >
          Back to the dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
