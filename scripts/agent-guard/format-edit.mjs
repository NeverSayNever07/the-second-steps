// Cursor afterFileEdit hook: every file the agent edits is formatted at once,
// so formatting never fails CI. Prettier skips ignored and unknown files.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CURSOR_PROJECT_DIR ?? process.cwd();
const { file_path: filePath = "" } = JSON.parse(readFileSync(0, "utf8"));
const relativePath = path.relative(root, filePath);
const isInsideProject =
  relativePath !== "" &&
  !relativePath.startsWith("..") &&
  !path.isAbsolute(relativePath);

if (isInsideProject) {
  spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/prettier/bin/prettier.cjs"),
      "--write",
      "--ignore-unknown",
      "--log-level=silent",
      relativePath,
    ],
    { cwd: root, stdio: "ignore" },
  );
}

process.stdout.write("{}");
