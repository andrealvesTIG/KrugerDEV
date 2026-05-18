import { describe, it, expect } from "vitest";
import { PERMISSIONS, PERMISSION_CATALOG, groupPermissionsByArea } from "../shared/permissionCatalog";
import { BUILTIN_ROLES, mapLegacyMemberRole } from "../shared/permissionDefaults";

describe("permission catalog", () => {
  it("has unique keys", () => {
    const keys = PERMISSION_CATALOG.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("PERMISSIONS map values all appear in PERMISSION_CATALOG", () => {
    const catalogKeys = new Set(PERMISSION_CATALOG.map(p => p.key));
    for (const v of Object.values(PERMISSIONS)) {
      expect(catalogKeys.has(v)).toBe(true);
    }
  });

  it("groupPermissionsByArea covers every permission", () => {
    const grouped = groupPermissionsByArea();
    const flat = Object.values(grouped).flat();
    expect(flat.length).toBe(PERMISSION_CATALOG.length);
  });
});

describe("built-in roles", () => {
  it("contains 10 roles with unique keys", () => {
    expect(BUILTIN_ROLES.length).toBe(10);
    const keys = BUILTIN_ROLES.map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("system_admin has every permission", () => {
    const sa = BUILTIN_ROLES.find(r => r.key === "system_admin")!;
    expect(new Set(sa.permissions).size).toBe(PERMISSION_CATALOG.length);
  });

  it("read_only never gets a write/manage permission", () => {
    const ro = BUILTIN_ROLES.find(r => r.key === "read_only")!;
    for (const p of ro.permissions) {
      expect(/\.(create|update|delete|manage|edit|approve|lockdown)/.test(p)).toBe(false);
    }
  });

  it("every permission listed on a role is a real catalog key", () => {
    const catalogKeys = new Set(PERMISSION_CATALOG.map(p => p.key));
    for (const role of BUILTIN_ROLES) {
      for (const p of role.permissions) {
        expect(catalogKeys.has(p)).toBe(true);
      }
    }
  });

  it("project_manager can manage tasks but not roles", () => {
    const pm = BUILTIN_ROLES.find(r => r.key === "project_manager")!;
    expect(pm.permissions).toContain(PERMISSIONS.TASK_CREATE);
    expect(pm.permissions).toContain(PERMISSIONS.TASK_DELETE);
    expect(pm.permissions).not.toContain(PERMISSIONS.ROLES_MANAGE);
  });

  it("team_member cannot edit financials or manage members", () => {
    const tm = BUILTIN_ROLES.find(r => r.key === "team_member")!;
    expect(tm.permissions).not.toContain(PERMISSIONS.FINANCIALS_EDIT);
    expect(tm.permissions).not.toContain(PERMISSIONS.ORG_MANAGE_MEMBERS);
    expect(tm.permissions).toContain(PERMISSIONS.TIMESHEET_LOG_OWN);
  });
});

describe("legacy role mapping", () => {
  it("maps owner -> system_admin", () => {
    expect(mapLegacyMemberRole("owner")).toBe("system_admin");
  });
  it("maps org_admin -> pmo_admin", () => {
    expect(mapLegacyMemberRole("org_admin")).toBe("pmo_admin");
    expect(mapLegacyMemberRole("admin")).toBe("pmo_admin");
  });
  it("maps member -> project_manager", () => {
    expect(mapLegacyMemberRole("member")).toBe("project_manager");
  });
  it("maps team_member -> team_member", () => {
    expect(mapLegacyMemberRole("team_member")).toBe("team_member");
  });
  it("maps viewer -> read_only", () => {
    expect(mapLegacyMemberRole("viewer")).toBe("read_only");
  });
  it("falls back to team_member for unknown values", () => {
    expect(mapLegacyMemberRole("guest")).toBe("team_member");
    expect(mapLegacyMemberRole(null)).toBe("team_member");
    expect(mapLegacyMemberRole(undefined)).toBe("team_member");
    expect(mapLegacyMemberRole("")).toBe("team_member");
  });
});
