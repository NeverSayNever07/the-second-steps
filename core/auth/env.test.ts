import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppUrl, getSupabasePublicEnvironment } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase settings", () => {
  it("are read from the server-only names", () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(getSupabasePublicEnvironment()).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("tell the owner which setting to rename when only the old public name is set", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    expect(() => getSupabasePublicEnvironment()).toThrow(
      "Rename NEXT_PUBLIC_SUPABASE_URL to SUPABASE_URL",
    );
  });
});

describe("app address", () => {
  it("defaults to the local development address", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("does not silently fall back when only the old public name is set", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example");

    expect(() => getAppUrl()).toThrow("Rename NEXT_PUBLIC_APP_URL to APP_URL");
  });
});
