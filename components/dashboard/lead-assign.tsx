"use client";

import { UserRoundCog } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Changes who looks after a lead. `onAssign` is a bound server action. */
export function LeadAssign({
  leadName,
  currentMembershipId,
  people,
  onAssign,
}: {
  leadName: string;
  currentMembershipId: string | null;
  people: readonly { membershipId: string; name: string }[];
  onAssign: (membershipId: string) => Promise<{
    status: "idle" | "error" | "saved";
    message: string;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const choices = people.filter(
    ({ membershipId }) => membershipId !== currentMembershipId,
  );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPerson("");
          setError("");
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            aria-label={`Assign ${leadName}`}
            disabled={choices.length === 0}
          />
        }
      >
        <UserRoundCog aria-hidden="true" />
        Assign
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="text-xs font-medium text-muted-foreground">
          Who should look after this lead?
        </p>
        <OptionSelect
          value={person}
          onValueChange={setPerson}
          placeholder="Choose a colleague"
          options={choices.map(({ membershipId, name }) => ({
            value: membershipId,
            label: name,
          }))}
        />
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button
          size="sm"
          disabled={!person || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await onAssign(person);
              if (result.status === "saved") setOpen(false);
              else setError(result.message);
            })
          }
        >
          {pending ? "Saving…" : "Assign"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
