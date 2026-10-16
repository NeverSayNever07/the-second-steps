// Cursor hook for shell commands, file reads, and file writes or deletes.
// See https://cursor.com/docs/agent/hooks
import { existsSync, readFileSync } from "node:fs";
import { checkCommand, checkFileRead, checkFileWrite } from "./policy.mjs";

const OWNER_APPROVAL =
  " Stop and explain the change to the owner; they make or approve it themselves.";

function filePathOf(toolInput = {}) {
  return toolInput.file_path ?? toolInput.path ?? toolInput.target_file ?? "";
}

function check(input) {
  switch (input.hook_event_name) {
    case "beforeShellExecution":
      return checkCommand(input.command ?? "");

    case "beforeReadFile":
      return checkFileRead(input.file_path ?? "");

    case "preToolUse": {
      const filePath = filePathOf(input.tool_input);
      return checkFileWrite(filePath, { exists: existsSync(filePath) });
    }

    default:
      return { decision: "allow" };
  }
}

// Only the shell hook can pause for approval. Elsewhere Cursor accepts "ask"
// but does not enforce it, so a change that needs the owner is refused.
function toCursorResponse(result, eventName) {
  const isAskSupported = eventName === "beforeShellExecution";

  // The read hook's response schema has no agent_message, and Cursor blocks
  // the read when a response does not match the schema.
  if (eventName === "beforeReadFile") {
    return { permission: result.decision, user_message: result.reason };
  }

  if (result.decision === "ask" && !isAskSupported) {
    const message = result.reason + OWNER_APPROVAL;
    return {
      permission: "deny",
      user_message: message,
      agent_message: message,
    };
  }

  return {
    permission: result.decision,
    user_message: result.reason,
    agent_message: result.reason,
  };
}

const input = JSON.parse(readFileSync(0, "utf8"));
const response = toCursorResponse(check(input), input.hook_event_name);

process.stdout.write(JSON.stringify(response));
