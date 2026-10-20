import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  INSTRUCTION_STALE_AFTER_DAYS,
  type InstructionAttention,
} from "@/core/instructions/application/instruction-attention";
import { Panel } from "./panel";
import { relativeTime } from "./relative-time";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Where instructions stand in onboarding, and which have gone quiet. */
export function InstructionOnboardingPanel({
  attention,
  workspacePath,
  now = new Date(),
}: {
  attention: InstructionAttention;
  workspacePath: string;
  now?: Date;
}) {
  const instructionsPath = `${workspacePath}/instructions`;
  const { onboarding, readyToMarket, stalled } = attention;
  const hiddenStalled = stalled.count - stalled.items.length;

  return (
    <Panel
      title="Instruction onboarding"
      right={
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={instructionsPath} />}
          nativeButton={false}
        >
          All instructions
        </Button>
      }
    >
      <ul
        aria-label="Instruction totals"
        className="grid grid-cols-2 gap-2 p-2"
      >
        <li className="rounded-lg bg-muted/40 px-3 py-2">
          <Link
            href={`${instructionsPath}?stage=onboarding`}
            className="block hover:underline"
          >
            <span className="block text-xs text-muted-foreground">
              In onboarding
            </span>
            <span className="block text-xl font-semibold tabular-nums">
              {onboarding}
            </span>
          </Link>
        </li>
        <li className="rounded-lg bg-muted/40 px-3 py-2">
          <Link
            href={`${instructionsPath}?stage=ready_to_market`}
            className="block hover:underline"
          >
            <span className="block text-xs text-muted-foreground">
              Ready to market
            </span>
            <span className="block text-xl font-semibold tabular-nums">
              {readyToMarket}
            </span>
          </Link>
        </li>
      </ul>
      <div className="border-t">
        {stalled.count === 0 ? (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            No onboarding has gone quiet for {INSTRUCTION_STALE_AFTER_DAYS}{" "}
            days.
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
              <AlertTriangle
                aria-hidden="true"
                className="size-4 text-warning"
              />
              {plural(stalled.count, "instruction has", "instructions have")}{" "}
              not changed for {INSTRUCTION_STALE_AFTER_DAYS} days
            </p>
            <ul className="divide-y">
              {stalled.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${instructionsPath}/${item.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {item.property}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {item.reference}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Last change {relativeTime(item.lastChangedAt, now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {hiddenStalled > 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                and {hiddenStalled} more.{" "}
                <Link
                  className="underline"
                  href={`${instructionsPath}?stage=onboarding`}
                >
                  See all in onboarding
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
