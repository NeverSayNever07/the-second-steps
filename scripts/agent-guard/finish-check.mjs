// Cursor stop hook. When the agent finishes with uncommitted changes, run the
// fast checks on them. Failures go back to the agent as its next message, so
// it fixes them before telling the owner the work is done. Passing work sends
// nothing back: every follow-up is a full extra turn, and /ship already asks
// for a security review when risky files changed.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CURSOR_PROJECT_DIR ?? process.cwd();
const MAX_REPORTED_LINES = 60;
const CHECKABLE_FILE = /\.(?:ts|tsx|mjs|js)$/;

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout}${result.stderr}`,
  };
}

function git(...args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout ?? "";
}

function changedFiles() {
  const tracked = git("diff", "--name-only", "-z", "HEAD").split("\0");
  const untracked = git(
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ).split("\0");
  return [...new Set([...tracked, ...untracked])].filter(Boolean);
}

// Identifies this exact set of changes, so the same work is never checked or
// flagged twice.
function fingerprintOf(files) {
  const hash = createHash("sha256").update(git("diff", "HEAD"));
  for (const file of files.filter((name) =>
    existsSync(path.join(root, name)),
  )) {
    hash.update(file).update(readFileSync(path.join(root, file)));
  }
  return hash.digest("hex");
}

function stateFile() {
  const gitDir = git("rev-parse", "--absolute-git-dir").trim();
  return path.join(gitDir, "agent-guard-finish-check.json");
}

function lastCheckedFingerprint() {
  try {
    return JSON.parse(readFileSync(stateFile(), "utf8")).fingerprint;
  } catch {
    return null;
  }
}

function remember(fingerprint) {
  writeFileSync(stateFile(), JSON.stringify({ fingerprint }));
}

function tail(output) {
  return output.trim().split("\n").slice(-MAX_REPORTED_LINES).join("\n");
}

function failedChecks(files) {
  const checkable = files.filter(
    (file) => CHECKABLE_FILE.test(file) && existsSync(path.join(root, file)),
  );
  if (checkable.length === 0) return [];

  if (!existsSync(path.join(root, "core/db/generated"))) {
    run(["node_modules/prisma/build/index.js", "generate"]);
  }

  const checks = [
    {
      name: "Typecheck",
      args: ["node_modules/typescript/bin/tsc", "--noEmit"],
    },
    { name: "Lint", args: ["node_modules/eslint/bin/eslint.js", ...checkable] },
    {
      name: "Related unit tests",
      args: [
        "node_modules/vitest/vitest.mjs",
        "related",
        "--run",
        "--passWithNoTests",
        ...checkable,
      ],
    },
  ];

  return checks
    .map((check) => ({ ...check, ...run(check.args) }))
    .filter((check) => !check.ok);
}

function followupFor(status, files) {
  if (status !== "completed" || files.length === 0) return null;

  const fingerprint = fingerprintOf(files);
  if (fingerprint === lastCheckedFingerprint()) return null;

  const failures = failedChecks(files);
  if (failures.length > 0) {
    const report = failures.map(
      ({ name, output }) => `### ${name}\n${tail(output)}`,
    );
    return [
      "Automatic checks failed on the uncommitted changes. Fix the problems below, then finish again. Do not tell the owner the work is done while checks fail.",
      ...report,
    ].join("\n\n");
  }

  remember(fingerprint);
  return null;
}

const { status } = JSON.parse(readFileSync(0, "utf8"));
const followupMessage = followupFor(status, changedFiles());
const response = followupMessage ? { followup_message: followupMessage } : {};

process.stdout.write(JSON.stringify(response));
