import type { NextConfig } from "next";

function assertReleaseEnvironment() {
  const requireStaffMfa = process.env.REQUIRE_STAFF_MFA;
  if (
    requireStaffMfa !== undefined &&
    requireStaffMfa !== "" &&
    requireStaffMfa !== "true" &&
    requireStaffMfa !== "false"
  ) {
    throw new Error('REQUIRE_STAFF_MFA must be either "true" or "false".');
  }

  if (process.env.VERCEL_ENV === "production" && requireStaffMfa !== "true") {
    throw new Error('Production builds require REQUIRE_STAFF_MFA="true".');
  }
}

assertReleaseEnvironment();

const securityHeaders: Array<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
  });
}

const nextConfig: NextConfig = {
  // A self-contained server (`node server.js`) with only the files it uses,
  // so the Docker image stays small enough for a Raspberry Pi.
  output: "standalone",
  // Images are served as they are. On-demand resizing needs sharp (about
  // 46 MB in the image) and CPU the Pi does not have to spare; turn this back
  // on, and drop the exclusion below, if pages start showing photos.
  images: { unoptimized: true },
  outputFileTracingExcludes: {
    "*": ["node_modules/sharp/**", "node_modules/@img/**"],
  },
  poweredByHeader: false,
  // Development only: keep the Next.js badge off the mobile menu button.
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
