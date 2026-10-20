import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const composeFile = "compose.test.yaml";
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const vitestCli = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
const urls = {
  admin:
    "postgresql://zayto_test_admin:zayto_test_admin_only@127.0.0.1:55432/zayto_test",
  migration:
    "postgresql://zayto_migrator:zayto_migrator_test_only@127.0.0.1:55432/zayto_test",
  runtime:
    "postgresql://zayto_app:zayto_app_test_only@127.0.0.1:55432/zayto_test",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

const testEnvironment = {
  ...process.env,
  DATABASE_SSL_MODE: "disable",
  DATABASE_URL: urls.runtime,
  MIGRATION_DATABASE_URL: urls.migration,
  TEST_ADMIN_DATABASE_URL: urls.admin,
};

try {
  run(docker, ["compose", "-f", composeFile, "up", "-d", "--wait"]);
  run(process.execPath, [prismaCli, "migrate", "deploy"], {
    env: testEnvironment,
  });
  // The schema file must describe exactly what the migrations build, or the
  // next generated migration would carry hidden renames or drop constraints.
  run(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    { env: testEnvironment },
  );
  // Extra arguments (for example one test file) are passed to Vitest, so
  // `npm run test:integration -- tests/integration/x.test.ts` runs only that.
  run(
    process.execPath,
    [
      vitestCli,
      "run",
      "--config",
      "vitest.integration.config.mts",
      ...process.argv.slice(2),
    ],
    {
      env: testEnvironment,
    },
  );
} finally {
  spawnSync(docker, ["compose", "-f", composeFile, "down", "--volumes"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
