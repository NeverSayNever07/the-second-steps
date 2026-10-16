import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSandboxAuthEmails,
  getSandboxPersona,
  getSandboxQuickSignInOptions,
  isSandboxEnvironment,
  isSandboxQuickSignInEnabled,
  normaliseEmail,
} from "./config";

const originalEmails = process.env.SANDBOX_AUTH_EMAILS;
const originalQuickSignIn = process.env.SANDBOX_QUICK_SIGN_IN;

afterEach(() => {
  if (originalEmails === undefined) delete process.env.SANDBOX_AUTH_EMAILS;
  else process.env.SANDBOX_AUTH_EMAILS = originalEmails;
  if (originalQuickSignIn === undefined)
    delete process.env.SANDBOX_QUICK_SIGN_IN;
  else process.env.SANDBOX_QUICK_SIGN_IN = originalQuickSignIn;
  vi.unstubAllEnvs();
});

describe("sandbox auth configuration", () => {
  it("normalises valid email addresses", () => {
    expect(normaliseEmail("  Owner@Zayto.Local ")).toBe("owner@zayto.local");
  });

  it("rejects malformed email addresses", () => {
    expect(normaliseEmail("not-an-email")).toBeNull();
    expect(normaliseEmail(null)).toBeNull();
  });

  it("reads a case-insensitive comma-separated allow-list", () => {
    process.env.SANDBOX_AUTH_EMAILS = "One@Example.com, two@example.com";

    expect(getSandboxAuthEmails()).toEqual(
      new Set(["one@example.com", "two@example.com"]),
    );
  });

  it("maps approved local identities to sandbox personas", () => {
    expect(getSandboxPersona("OWNER@ZAYTO.LOCAL")).toBe("account_owner");
    expect(getSandboxPersona("branch.manager@zayto.local")).toBe(
      "branch_manager",
    );
    expect(getSandboxPersona("platform.owner@zayto.local")).toBe(
      "platform_owner",
    );
    expect(getSandboxPersona("dual.owner@zayto.local")).toBe("dual_owner");
    expect(getSandboxPersona("no.access@zayto.local")).toBe("no_access");
    expect(getSandboxPersona("unknown@zayto.local")).toBeNull();
  });

  it("offers approved fictional personas for development quick sign-in", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.SANDBOX_AUTH_EMAILS =
      "owner@zayto.local,branch.manager@zayto.local";
    process.env.SANDBOX_QUICK_SIGN_IN = "true";

    expect(isSandboxQuickSignInEnabled()).toBe(true);
    expect(getSandboxQuickSignInOptions()).toEqual([
      expect.objectContaining({
        email: "owner@zayto.local",
        accessLabel: "Account Owner · all branches",
      }),
      expect.objectContaining({
        email: "branch.manager@zayto.local",
        accessLabel: "Branch Manager · Main Branch",
      }),
    ]);
  });

  it("keeps quick sign-in off unless it is switched on explicitly", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.SANDBOX_QUICK_SIGN_IN;

    expect(isSandboxQuickSignInEnabled()).toBe(false);
    expect(getSandboxQuickSignInOptions()).toEqual([]);
  });

  it("allows quick sign-in to be disabled and always blocks it in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.SANDBOX_QUICK_SIGN_IN = "false";
    expect(isSandboxQuickSignInEnabled()).toBe(false);
    expect(getSandboxQuickSignInOptions()).toEqual([]);

    vi.stubEnv("NODE_ENV", "production");
    process.env.SANDBOX_QUICK_SIGN_IN = "true";
    expect(isSandboxQuickSignInEnabled()).toBe(false);
    expect(getSandboxQuickSignInOptions()).toEqual([]);
  });

  it("allows quick sign-in in a production build only when APP_ENV is demo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SANDBOX_QUICK_SIGN_IN", "true");

    vi.stubEnv("APP_ENV", "demo");
    expect(isSandboxQuickSignInEnabled()).toBe(true);

    vi.stubEnv("APP_ENV", "production");
    expect(isSandboxQuickSignInEnabled()).toBe(false);
  });

  it("keeps sandbox features off in a production build that does not say where it runs", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("SANDBOX_QUICK_SIGN_IN", "true");

    expect(isSandboxEnvironment()).toBe(false);
    expect(getSandboxPersona("owner@zayto.local")).toBeNull();
    expect(getSandboxQuickSignInOptions()).toEqual([]);
  });

  it("treats an unrecognised APP_ENV as not a sandbox", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_ENV", "staging");

    expect(isSandboxEnvironment()).toBe(false);
  });
});
