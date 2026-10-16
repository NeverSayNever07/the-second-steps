// Points git at .githooks/. Cursor runs this at the start of every agent
// session (scripts/agent-guard/session-start.mjs), since install scripts are off.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const HOOKS_PATH = ".githooks";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

// Docker builds and package tarballs have no git checkout.
if (existsSync(".git")) {
  let current = "";
  try {
    current = git("config", "--get", "core.hooksPath");
  } catch {
    // Not set yet.
  }

  if (current === "" || current === HOOKS_PATH) {
    git("config", "core.hooksPath", HOOKS_PATH);
  } else {
    console.warn(
      `git core.hooksPath is ${current}; the secret check in ${HOOKS_PATH}/ is not active.`,
    );
  }
}
