import "server-only";

import {
  ApplicantStatus,
  PropertyEnquiryStage,
} from "@/core/db/generated/enums";
import { hasPermission } from "@/core/access/domain/role";
import {
  withApplicantActor,
  type ApplicantActorInput,
} from "./applicant-shared";

export type ApplicantAttention = {
  activeApplicants: number;
  openEnquiries: number;
  /** Active applicants with no open next action. */
  noNextAction: number;
  /** Enquiries closed because their home was withdrawn: the applicant is still to be told. */
  toBeTold: number;
};

/**
 * Figures for the dashboard's Marketing & applicants tab. Returns null when
 * the viewer may not read applicants. Counts only include what the viewer's
 * branch access lets them see.
 */
export async function getApplicantAttention(
  input: ApplicantActorInput,
): Promise<ApplicantAttention | null> {
  const result = await withApplicantActor<{
    ok: true;
    attention: ApplicantAttention;
  }>(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "applicant.read")) {
      return { ok: false, error: "access_denied" };
    }
    const workspaceId = actor.workspaceId;
    const [activeApplicants, openEnquiries, noNextAction, toBeTold] =
      await Promise.all([
        transaction.applicant.count({
          where: { workspaceId, status: ApplicantStatus.ACTIVE },
        }),
        transaction.propertyEnquiry.count({
          where: { workspaceId, stage: { not: PropertyEnquiryStage.CLOSED } },
        }),
        transaction.applicant.count({
          where: {
            workspaceId,
            status: ApplicantStatus.ACTIVE,
            actions: { none: { status: "OPEN" } },
          },
        }),
        transaction.propertyEnquiry.count({
          where: {
            workspaceId,
            closedByListing: true,
            // Recently closed ones only: older ones were dealt with.
            stageChangedAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
          },
        }),
      ]);
    return {
      ok: true,
      attention: { activeApplicants, openEnquiries, noNextAction, toBeTold },
    };
  });
  return result.ok ? result.attention : null;
}
