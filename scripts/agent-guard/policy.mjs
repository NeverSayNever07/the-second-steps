// Guardrails for AI coding agents. The Cursor hook (cursor.mjs) calls these
// checks before an agent runs a command or touches a file, so the rules hold
// even when an agent ignores or forgets the written instructions.
//
// "deny" blocks the action outright. "ask" pauses for the owner to approve.

const ALLOW = { decision: "allow" };

function deny(reason) {
  return { decision: "deny", reason };
}

function ask(reason) {
  return { decision: "ask", reason };
}

// Matches `.env`, `.env.local`, `path/.env.production`, the same names saved
// without the dot (`env.docker`), but not `process.env` or `import.meta.env`.
const ENV_FILE_REFERENCE =
  /(?:^|[\s'"`=<>|;&(/])(\.?env(?:\.[\w.-]+)?)(?=$|[\s'"`<>|;&)])/g;

const COMMAND_RULES = [
  {
    pattern: /\bprisma\s+db\s+push\b|\bdb\s+push\b.*--schema/,
    result: deny(
      "`prisma db push` changes the database without a migration. Create a migration with `npm run db:migrate` after the owner approves it.",
    ),
  },
  {
    pattern:
      /\bprisma\s+migrate\s+reset\b|--force-reset\b|--accept-data-loss\b/,
    result: deny(
      "This command deletes database data. It is never run by an agent.",
    ),
  },
  {
    pattern: /\bsupabase\s+(?:db|migration)\b/,
    result: deny(
      "Schema changes go through Prisma migrations, not the Supabase CLI (docs/DECISIONS.md, ADR-016).",
    ),
  },
  {
    pattern: /\b(?:psql|pg_dump|pg_restore|pg_dumpall)\b/,
    result: ask(
      "This connects straight to a database. Confirm which database and why.",
    ),
  },
  {
    pattern:
      /\bprisma\s+migrate\s+(?:dev|deploy|resolve)\b|\bnpm\s+run\s+db:(?:migrate|deploy)\b/,
    result: ask(
      "Migrations change the shared database. The owner must approve each one.",
    ),
  },
  {
    pattern: /\bgit\b.*\s--no-verify\b|\bgit\s+commit\b.*\s-n\b/,
    result: deny("Skipping git hooks would skip the secret checks."),
  },
  {
    pattern:
      /\bgit\s+push\b.*(?:\s--force\b|\s--force-with-lease\b|\s-f\b|\s\+\S)/,
    result: deny("Force-pushing rewrites shared history."),
  },
  {
    pattern: /\bgit\s+push\b/,
    result: ask(
      "Pushing publishes code to GitHub. The owner approves every push.",
    ),
  },
  {
    pattern:
      /\bgit\s+(?:reset\s+--hard|clean\s+-\w*f|checkout\s+--?\s|checkout\s+\.|restore\s|stash\s+(?:drop|clear))/,
    result: ask("This can throw away uncommitted work."),
  },
  {
    pattern: /\brm\s+-\w*r\w*\s+.*(?:\.git\b|prisma\/migrations|certs\b)/,
    result: deny(
      "This deletes the git history, migrations, or database certificates.",
    ),
  },
  {
    pattern: /(?:^|[;&|]\s*)(?:printenv|env|set|export\s+-p)\s*(?:$|[;&|>])/,
    result: deny("This prints every environment variable, including secrets."),
  },
  {
    pattern: /\bop\s+(?:read|inject|item\s+get)\b/,
    result: deny(
      "This prints a secret from 1Password. Use `op run -- <command>` so the secret goes to the program, not the conversation.",
    ),
  },
  {
    pattern:
      /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|node|python3?)\b/,
    result: deny(
      "This downloads and runs code from the internet without review.",
    ),
  },
  {
    pattern: /\bnpx\s+(?:-y\s+)?skills\s+add\b/,
    result: ask(
      "Skills are instructions that run with your permissions. Review a skill's files before adding it.",
    ),
  },
  {
    pattern:
      /\b(?:npm\s+(?:install|i|add)|pnpm\s+add|yarn\s+add)\s+(?:-\S+\s+)*[^-\s]/,
    result: ask("New dependencies need the owner's approval (AGENTS.md)."),
  },
  {
    pattern:
      /--ignore-scripts(?:=|\s+)false\b|\bnpm\s+(?:config\s+set\s+ignore-scripts|rebuild)\b|--foreground-scripts\b/,
    result: deny(
      "Package install scripts stay off (.npmrc); they are the usual way npm packages get compromised.",
    ),
  },
  {
    pattern: /\bgit\s+config\b.*\bcore\.hooksPath\b/,
    result: ask(
      "Changing the git hooks path would switch off the secret check.",
    ),
  },
];

// An agent that can rewrite its own guardrails is not guarded. package.json is
// included because `npm run` and install scripts execute whatever it says.
const GUARDRAIL_FILE =
  /(?:^|[\s'"=\\/])(?:\.cursor[\\/]hooks\.json|\.cursorignore|\.gitignore|\.dockerignore|\.npmrc|\.githooks[\\/]|scripts[\\/]agent-guard[\\/]|scripts[\\/]check-env-files\.mjs|package\.json\b|\.github[\\/]workflows[\\/])/;

const SHELL_WRITE =
  /(?:>|\btee\b|\bsed\s+-i|\bperl\s+-[a-z]*i|\b(?:rm|mv|cp|chmod|truncate)\s)/;

function writesGuardrailFile(command) {
  return GUARDRAIL_FILE.test(command) && SHELL_WRITE.test(command);
}

const GUARDRAIL_CHANGE = ask(
  "This changes the AI guardrails, git hooks, CI or package scripts. The owner should see and approve it.",
);

function basename(filePath) {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function isSecretEnvFile(filePath) {
  const name = basename(filePath);
  const isEnvFile =
    /^\.env(?:\..+)?$/.test(name) ||
    /^env\.(?:local|docker|production|development|test)(?:\.local)?$/.test(
      name,
    );
  const isSharedExample = name.endsWith(".example");
  return isEnvFile && !isSharedExample;
}

function referencesSecretEnvFile(command) {
  for (const match of command.matchAll(ENV_FILE_REFERENCE)) {
    if (isSecretEnvFile(match[1])) return true;
  }
  return false;
}

export function checkCommand(command) {
  if (referencesSecretEnvFile(command)) {
    return deny(
      "Agents do not open, print, copy, or commit .env files. They hold secrets. Use .env.example for the list of settings.",
    );
  }

  for (const rule of COMMAND_RULES) {
    if (rule.pattern.test(command)) return rule.result;
  }

  if (writesGuardrailFile(command)) return GUARDRAIL_CHANGE;

  return ALLOW;
}

export function checkFileRead(filePath) {
  if (isSecretEnvFile(filePath)) {
    return deny(
      "Agents do not read .env files. They hold secrets. Read .env.example instead.",
    );
  }
  return ALLOW;
}

export function checkFileWrite(filePath, { exists }) {
  if (isSecretEnvFile(filePath)) {
    return deny(
      "Agents do not write .env files. Put new settings, with placeholder values, in .env.example.",
    );
  }

  const isMigrationFile =
    /(?:^|[\\/])prisma[\\/]migrations[\\/][^\\/]+[\\/]migration\.sql$/.test(
      filePath,
    );
  if (isMigrationFile && exists) {
    return ask(
      "Changing a migration that may already be applied makes databases disagree. Add a new migration instead unless the owner agrees.",
    );
  }

  if (GUARDRAIL_FILE.test(filePath)) return GUARDRAIL_CHANGE;

  return ALLOW;
}

// Shapes of real credentials. Placeholders such as REPLACE_ME never match.
const SECRET_SHAPES = [
  {
    kind: "a Supabase secret key",
    pattern: /\bsb_secret_(?!REPLACE_ME)[A-Za-z0-9_-]{10,}/,
  },
  {
    kind: "a database address with a password",
    pattern: /\bpostgres(?:ql)?:\/\/[^:\s/]+:(?!REPLACE_ME|PASSWORD)[^@\s]+@/,
  },
  {
    kind: "a sign-in token",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  { kind: "a private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "an API key", pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { kind: "a payment key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{10,}/ },
  {
    kind: "a GitHub token",
    pattern: /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/,
  },
  { kind: "an AWS key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

export function findSecret(text) {
  return SECRET_SHAPES.find(({ pattern }) => pattern.test(text))?.kind ?? null;
}
