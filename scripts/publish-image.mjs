// Builds the proof-of-concept image from the last commit and pushes it to
// GitHub's private registry, for the home lab's Raspberry Pi cluster.
//
// Only committed files go in: the build starts from `git archive HEAD`, so
// uncommitted work and files git does not track, such as `.env.docker`, never
// reach the image. Needs GHCR_TOKEN, a token with write:packages; supply it
// through 1Password, for example:
//
//   GHCR_TOKEN=op://<vault>/<item>/credential op run -- node scripts/publish-image.mjs
//
// Progress goes to stderr. The image's tag, the commit's short hash, is the
// only thing written to stdout.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REGISTRY = "ghcr.io";
const REPOSITORY = "ghcr.io/debens/zayto";
const REGISTRY_USER = "debens";
// The cluster's Raspberry Pis.
const PLATFORM = "linux/arm64";

const token = process.env.GHCR_TOKEN;
if (!token) {
  console.error(
    "GHCR_TOKEN is not set. Run this through `op run`; see the top of this file.",
  );
  process.exit(1);
}

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    stdio: ["ignore", process.stderr, process.stderr],
    ...options,
  });

const read = (command, args) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();

const tag = read("git", ["rev-parse", "--short=12", "HEAD"]);
const image = `${REPOSITORY}:${tag}`;

if (read("git", ["status", "--porcelain"]) !== "") {
  console.error(
    `Uncommitted changes are left out: building ${tag}, the last commit.`,
  );
}

const source = mkdtempSync(path.join(tmpdir(), "zayto-image-"));

try {
  const archive = path.join(source, "commit.tar");
  run("git", ["archive", "--output", archive, "HEAD"]);
  run("tar", ["-x", "-f", archive, "-C", source]);
  rmSync(archive);

  run(
    "docker",
    ["login", REGISTRY, "--username", REGISTRY_USER, "--password-stdin"],
    {
      input: token,
      stdio: ["pipe", process.stderr, process.stderr],
    },
  );
  run("docker", ["build", "--platform", PLATFORM, "--tag", image, source]);
  run("docker", ["push", image]);

  process.stdout.write(`${tag}\n`);
} finally {
  rmSync(source, { recursive: true, force: true });
  run("docker", ["logout", REGISTRY]);
}
