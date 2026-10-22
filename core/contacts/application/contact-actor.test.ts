import { describe, expect, it, vi } from "vitest";
import type { AccessTransaction } from "@/core/access/data/database-context";
import { loadFeatureFlagEvaluationInput } from "@/core/feature-flags/data/feature-flag-repository";
import { resolveContactActor } from "./contact-actor";

vi.mock("@/core/access/data/database-context", () => ({
  setWorkspaceDatabaseContext: vi.fn(),
  setWorkspaceMemberDatabaseContext: vi.fn(),
}));

// A Server Action's arguments are untrusted: an object in place of the
// workspace slug must never reach a query, where Prisma would read it as a
// filter.
const FILTER = { in: ["first-workspace", "second-workspace"] };

function fakeTransaction() {
  const findFirst = vi.fn();
  const transaction = {
    membership: { findFirst },
    featureFlag: { findUnique: vi.fn() },
  } as unknown as AccessTransaction;
  return { transaction, findFirst };
}

describe("workspace slug from untrusted input", () => {
  it("resolves no actor and runs no query for a non-string slug", async () => {
    const { transaction, findFirst } = fakeTransaction();
    expect(
      await resolveContactActor(transaction, {
        userIdentityId: "identity",
        workspaceSlug: FILTER as unknown as string,
      }),
    ).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refuses a non-string slug in the second-step flag lookup", async () => {
    const { transaction, findFirst } = fakeTransaction();
    await expect(
      loadFeatureFlagEvaluationInput(
        transaction,
        { userIdentityId: "identity", isPlatformOwner: false } as never,
        "staff_mfa" as never,
        FILTER as unknown as string,
      ),
    ).rejects.toThrow();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
