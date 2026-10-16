// Keeps secrets out of git and nudges local env files towards secret references.
//
//   node scripts/check-env-files.mjs           every tracked file (CI)
//   node scripts/check-env-files.mjs --staged  files about to be committed (pre-commit hook)
//   node scripts/check-env-files.mjs --local   warns about plain secrets in .env.local
//
// Values are never printed, only the names of the settings.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isSecretEnvFile } from "./agent-guard/policy.mjs";

const EXAMPLE_FILES = [".env.example", ".env.docker.example"];
const SAMPLE_SECRET_FILES = [
  ".env",
  "env.docker",
  ".env.local",
  ".env.docker",
  "config/.env.production",
];
const DOCKER_IGNORE_RULES = ["**/.env*", "env.*"];
const LOCAL_FILE = ".env.local";

const SECRET_SETTING = /(?:KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL)$/;
const PLACEHOLDER = /REPLACE_ME|PASSWORD|PROJECT_REF/;
const SECRET_REFERENCE = /^op:\/\//;

function gitFiles(staged) {
  const args = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    : ["ls-files"];
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function settings(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map(([, name, value]) => ({
      name,
      value: value.trim().replace(/^["']|["']$/g, ""),
    }));
}

function secretSettingsWithRealValues(file, isAllowed) {
  return settings(file)
    .filter(({ name, value }) => SECRET_SETTING.test(name) && value !== "")
    .filter(({ value }) => !isAllowed(value))
    .map(({ name }) => name);
}

function isGitIgnored(file) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", file]);
    return true;
  } catch {
    return false;
  }
}

function ignoreFileProblems() {
  const problems = SAMPLE_SECRET_FILES.filter(
    (file) => !isGitIgnored(file),
  ).map((file) => `.gitignore must ignore ${file}; env files hold secrets.`);

  const dockerIgnore = existsSync(".dockerignore")
    ? readFileSync(".dockerignore", "utf8")
        .split("\n")
        .map((line) => line.trim())
    : [];
  for (const rule of DOCKER_IGNORE_RULES.filter(
    (rule) => !dockerIgnore.includes(rule),
  )) {
    problems.push(
      `.dockerignore must contain ${rule} so no env file is copied into an image.`,
    );
  }

  return problems;
}

function checkRepository(staged) {
  const problems = ignoreFileProblems();
  const files = gitFiles(staged);

  for (const file of files.filter(isSecretEnvFile)) {
    problems.push(
      `${file} must never be committed. It is for secrets on one computer only.`,
    );
  }

  for (const file of EXAMPLE_FILES.filter((example) =>
    files.includes(example),
  )) {
    const isPlaceholder = (value) =>
      PLACEHOLDER.test(value) || SECRET_REFERENCE.test(value);
    for (const name of secretSettingsWithRealValues(file, isPlaceholder)) {
      problems.push(
        `${file}: ${name} looks like a real value. Use a placeholder such as REPLACE_ME.`,
      );
    }
  }

  return problems;
}

function warnAboutLocalSecrets() {
  if (!existsSync(LOCAL_FILE)) return;

  const plainSecrets = secretSettingsWithRealValues(LOCAL_FILE, (value) =>
    SECRET_REFERENCE.test(value),
  );
  if (plainSecrets.length === 0) return;

  console.warn(
    `${LOCAL_FILE} holds these secrets as plain text: ${plainSecrets.join(", ")}.\n` +
      "Prefer 1Password references (op://vault/item/field) and start commands with " +
      "`op run --env-file=.env.local -- <command>`. See README.md.",
  );
}

if (process.argv.includes("--local")) {
  warnAboutLocalSecrets();
} else {
  const problems = checkRepository(process.argv.includes("--staged"));
  if (problems.length > 0) {
    console.error(
      ["Secret check failed:", ...problems.map((p) => `- ${p}`)].join("\n"),
    );
    process.exit(1);
  }
}
