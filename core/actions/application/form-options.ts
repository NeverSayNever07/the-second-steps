import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { DATABASE_ROLE_TO_SYSTEM_ROLE } from "@/core/access/data/role-mapping";
import {
  hasPermission,
  validateRoleCombination,
} from "@/core/access/domain/role";
import {
  hasBranchAccess,
  validateMembershipScope,
} from "@/core/access/domain/scope";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import { EnquiryStage } from "@/core/db/generated/enums";
import {
  staffName,
  type EnquiryActorInput,
} from "@/core/enquiries/application/enquiry-shared";

export type ActionFormOptions = {
  currentMembershipId: string;
  /** Active branches the signed-in user works in. */
  branches: { id: string; name: string }[];
  /**
   * Colleagues who can be given work. `branchIds` is null for workspace-wide
   * staff; `canWorkLeads` says whether they can also take landlord-lead actions.
   */
  assignees: {
    membershipId: string;
    name: string;
    branchIds: string[] | null;
    canWorkLeads: boolean;
  }[];
  /** Open landlord leads an action can be linked to (most recent first). */
  leads: {
    id: string;
    reference: string;
    name: string;
    branchId: string;
  }[];
};

const LEAD_LIMIT = 100;

/** What the Add action pop-up needs. Null when the user may not add actions. */
export async function getActionFormOptions(
  input: EnquiryActorInput,
): Promise<ActionFormOptions | null> {
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "action.manage")) return null;

      const [branches, memberships, leads] = await Promise.all([
        transaction.branch.findMany({
          where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        transaction.membership.findMany({
          where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
          select: {
            id: true,
            scopeMode: true,
            roles: { select: { roleCode: true } },
            branchAccess: { select: { branchId: true } },
            userIdentity: {
              select: { firstName: true, lastName: true, primaryEmail: true },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
        hasPermission(actor.roles, "enquiry.update")
          ? transaction.enquiry.findMany({
              where: {
                workspaceId: actor.workspaceId,
                stage: {
                  in: [
                    EnquiryStage.NEW_ENQUIRY,
                    EnquiryStage.APPRAISAL_BOOKED,
                    EnquiryStage.APPRAISAL_COMPLETED,
                  ],
                },
              },
              select: {
                id: true,
                reference: true,
                enquirerName: true,
                responsibleBranchId: true,
              },
              orderBy: { createdAt: "desc" },
              take: LEAD_LIMIT,
            })
          : [],
      ]);

      const assignees = memberships.flatMap((membership) => {
        const roles = validateRoleCombination(
          membership.roles.map(
            ({ roleCode }) => DATABASE_ROLE_TO_SYSTEM_ROLE[roleCode],
          ),
        );
        const scope = validateMembershipScope(
          membership.scopeMode === "WORKSPACE"
            ? { kind: "workspace" }
            : {
                kind: "named_branches",
                branchIds: membership.branchAccess.map(
                  ({ branchId }) => branchId,
                ),
              },
        );
        if (
          !roles.ok ||
          !scope.ok ||
          !membership.userIdentity ||
          !hasPermission(roles.roles, "action.manage")
        ) {
          return [];
        }
        return [
          {
            membershipId: membership.id,
            name: staffName(membership.userIdentity),
            branchIds:
              scope.scope.kind === "workspace"
                ? null
                : [...scope.scope.branchIds],
            canWorkLeads: hasPermission(roles.roles, "enquiry.update"),
          },
        ];
      });

      return {
        currentMembershipId: actor.membershipId,
        branches: branches.filter(({ id }) => hasBranchAccess(actor.scope, id)),
        assignees,
        leads: leads.map((lead) => ({
          id: lead.id,
          reference: lead.reference,
          name: lead.enquirerName,
          branchId: lead.responsibleBranchId,
        })),
      };
    },
  );
}
