import { describe, expect, it } from "vitest";
import { toActiveBranchOptions } from "./branch-option";

describe("branch options", () => {
  it("offer only active branches, with only their id and name", () => {
    const branches = [
      {
        id: "b1",
        name: "Main Branch",
        status: "ACTIVE",
        email: "main@example.test",
        users: [{ primaryEmail: "staff@example.test" }],
      },
      { id: "b2", name: "Closed Branch", status: "INACTIVE" },
    ];

    expect(toActiveBranchOptions(branches)).toEqual([
      { id: "b1", name: "Main Branch" },
    ]);
  });
});
