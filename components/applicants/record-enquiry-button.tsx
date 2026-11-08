"use client";

import { Handshake } from "lucide-react";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { ActionDialog } from "@/components/instructions/action-dialog";

/** Records an applicant's interest in a home, after a one-line confirmation. */
export function RecordEnquiryButton({
  action,
  applicantName,
  address,
}: {
  action: (
    state: InstructionActionState,
    data: FormData,
  ) => Promise<InstructionActionState>;
  applicantName: string;
  address: string;
}) {
  return (
    <ActionDialog
      action={action}
      triggerLabel="Record enquiry"
      triggerIcon={<Handshake aria-hidden="true" />}
      title="Record an enquiry?"
      description={`${applicantName} is interested in ${address}. This starts a property enquiry you can follow up. Nothing is sent to anyone.`}
      submitLabel="Record enquiry"
    >
      {() => null}
    </ActionDialog>
  );
}
