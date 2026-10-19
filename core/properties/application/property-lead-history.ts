import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import { EnquiryStage } from "@/core/db/generated/enums";
import type { EnquiryStageCode } from "@/core/enquiries/domain/enquiry";
import { isUuid } from "@/core/properties/domain/ids";

export const PROPERTY_LEAD_HISTORY_PAGE_SIZE = 5;

const LEAD_STAGE_CODE = {
  [EnquiryStage.NEW_ENQUIRY]: "new_enquiry",
  [EnquiryStage.APPRAISAL_BOOKED]: "appraisal_booked",
  [EnquiryStage.APPRAISAL_COMPLETED]: "appraisal_completed",
  [EnquiryStage.WON]: "won",
  [EnquiryStage.LOST]: "lost",
  [EnquiryStage.POSTPONED]: "postponed",
} satisfies Record<EnquiryStage, EnquiryStageCode>;

export type PropertyLeadHistoryItem = {
  id: string;
  reference: string;
  stage: EnquiryStageCode;
  enquirerName: string;
  branch: string;
};

export type PropertyLeadHistory = {
  items: PropertyLeadHistoryItem[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/**
 * Paged landlord-lead history for one property. Returns null when the viewer
 * cannot read landlord leads; branch visibility is enforced by database row
 * security, so inaccessible leads are never counted or listed.
 */
export async function getPropertyLeadHistory(input: {
  authSubject: string;
  workspaceSlug: string;
  propertyId: string;
  page?: number;
}): Promise<PropertyLeadHistory | null> {
  if (!isUuid(input.propertyId)) {
    return null;
  }
  const page = Math.min(Math.max(Math.trunc(input.page ?? 1), 1), 10_000);
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (
        !actor ||
        !hasPermission(actor.roles, "property.read") ||
        !hasPermission(actor.roles, "enquiry.read")
      ) {
        return null;
      }
      const rows = await transaction.enquiry.findMany({
        where: { workspaceId: actor.workspaceId, propertyId: input.propertyId },
        select: {
          id: true,
          reference: true,
          stage: true,
          enquirerName: true,
          responsibleBranch: { select: { name: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PROPERTY_LEAD_HISTORY_PAGE_SIZE,
        take: PROPERTY_LEAD_HISTORY_PAGE_SIZE + 1,
      });
      return {
        items: rows.slice(0, PROPERTY_LEAD_HISTORY_PAGE_SIZE).map((lead) => ({
          id: lead.id,
          reference: lead.reference,
          stage: LEAD_STAGE_CODE[lead.stage],
          enquirerName: lead.enquirerName,
          branch: lead.responsibleBranch.name,
        })),
        page,
        hasPrevious: page > 1,
        hasNext: rows.length > PROPERTY_LEAD_HISTORY_PAGE_SIZE,
      };
    },
  );
}
