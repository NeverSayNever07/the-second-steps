import "server-only";

import type { Prisma } from "@/core/db/generated/client";
import { ApplicantStatus } from "@/core/db/generated/enums";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import { staffName } from "@/core/enquiries/application/enquiry-shared";
import { isUuid } from "@/core/properties/domain/ids";
import {
  isApplicantStatus,
  type ApplicantStatusCode,
} from "../domain/applicant";
import type { Requirements } from "../domain/requirements";
import {
  CONTACT_SUMMARY_SELECT,
  requirementsFromRow,
  summariseContact,
  type ContactSummary,
} from "./applicants";
import {
  ENQUIRY_SUMMARY_SELECT,
  summariseEnquiry,
  type EnquirySummary,
} from "./property-enquiries";
import {
  lower,
  upper,
  withApplicantActor,
  type ApplicantActorInput,
} from "./applicant-shared";

const STAFF_SELECT = {
  id: true,
  userIdentity: {
    select: { firstName: true, lastName: true, primaryEmail: true },
  },
} satisfies Prisma.MembershipSelect;

const staff = (
  membership: Prisma.MembershipGetPayload<{
    select: typeof STAFF_SELECT;
  }> | null,
) =>
  membership
    ? {
        membershipId: membership.id,
        name: staffName(membership.userIdentity),
      }
    : null;

// --- One applicant ---

export type ApplicantRequirementsView = {
  versionNo: number;
  createdAt: Date;
  createdBy: string;
  requirements: Requirements;
};

export type ApplicantView = {
  id: string;
  reference: string;
  status: ApplicantStatusCode;
  statusChangedAt: Date;
  createdAt: Date;
  closure: { reason: string | null; note: string | null } | null;
  branch: { id: string; name: string };
  owner: { membershipId: string; name: string } | null;
  source: { id: string; name: string } | null;
  lead: ContactSummary;
  /** Other adults: name and contact details only. */
  members: { memberId: string; addedAt: Date; contact: ContactSummary }[];
  /** The newest version, or null when none has been saved. */
  requirements: ApplicantRequirementsView | null;
  /** Every version, newest first (the current one included). */
  requirementHistory: ApplicantRequirementsView[];
  enquiries: EnquirySummary[];
  nextAction: { id: string; title: string; dueOn: Date } | null;
  statusHistory: {
    id: string;
    from: ApplicantStatusCode;
    to: ApplicantStatusCode;
    note: string | null;
    by: string;
    at: Date;
  }[];
  can: { manage: boolean; reopen: boolean };
};

export type GetApplicantResult =
  | { ok: true; applicant: ApplicantView }
  | { ok: false; error: "access_denied" | "applicant_not_found" };

export async function getApplicant(
  input: ApplicantActorInput & { applicantId: string },
): Promise<GetApplicantResult> {
  if (!isUuid(input.applicantId)) {
    return { ok: false, error: "applicant_not_found" };
  }
  const result = await withApplicantActor<{
    ok: true;
    applicant: ApplicantView;
  }>(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "applicant.read")) {
      return { ok: false, error: "access_denied" };
    }
    const row = await transaction.applicant.findFirst({
      where: { id: input.applicantId, workspaceId: actor.workspaceId },
      include: {
        leadContact: { select: CONTACT_SUMMARY_SELECT },
        responsibleBranch: { select: { id: true, name: true } },
        leadMembership: { select: STAFF_SELECT },
        leadSource: { select: { id: true, name: true } },
        closureReason: { select: { name: true } },
        members: {
          where: { endedAt: null },
          orderBy: [{ addedAt: "asc" }, { id: "asc" }],
          include: { contact: { select: CONTACT_SUMMARY_SELECT } },
        },
        requirementVersions: {
          orderBy: { versionNo: "desc" },
          include: { createdByMembership: { select: STAFF_SELECT } },
        },
        statusHistory: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: { actorMembership: { select: STAFF_SELECT } },
        },
        actions: {
          where: { status: "OPEN" },
          orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }],
          take: 1,
          select: { id: true, title: true, dueOn: true },
        },
      },
    });
    if (!row) return { ok: false, error: "applicant_not_found" };

    const enquiries = await transaction.propertyEnquiry.findMany({
      where: { workspaceId: actor.workspaceId, applicantId: row.id },
      select: ENQUIRY_SUMMARY_SELECT,
      orderBy: [{ stageChangedAt: "desc" }, { id: "asc" }],
    });

    const history = row.requirementVersions.map(
      (version): ApplicantRequirementsView => ({
        versionNo: version.versionNo,
        createdAt: version.createdAt,
        createdBy: staffName(version.createdByMembership.userIdentity),
        requirements: requirementsFromRow(version),
      }),
    );
    const status = lower<ApplicantStatusCode>(row.status);
    const worksHere =
      hasPermission(actor.roles, "applicant.manage") &&
      hasBranchAccess(actor.scope, row.responsibleBranchId);
    return {
      ok: true,
      applicant: {
        id: row.id,
        reference: row.reference,
        status,
        statusChangedAt: row.statusChangedAt,
        createdAt: row.createdAt,
        closure:
          status === "closed"
            ? { reason: row.closureReason?.name ?? null, note: row.closureNote }
            : null,
        branch: row.responsibleBranch,
        owner: staff(row.leadMembership),
        source: row.leadSource,
        lead: summariseContact(row.leadContact),
        members: row.members.map((member) => ({
          memberId: member.id,
          addedAt: member.addedAt,
          contact: summariseContact(member.contact),
        })),
        requirements: history[0] ?? null,
        requirementHistory: history,
        enquiries: enquiries.map(summariseEnquiry),
        nextAction: row.actions[0] ?? null,
        statusHistory: row.statusHistory.map((item) => ({
          id: item.id,
          from: lower<ApplicantStatusCode>(item.fromStatus),
          to: lower<ApplicantStatusCode>(item.toStatus),
          note: item.note,
          by: staffName(item.actorMembership.userIdentity),
          at: item.createdAt,
        })),
        can: {
          manage: worksHere,
          reopen: worksHere && hasPermission(actor.roles, "applicant.reopen"),
        },
      },
    };
  });
  return result.ok
    ? result
    : {
        ok: false,
        error:
          result.error === "access_denied"
            ? "access_denied"
            : "applicant_not_found",
      };
}

// --- The list ---

export type ApplicantListItem = {
  id: string;
  reference: string;
  name: string;
  status: ApplicantStatusCode;
  statusChangedAt: Date;
  createdAt: Date;
  branch: { id: string; name: string };
  owner: { membershipId: string; name: string } | null;
  source: string | null;
  openEnquiries: number;
  hasRequirements: boolean;
  nextAction: { id: string; title: string; dueOn: Date } | null;
};

export type ApplicantListInput = ApplicantActorInput & {
  /** "open" (active and on hold; the default), "all", or one status. */
  status?: "open" | "all" | ApplicantStatusCode;
  branchId?: string;
  ownerMembershipId?: string;
  /** A name or reference to look for. */
  query?: string;
  /** Only applicants with no open next action. */
  noNextAction?: boolean;
  take?: number;
  skip?: number;
};

const MAX_TAKE = 100;

export async function listApplicants(
  input: ApplicantListInput,
): Promise<{ items: ApplicantListItem[]; total: number } | null> {
  const status = input.status ?? "open";
  if (status !== "open" && status !== "all" && !isApplicantStatus(status)) {
    return { items: [], total: 0 };
  }
  const result = await withApplicantActor<{
    ok: true;
    items: ApplicantListItem[];
    total: number;
  }>(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "applicant.read")) {
      return { ok: false, error: "access_denied" };
    }
    const text = input.query?.trim().slice(0, 80);
    const where: Prisma.ApplicantWhereInput = {
      workspaceId: actor.workspaceId,
      ...(status === "all"
        ? {}
        : status === "open"
          ? { status: { not: ApplicantStatus.CLOSED } }
          : { status: upper<ApplicantStatus>(status) }),
      ...(isUuid(input.branchId)
        ? { responsibleBranchId: input.branchId }
        : {}),
      ...(isUuid(input.ownerMembershipId)
        ? { leadMembershipId: input.ownerMembershipId }
        : {}),
      ...(input.noNextAction ? { actions: { none: { status: "OPEN" } } } : {}),
      ...(text
        ? {
            OR: [
              { reference: { contains: text.toUpperCase() } },
              {
                leadContact: {
                  OR: [
                    { firstName: { contains: text, mode: "insensitive" } },
                    { lastName: { contains: text, mode: "insensitive" } },
                    { legalName: { contains: text, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      transaction.applicant.findMany({
        where,
        select: {
          id: true,
          reference: true,
          status: true,
          statusChangedAt: true,
          createdAt: true,
          responsibleBranch: { select: { id: true, name: true } },
          leadMembership: { select: STAFF_SELECT },
          leadSource: { select: { name: true } },
          leadContact: { select: CONTACT_SUMMARY_SELECT },
          actions: {
            where: { status: "OPEN" },
            orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }],
            take: 1,
            select: { id: true, title: true, dueOn: true },
          },
          _count: {
            select: {
              requirementVersions: true,
              propertyEnquiries: { where: { stage: { not: "CLOSED" } } },
            },
          },
        },
        orderBy: [{ statusChangedAt: "desc" }, { id: "asc" }],
        take: Math.min(Math.max(input.take ?? 50, 1), MAX_TAKE),
        skip: Math.max(input.skip ?? 0, 0),
      }),
      transaction.applicant.count({ where }),
    ]);
    return {
      ok: true,
      items: rows.map((row): ApplicantListItem => ({
        id: row.id,
        reference: row.reference,
        name: summariseContact(row.leadContact).name,
        status: lower<ApplicantStatusCode>(row.status),
        statusChangedAt: row.statusChangedAt,
        createdAt: row.createdAt,
        branch: row.responsibleBranch,
        owner: staff(row.leadMembership),
        source: row.leadSource?.name ?? null,
        openEnquiries: row._count.propertyEnquiries,
        hasRequirements: row._count.requirementVersions > 0,
        nextAction: row.actions[0] ?? null,
      })),
      total,
    };
  });
  return result.ok ? { items: result.items, total: result.total } : null;
}
