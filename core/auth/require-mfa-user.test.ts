import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  user: null as { id: string } | null,
  assuranceLevel: "aal1" as "aal1" | "aal2",
}));
const flag = vi.hoisted(() => ({ evaluate: vi.fn() }));

vi.mock("./supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: supabase.user }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: supabase.assuranceLevel },
          error: null,
        }),
      },
    },
  }),
}));

vi.mock("@/core/feature-flags/application/evaluate-feature-flag", () => ({
  evaluateFeatureFlagForIdentity: flag.evaluate,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const { requireMfaUserWith } = await import("./mfa");

const PATH = "/dashboard/w/oakfield";

beforeEach(() => {
  supabase.user = { id: "11111111-1111-4111-8111-111111111111" };
  supabase.assuranceLevel = "aal1";
  flag.evaluate.mockReset();
});

describe("requireMfaUserWith", () => {
  it("starts the page's reads before the second-step check has finished", async () => {
    let finishCheck: (value: { enabled: boolean }) => void = () => {};
    flag.evaluate.mockReturnValue(
      new Promise((resolve) => {
        finishCheck = resolve;
      }),
    );
    const read = vi.fn(async () => "page data");

    const result = requireMfaUserWith(PATH, {}, read);
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    finishCheck({ enabled: false });

    await expect(result).resolves.toMatchObject({ data: "page data" });
  });

  it("sends a session without its second step to /mfa even when a read fails", async () => {
    flag.evaluate.mockResolvedValue({ enabled: true });

    const result = requireMfaUserWith(PATH, {}, async () => {
      throw new Error("not found");
    });

    await expect(result).rejects.toThrow(/^redirect:\/mfa\?next=/);
  });

  it("returns the data once the second step is verified", async () => {
    flag.evaluate.mockResolvedValue({ enabled: true });
    supabase.assuranceLevel = "aal2";

    const result = await requireMfaUserWith(PATH, {}, async () => [1, 2]);

    expect(result.data).toEqual([1, 2]);
  });

  it("sends signed-out visitors to login without reading anything", async () => {
    supabase.user = null;
    const read = vi.fn();

    await expect(requireMfaUserWith(PATH, {}, read)).rejects.toThrow(
      "redirect:/login",
    );
    expect(read).not.toHaveBeenCalled();
  });
});
