import "server-only";

import {
  setWorkspaceDatabaseContext,
  type AccessTransaction,
  type VerifiedIdentityContext,
} from "@/core/access/data/database-context";
import type { FeatureFlagKey } from "../domain/feature-flag";

export async function loadFeatureFlagEvaluationInput(
  transaction: AccessTransaction,
  identity: VerifiedIdentityContext,
  key: FeatureFlagKey,
  workspaceSlug?: string,
) {
  // Fails closed: a non-string would reach Prisma as a filter, not a name.
  if (workspaceSlug !== undefined && typeof workspaceSlug !== "string") {
    throw new Error("The workspace must be named by its slug.");
  }
  const definition = await transaction.featureFlag.findUnique({
    where: { key },
    select: {
      id: true,
      globalEnabled: true,
      zaytoUsersEnabled: true,
      status: true,
    },
  });

  const membership = await transaction.membership.findFirst({
    where: {
      userIdentityId: identity.userIdentityId,
      status: "ACTIVE",
      workspace: {
        status: "ACTIVE",
        ...(workspaceSlug ? { slug: workspaceSlug } : {}),
      },
    },
    select: { workspaceId: true },
  });
  const isStaff = identity.isPlatformOwner || Boolean(membership);
  if (!definition || !workspaceSlug || !membership) {
    return { definition, isStaff, workspaceOverride: null };
  }

  await setWorkspaceDatabaseContext(transaction, membership.workspaceId);
  const override = await transaction.workspaceFeatureFlagOverride.findUnique({
    where: {
      workspaceId_featureFlagId: {
        workspaceId: membership.workspaceId,
        featureFlagId: definition.id,
      },
    },
    select: { enabled: true },
  });

  return {
    definition,
    isStaff,
    workspaceOverride: override?.enabled ?? null,
  };
}
