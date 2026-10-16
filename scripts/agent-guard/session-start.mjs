// Cursor sessionStart hook: make sure git uses the secret check in .githooks/.
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.env.CURSOR_PROJECT_DIR ?? process.cwd();

spawnSync(
  process.execPath,
  [path.join(root, "scripts/install-git-hooks.mjs")],
  {
    cwd: root,
    stdio: "ignore",
  },
);

process.stdout.write("{}");
