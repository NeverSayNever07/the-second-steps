import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieOptions } from "./session-cookies";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BROWSER_CODE_FOLDERS = ["app", "components", "core", "lib"];

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const entryPath = path.join(folder, entry);
    if (statSync(entryPath).isDirectory()) {
      return entry === "generated" ? [] : sourceFiles(entryPath);
    }
    return /\.tsx?$/.test(entry) ? [entryPath] : [];
  });
}

function isClientComponent(source: string) {
  return /^\s*["']use client["']/.test(source);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session cookies", () => {
  it("are never readable by page scripts", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().httpOnly).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().httpOnly).toBe(true);
  });

  it("are only sent over HTTPS in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("stay HttpOnly because no browser code talks to Supabase directly", () => {
    const browserFilesUsingSupabase = BROWSER_CODE_FOLDERS.flatMap((folder) =>
      sourceFiles(path.join(ROOT, folder)),
    )
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return isClientComponent(source) && source.includes("@supabase/");
      })
      .map((file) => path.relative(ROOT, file));

    expect(browserFilesUsingSupabase).toEqual([]);
  });
});
