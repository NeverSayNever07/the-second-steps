// The installed Next.js still names this helper after middleware; its docs
// already call it unstable_doesProxyMatch.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";
import { config } from "./proxy";

const runsFor = (url: string) =>
  unstable_doesMiddlewareMatch({ config, nextConfig, url });

describe("proxy matcher", () => {
  it("runs for pages and actions", () => {
    expect(runsFor("/dashboard")).toBe(true);
    expect(runsFor("/dashboard/w/agency/properties")).toBe(true);
    expect(runsFor("/login")).toBe(true);
  });

  // The proxy would cut an upload body off at 10 MB and add the page's
  // security policy to a download.
  it("skips the document upload and download routes", () => {
    expect(runsFor("/dashboard/w/agency/documents/upload")).toBe(false);
    expect(
      runsFor(
        "/dashboard/w/agency/documents/0b7c3a52-7f5e-4d8e-9b1a-1f2e3d4c5b6a",
      ),
    ).toBe(false);
  });

  it("still runs for pages whose names only start like documents", () => {
    expect(runsFor("/dashboard/w/agency/documents-archive")).toBe(true);
  });
});
