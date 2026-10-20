import { describe, expect, it } from "vitest";
import {
  canAssignRole,
  hasPermission,
  permissionsForRoles,
  ROLE_LABELS,
  SYSTEM_ROLES,
  validateRoleCombination,
} from "./role";

describe("workspace roles", () => {
  it("uses Account Owner as the customer-facing owner label", () => {
    expect(ROLE_LABELS.workspace_owner).toBe("Account Owner");
  });

  it("defines a label for every role", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...SYSTEM_ROLES].sort());
  });

  it("gives Account Owners commercial and ownership administration access", () => {
    expect(
      hasPermission(["workspace_owner"], "workspace.commercial.manage"),
    ).toBe(true);
    expect(hasPermission(["workspace_owner"], "membership.roles.manage")).toBe(
      true,
    );
    expect(hasPermission(["workspace_owner"], "membership.scope.manage")).toBe(
      true,
    );
  });

  it("keeps commercial settings away from Agency Admins", () => {
    expect(hasPermission(["agency_admin"], "workspace.commercial.manage")).toBe(
      false,
    );
    expect(hasPermission(["agency_admin"], "membership.roles.manage")).toBe(
      true,
    );
    expect(hasPermission(["agency_admin"], "membership.scope.manage")).toBe(
      true,
    );
  });

  it("gives Branch Managers view-only staff access", () => {
    expect(hasPermission(["branch_manager"], "membership.read")).toBe(true);
    expect(hasPermission(["branch_manager"], "membership.invite")).toBe(false);
    expect(hasPermission(["branch_manager"], "membership.roles.manage")).toBe(
      false,
    );
    expect(hasPermission(["branch_manager"], "membership.scope.manage")).toBe(
      false,
    );
  });

  it("makes Read Only exclusive", () => {
    expect(validateRoleCombination(["read_only"]).ok).toBe(true);
    expect(validateRoleCombination(["read_only", "negotiator"])).toEqual({
      ok: false,
      reason: "read_only_must_be_exclusive",
    });
  });

  it("denies all permissions for an invalid or empty combination", () => {
    expect(permissionsForRoles([]).size).toBe(0);
    expect(permissionsForRoles(["read_only", "agency_admin"]).size).toBe(0);
  });

  it("combines compatible roles without duplicating permissions", () => {
    const permissions = permissionsForRoles(["negotiator", "accounts"]);

    expect(permissions).toEqual(
      new Set([
        "workspace.read",
        "branch.read",
        "contact.read",
        "contact.create",
        "contact.update",
        "contact.note.create",
        "property.read",
        "property.create",
        "property.update",
        "property.note.create",
        "property.compliance.manage",
        "enquiry.read",
        "enquiry.create",
        "enquiry.update",
        "action.read",
        "action.manage",
        "instruction.read",
        "instruction.manage",
      ]),
    );
  });

  it("lets every role see instructions, five roles work them, and managers approve exceptions", () => {
    const workers = [
      "workspace_owner",
      "agency_admin",
      "branch_manager",
      "negotiator",
      "property_manager",
    ];
    const approvers = ["workspace_owner", "agency_admin", "branch_manager"];
    for (const role of SYSTEM_ROLES) {
      expect(hasPermission([role], "instruction.read")).toBe(true);
      expect(hasPermission([role], "instruction.manage")).toBe(
        workers.includes(role),
      );
      expect(hasPermission([role], "instruction.exception")).toBe(
        approvers.includes(role),
      );
    }
  });

  it("lets every role see actions and every role except Read Only manage them", () => {
    for (const role of SYSTEM_ROLES) {
      expect(hasPermission([role], "action.read")).toBe(true);
      expect(hasPermission([role], "action.manage")).toBe(role !== "read_only");
    }
  });

  it("lets property creators work enquiries and keeps lists and reopening with managers", () => {
    for (const role of SYSTEM_ROLES) {
      expect(hasPermission([role], "enquiry.read")).toBe(true);
    }
    const writers = [
      "workspace_owner",
      "agency_admin",
      "branch_manager",
      "negotiator",
      "property_manager",
    ] as const;
    for (const role of writers) {
      expect(hasPermission([role], "enquiry.create")).toBe(true);
      expect(hasPermission([role], "enquiry.update")).toBe(true);
    }
    for (const role of ["accounts", "read_only"] as const) {
      expect(hasPermission([role], "enquiry.create")).toBe(false);
      expect(hasPermission([role], "enquiry.update")).toBe(false);
    }
    for (const role of [
      "workspace_owner",
      "agency_admin",
      "branch_manager",
    ] as const) {
      expect(hasPermission([role], "enquiry.reopen")).toBe(true);
    }
    for (const role of [
      "negotiator",
      "property_manager",
      "accounts",
      "read_only",
    ] as const) {
      expect(hasPermission([role], "enquiry.reopen")).toBe(false);
    }
    for (const role of SYSTEM_ROLES) {
      expect(hasPermission([role], "enquiry.settings.manage")).toBe(
        role === "workspace_owner" || role === "agency_admin",
      );
    }
  });

  it("gives every role property read access but only writers create", () => {
    for (const role of SYSTEM_ROLES) {
      expect(hasPermission([role], "property.read")).toBe(true);
    }
    for (const role of [
      "workspace_owner",
      "agency_admin",
      "branch_manager",
      "negotiator",
      "property_manager",
    ] as const) {
      expect(hasPermission([role], "property.create")).toBe(true);
      expect(hasPermission([role], "property.update")).toBe(true);
    }
    expect(hasPermission(["accounts"], "property.create")).toBe(false);
    expect(hasPermission(["accounts"], "property.update")).toBe(true);
    expect(hasPermission(["read_only"], "property.update")).toBe(false);
    expect(hasPermission(["read_only"], "property.note.create")).toBe(false);
  });

  it("lets operational staff, but not Accounts or Read Only, manage compliance", () => {
    for (const role of [
      "workspace_owner",
      "agency_admin",
      "branch_manager",
      "negotiator",
      "property_manager",
    ] as const) {
      expect(hasPermission([role], "property.compliance.manage")).toBe(true);
    }
    expect(hasPermission(["accounts"], "property.compliance.manage")).toBe(
      false,
    );
    expect(hasPermission(["read_only"], "property.compliance.manage")).toBe(
      false,
    );
  });

  it("limits property archive, owners, transfers and note corrections to managers", () => {
    const managerOnly = [
      "property.archive",
      "property.ownership.manage",
      "property.branch.transfer",
      "property.note.manage",
    ] as const;
    for (const permission of managerOnly) {
      for (const role of [
        "workspace_owner",
        "agency_admin",
        "branch_manager",
      ] as const) {
        expect(hasPermission([role], permission)).toBe(true);
      }
      for (const role of [
        "negotiator",
        "property_manager",
        "accounts",
        "read_only",
      ] as const) {
        expect(hasPermission([role], permission)).toBe(false);
      }
    }
  });

  it("limits sensitive contact actions to managers and administrators", () => {
    expect(hasPermission(["branch_manager"], "contact.sensitive.manage")).toBe(
      true,
    );
    expect(hasPermission(["negotiator"], "contact.sensitive.manage")).toBe(
      false,
    );
    expect(hasPermission(["accounts"], "contact.update")).toBe(true);
    expect(hasPermission(["accounts"], "contact.create")).toBe(false);
    expect(hasPermission(["read_only"], "contact.read")).toBe(true);
    expect(hasPermission(["read_only"], "contact.update")).toBe(false);
  });

  it("lets writers add contact notes but only managers correct them", () => {
    for (const role of [
      "workspace_owner",
      "agency_admin",
      "branch_manager",
      "negotiator",
      "property_manager",
      "accounts",
    ] as const) {
      expect(hasPermission([role], "contact.note.create")).toBe(true);
    }
    expect(hasPermission(["read_only"], "contact.note.create")).toBe(false);
    for (const role of [
      "workspace_owner",
      "agency_admin",
      "branch_manager",
    ] as const) {
      expect(hasPermission([role], "contact.note.manage")).toBe(true);
    }
    for (const role of [
      "negotiator",
      "property_manager",
      "accounts",
      "read_only",
    ] as const) {
      expect(hasPermission([role], "contact.note.manage")).toBe(false);
    }
  });

  it("allows only an Account Owner to assign the owner role", () => {
    expect(canAssignRole(["workspace_owner"], "workspace_owner")).toBe(true);
    expect(canAssignRole(["agency_admin"], "workspace_owner")).toBe(false);
  });

  it("allows Agency Admins to assign ordinary roles", () => {
    expect(canAssignRole(["agency_admin"], "negotiator")).toBe(true);
    expect(canAssignRole(["branch_manager"], "negotiator")).toBe(false);
  });
});
