// Cursor beforeSubmitPrompt hook: a pasted secret never leaves this computer.
import { readFileSync } from "node:fs";
import { findSecret } from "./policy.mjs";

const { prompt = "" } = JSON.parse(readFileSync(0, "utf8"));
const secret = findSecret(prompt);

if (secret) {
  process.stdout.write(
    JSON.stringify({
      continue: false,
      user_message: `Not sent: this message looks like it contains ${secret}. Anything sent to the AI should be treated as leaked. Remove it, put the real value in .env.local, and describe it by name instead (for example "the Supabase secret key").`,
    }),
  );
} else {
  process.stdout.write(JSON.stringify({ continue: true }));
}
