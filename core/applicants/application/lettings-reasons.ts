import "server-only";

import { LettingsOutcomeKind } from "@/core/db/generated/enums";
import { hasPermission } from "@/core/access/domain/role";
import { validateListName } from "@/core/enquiries/domain/enquiry";
import { isUuid } from "@/core/properties/domain/ids";
import {
  applicantAudit,
  deny,
  upper,
  withApplicantActor,
  type ApplicantActorInput,
} from "./applicant-shared";

// The agency's reasons for closing applicants and enquiries, managed in
// Settings with the same permission as the landlord-lead lists. A reason can
// be renamed or hidden but never deleted: records keep the reason they used.

const KINDS = ["applicant", "property_enquiry"] as const;
type ManagedKind = (typeof KINDS)[number];

export function addLettingsReason(
  input: ApplicantActorInput & { kind: ManagedKind; name: string },
) {
  const action = "applicant.settings.add";
  return withApplicantActor<{ ok: true; reasonId: string }>(
    input,
    async (transaction, actor) => {
      if (!hasPermission(actor.roles, "enquiry.settings.manage")) {
        return deny(transaction, actor, action, {
          ok: false,
          error: "access_denied",
        });
      }
      const name = validateListName(input.name);
      if (!KINDS.includes(input.kind) || !name.ok) {
        return deny(transaction, actor, action, {
          ok: false,
          error: "invalid_input",
          fieldErrors: name.ok ? undefined : { name: name.error },
        });
      }
      const appliesTo = upper<LettingsOutcomeKind>(input.kind);
      const existing = await transaction.lettingsOutcomeReason.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          appliesTo,
          name: { equals: name.name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        return deny(transaction, actor, action, {
          ok: false,
          error: "invalid_input",
          fieldErrors: { name: "That reason is already in the list." },
        });
      }
      const last = await transaction.lettingsOutcomeReason.aggregate({
        where: { workspaceId: actor.workspaceId, appliesTo },
        _max: { sortOrder: true },
      });
      const reason = await transaction.lettingsOutcomeReason.create({
        data: {
          workspaceId: actor.workspaceId,
          name: name.name,
          appliesTo,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        select: { id: true },
      });
      await applicantAudit(transaction, actor, {
        action,
        outcome: "SUCCEEDED",
        targetType: "lettings_reason",
        targetId: reason.id,
        metadata: { kind: input.kind },
      });
      return { ok: true, reasonId: reason.id };
    },
  );
}

export function updateLettingsReason(
  input: ApplicantActorInput & {
    reasonId: string;
    name: string;
    hidden: boolean;
    sortOrder: number;
  },
) {
  const action = "applicant.settings.update";
  return withApplicantActor<{ ok: true }>(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.settings.manage")) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "access_denied",
      });
    }
    const name = validateListName(input.name);
    if (
      !isUuid(input.reasonId) ||
      !name.ok ||
      !Number.isInteger(input.sortOrder) ||
      input.sortOrder < 0 ||
      input.sortOrder > 10_000
    ) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "invalid_input",
        fieldErrors: name.ok ? undefined : { name: name.error },
      });
    }
    const current = await transaction.lettingsOutcomeReason.findFirst({
      where: { id: input.reasonId, workspaceId: actor.workspaceId },
      select: { id: true, appliesTo: true },
    });
    if (!current) return { ok: false, error: "list_item_not_found" };
    const clash = await transaction.lettingsOutcomeReason.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        appliesTo: current.appliesTo,
        name: { equals: name.name, mode: "insensitive" },
        id: { not: current.id },
      },
      select: { id: true },
    });
    if (clash) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "invalid_input",
        fieldErrors: { name: "That reason is already in the list." },
      });
    }
    await transaction.lettingsOutcomeReason.update({
      where: { id: current.id },
      data: {
        name: name.name,
        status: input.hidden ? "HIDDEN" : "ACTIVE",
        sortOrder: input.sortOrder,
      },
    });
    await applicantAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetType: "lettings_reason",
      targetId: current.id,
    });
    return { ok: true };
  });
}
