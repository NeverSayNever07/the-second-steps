import "server-only";

import { hasPermission } from "@/core/access/domain/role";
import { isUuid } from "@/core/properties/domain/ids";
import { canCloseFrom } from "../domain/enquiry";
import { stageCode } from "./enquiries";
import {
  canAssignEnquiryWork,
  enquiryAudit,
  enquiryDeny,
  lockEnquiry,
  withEnquiryActor,
  type EnquiryActorInput,
} from "./enquiry-shared";

/**
 * Changes who looks after an open landlord lead. The new person must be
 * active, able to work leads, and able to see the lead's branch.
 */
export function assignEnquiryLead(
  input: EnquiryActorInput & { enquiryId: string; membershipId: string },
) {
  const action = "enquiry.assign";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.update")) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.enquiryId,
      );
    }
    if (!isUuid(input.enquiryId) || !isUuid(input.membershipId)) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        input.enquiryId,
      );
    }
    await lockEnquiry(transaction, actor, input.enquiryId);
    const enquiry = await transaction.enquiry.findFirst({
      where: { id: input.enquiryId, workspaceId: actor.workspaceId },
      select: {
        id: true,
        stage: true,
        responsibleBranchId: true,
        leadMembershipId: true,
      },
    });
    if (!enquiry) {
      return { ok: false as const, error: "enquiry_not_found" as const };
    }
    if (!canCloseFrom(stageCode(enquiry.stage))) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }
    if (
      input.membershipId === enquiry.leadMembershipId ||
      !(await canAssignEnquiryWork(
        transaction,
        actor,
        input.membershipId,
        enquiry.responsibleBranchId,
      ))
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        enquiry.id,
      );
    }
    await transaction.enquiry.update({
      where: { id: enquiry.id },
      data: { leadMembershipId: input.membershipId },
    });
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: enquiry.id,
      metadata: { leadMembershipId: input.membershipId },
    });
    return { ok: true as const, enquiryId: enquiry.id };
  });
}
