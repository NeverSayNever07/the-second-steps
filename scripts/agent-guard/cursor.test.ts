import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = path.join(import.meta.dirname, "cursor.mjs");

function runHook(input: object) {
  const result = spawnSync("node", [HOOK], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe("Cursor hook", () => {
  it("answers file reads with only the fields Cursor's read schema allows", () => {
    const response = runHook({
      hook_event_name: "beforeReadFile",
      file_path: "/repo/README.md",
    });
    expect(response).toEqual({ permission: "allow" });
  });

  it("blocks shell commands that touch secrets", () => {
    const response = runHook({
      hook_event_name: "beforeShellExecution",
      command: "cat .env.local",
    });
    expect(response.permission).toBe("deny");
    expect(response.agent_message).toMatch(/\.env/);
  });

  it("pauses shell commands that need the owner", () => {
    const response = runHook({
      hook_event_name: "beforeShellExecution",
      command: "git push",
    });
    expect(response.permission).toBe("ask");
  });

  it("blocks reading secret env files but allows the examples", () => {
    expect(
      runHook({
        hook_event_name: "beforeReadFile",
        file_path: "/repo/.env.local",
      }).permission,
    ).toBe("deny");
    expect(
      runHook({
        hook_event_name: "beforeReadFile",
        file_path: "/repo/.env.example",
      }).permission,
    ).toBe("allow");
  });

  it("blocks writing secret env files", () => {
    const response = runHook({
      hook_event_name: "preToolUse",
      tool_name: "Write",
      tool_input: { file_path: "/repo/.env.local" },
    });
    expect(response.permission).toBe("deny");
  });

  it("refuses guardrail edits and hands them to the owner, because Cursor cannot pause a file write", () => {
    const response = runHook({
      hook_event_name: "preToolUse",
      tool_name: "Write",
      tool_input: { file_path: "package.json" },
    });
    expect(response.permission).toBe("deny");
    expect(response.agent_message).toMatch(/explain the change to the owner/);
  });

  it("allows ordinary file writes", () => {
    const response = runHook({
      hook_event_name: "preToolUse",
      tool_name: "Write",
      tool_input: { file_path: "core/contacts/domain/contact.ts" },
    });
    expect(response.permission).toBe("allow");
  });
});

describe("prompt guard", () => {
  const PROMPT_GUARD = path.join(import.meta.dirname, "prompt-guard.mjs");

  function submit(prompt: string) {
    const result = spawnSync("node", [PROMPT_GUARD], {
      input: JSON.stringify({ hook_event_name: "beforeSubmitPrompt", prompt }),
      encoding: "utf8",
    });
    return JSON.parse(result.stdout);
  }

  it("stops a message containing a secret from being sent", () => {
    const response = submit("here is the key sb_secret_abcdefghijklmnop");
    expect(response.continue).toBe(false);
    expect(response.user_message).toMatch(/Not sent/);
  });

  it("sends ordinary messages", () => {
    expect(submit("add a viewings calendar").continue).toBe(true);
  });
});
