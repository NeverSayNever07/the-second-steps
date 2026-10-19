import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { startInstructionAction } from "../../../instructions/actions";
import { StartInstructionForm } from "@/components/instructions/start-instruction-form";
import { Button } from "@/components/ui/button";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUser } from "@/core/auth/mfa";
import { listEnquiryAssignees } from "@/core/enquiries/application/enquiries";
import { ukToday } from "@/core/enquiries/domain/enquiry";
import { getStartInstructionReview } from "@/core/instructions/application/instruction-records";
import {
  basisPointsToField,
  penceToField,
} from "@/core/instructions/domain/instruction-labels";
import { isUuid } from "@/core/properties/domain/ids";

export default async function StartInstructionPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; enquiryId: string }>;
}) {
  const { workspaceSlug, enquiryId } = await params;
  if (!isUuid(enquiryId)) notFound();
  const recordPath = `/dashboard/w/${workspaceSlug}/enquiries/${enquiryId}`;
  const user = await requireMfaUser(`${recordPath}/start-instruction`, {
    workspaceSlug,
  });
  const actor = { authSubject: user.id, workspaceSlug };
  const [review, context, allStaff] = await Promise.all([
    getStartInstructionReview({ ...actor, enquiryId }),
    getWorkspaceAccessContext(user.id, workspaceSlug),
    listEnquiryAssignees(actor),
  ]);
  if (!context || !context.permissions.has("instruction.manage")) {
    redirect("/access-denied");
  }
  if (!review) notFound();
  // Already won, or the appraisal is not completed: back to the lead.
  if (review.blocker) redirect(recordPath);
  // One current instruction per property: open that one instead.
  if (review.existingInstruction) {
    redirect(
      `/dashboard/w/${workspaceSlug}/instructions/${review.existingInstruction.id}`,
    );
  }

  const staff = allStaff.filter(
    ({ branchIds }) =>
      branchIds === null || branchIds.includes(review.branch.id),
  );
  // The lead's landlord first, then the property's other current owners.
  const landlords = [
    {
      id: review.landlord.id,
      name: review.landlord.name,
      reference: review.landlord.reference,
      note: review.owners.some(({ id }) => id === review.landlord.id)
        ? "Landlord on the lead and current owner"
        : "Landlord on the lead",
    },
    ...review.owners
      .filter(({ id }) => id !== review.landlord.id)
      .map((owner) => ({
        id: owner.id,
        name: owner.name,
        reference: owner.reference,
        note: owner.isLead ? "Current owner (lead owner)" : "Current owner",
      })),
  ];
  const suggested = review.suggestedTerms;

  return (
    <div className="grid gap-8">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={recordPath} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to landlord lead
      </Button>
      <header>
        <p className="text-sm font-medium text-primary">
          {review.enquiry.reference}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Start instruction
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {review.property.addressLine} · {review.branch.name}
        </p>
      </header>
      <StartInstructionForm
        action={startInstructionAction.bind(null, workspaceSlug, enquiryId)}
        cancelHref={recordPath}
        appraisalId={review.appraisalId}
        today={ukToday()}
        landlords={landlords}
        defaultMainId={review.landlord.id}
        staff={staff.map(({ membershipId, name }) => ({ membershipId, name }))}
        defaultStaffId={review.leadStaff?.membershipId ?? ""}
        terms={{
          service: suggested.service ?? "",
          askingRent: penceToField(suggested.askingRentPence),
          rentPeriod: suggested.rentPeriod ?? "month",
          feeKind: suggested.feeKind ?? "",
          feeValue:
            suggested.feeKind === "percentage"
              ? basisPointsToField(suggested.feeValue)
              : suggested.feeKind === "fixed"
                ? penceToField(suggested.feeValue)
                : "",
          feeFrequency: "",
          feeVat: suggested.feeVat ?? "",
          depositOffering: "",
          deposit: "",
          holdingDeposit: "",
          charges: [],
        }}
      />
    </div>
  );
}
