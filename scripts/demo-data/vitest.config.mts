import path from "node:path";
import nextEnv from "@next/env";
import { defineConfig } from "vitest/config";

// Runs the demo-data scripts through the app's own services (never raw SQL),
// against whichever database DATABASE_URL names. The services import
// "server-only", which the stub replaces outside Next.js.
const root = path.resolve(import.meta.dirname, "../..");
// Not in test mode: Next skips .env.local then, and that holds the database URL.
const mode = process.env.NODE_ENV;
delete process.env.NODE_ENV;
nextEnv.loadEnvConfig(root, true);
if (mode) process.env.NODE_ENV = mode;

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": root,
      "server-only": path.join(root, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["scripts/demo-data/*.demo.ts"],
    testTimeout: 600000,
    hookTimeout: 600000,
    fileParallelism: false,
  },
});
