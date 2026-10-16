import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";

/** The signed-in person's own first name, for the dashboard greeting. */
export async function getViewerFirstName(
  input: EnquiryActorInput,
): Promise<string | null> {
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) return null;
      const membership = await transaction.membership.findFirst({
        where: { id: actor.membershipId, workspaceId: actor.workspaceId },
        select: { userIdentity: { select: { firstName: true } } },
      });
      return membership?.userIdentity?.firstName?.trim() || null;
    },
  );
}
