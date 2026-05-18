/**
 * Permission catalog — the single source of truth for every fine-grained
 * permission key in the app. Keys are stable strings used in DB rows
 * (`permissions.key`) and at every enforcement point in the codebase.
 *
 * Format: `<area>.<action>` (lowercase, dotted, snake-case for multi-word).
 *
 * Adding a new permission: add an entry below, then add it to the catalog
 * upserter (server/services/authorizationService.ts ::
 * syncPermissionCatalog) — it runs on boot and inserts any missing rows.
 *
 * Adding it to built-in roles: edit shared/permissionDefaults.ts.
 */

export interface PermissionDef {
  key: string;
  area: string;
  label: string;
  description: string;
}

export const PERMISSIONS = {
  // Organization
  ORG_VIEW: "org.view",
  ORG_MANAGE_SETTINGS: "org.manage_settings",
  ORG_MANAGE_MEMBERS: "org.manage_members",
  ORG_MANAGE_BILLING: "org.manage_billing",

  // Roles & Permissions admin
  ROLES_VIEW: "roles.view",
  ROLES_MANAGE: "roles.manage",

  // Portfolios
  PORTFOLIO_VIEW: "portfolio.view",
  PORTFOLIO_CREATE: "portfolio.create",
  PORTFOLIO_UPDATE: "portfolio.update",
  PORTFOLIO_DELETE: "portfolio.delete",

  // Programs
  PROGRAM_VIEW: "program.view",
  PROGRAM_CREATE: "program.create",
  PROGRAM_UPDATE: "program.update",
  PROGRAM_DELETE: "program.delete",

  // Projects
  PROJECT_VIEW: "project.view",
  PROJECT_CREATE: "project.create",
  PROJECT_UPDATE: "project.update",
  PROJECT_DELETE: "project.delete",

  // Intakes
  INTAKE_VIEW: "intake.view",
  INTAKE_CREATE: "intake.create",
  INTAKE_UPDATE: "intake.update",
  INTAKE_APPROVE: "intake.approve",

  // Tasks
  TASK_VIEW: "task.view",
  TASK_CREATE: "task.create",
  TASK_UPDATE: "task.update",
  TASK_DELETE: "task.delete",

  // Risks
  RISK_VIEW: "risk.view",
  RISK_CREATE: "risk.create",
  RISK_UPDATE: "risk.update",
  RISK_DELETE: "risk.delete",

  // Issues
  ISSUE_VIEW: "issue.view",
  ISSUE_CREATE: "issue.create",
  ISSUE_UPDATE: "issue.update",
  ISSUE_DELETE: "issue.delete",

  // Resources
  RESOURCE_VIEW: "resource.view",
  RESOURCE_CREATE: "resource.create",
  RESOURCE_UPDATE: "resource.update",
  RESOURCE_DELETE: "resource.delete",

  // Financials
  FINANCIALS_VIEW: "financials.view",
  FINANCIALS_EDIT: "financials.edit",
  FINANCIALS_LOCKDOWN: "financials.lockdown",

  // Timesheets
  TIMESHEET_LOG_OWN: "timesheet.log_own",
  TIMESHEET_VIEW_TEAM: "timesheet.view_team",
  TIMESHEET_APPROVE: "timesheet.approve",
  TIMESHEET_MANAGE_SETTINGS: "timesheet.manage_settings",

  // Reports / analytics
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: PERMISSIONS.ORG_VIEW, area: "Organization", label: "View organization", description: "See the organization and its dashboard." },
  { key: PERMISSIONS.ORG_MANAGE_SETTINGS, area: "Organization", label: "Manage organization settings", description: "Edit branding, sidebar, governance, and other org-level settings." },
  { key: PERMISSIONS.ORG_MANAGE_MEMBERS, area: "Organization", label: "Manage members", description: "Invite, remove, and change roles of organization members." },
  { key: PERMISSIONS.ORG_MANAGE_BILLING, area: "Organization", label: "Manage billing", description: "View invoices and change the subscription plan." },

  { key: PERMISSIONS.ROLES_VIEW, area: "Roles & Permissions", label: "View roles", description: "See the list of roles and the permission matrix." },
  { key: PERMISSIONS.ROLES_MANAGE, area: "Roles & Permissions", label: "Manage roles", description: "Create, edit, delete roles and assign permissions to them." },

  { key: PERMISSIONS.PORTFOLIO_VIEW, area: "Portfolios", label: "View portfolios", description: "Read portfolio data." },
  { key: PERMISSIONS.PORTFOLIO_CREATE, area: "Portfolios", label: "Create portfolios", description: "Create new portfolios." },
  { key: PERMISSIONS.PORTFOLIO_UPDATE, area: "Portfolios", label: "Update portfolios", description: "Edit portfolios you can see." },
  { key: PERMISSIONS.PORTFOLIO_DELETE, area: "Portfolios", label: "Delete portfolios", description: "Delete portfolios." },

  { key: PERMISSIONS.PROGRAM_VIEW, area: "Programs", label: "View programs", description: "Read program data." },
  { key: PERMISSIONS.PROGRAM_CREATE, area: "Programs", label: "Create programs", description: "Create new programs." },
  { key: PERMISSIONS.PROGRAM_UPDATE, area: "Programs", label: "Update programs", description: "Edit programs and their project associations." },
  { key: PERMISSIONS.PROGRAM_DELETE, area: "Programs", label: "Delete programs", description: "Delete programs." },

  { key: PERMISSIONS.PROJECT_VIEW, area: "Projects", label: "View projects", description: "Read project data." },
  { key: PERMISSIONS.PROJECT_CREATE, area: "Projects", label: "Create projects", description: "Create new projects." },
  { key: PERMISSIONS.PROJECT_UPDATE, area: "Projects", label: "Update projects", description: "Edit project fields." },
  { key: PERMISSIONS.PROJECT_DELETE, area: "Projects", label: "Delete projects", description: "Delete projects." },

  { key: PERMISSIONS.INTAKE_VIEW, area: "Intakes", label: "View intakes", description: "Read project intake requests." },
  { key: PERMISSIONS.INTAKE_CREATE, area: "Intakes", label: "Submit intakes", description: "Create a new intake request." },
  { key: PERMISSIONS.INTAKE_UPDATE, area: "Intakes", label: "Edit intakes", description: "Edit existing intake requests." },
  { key: PERMISSIONS.INTAKE_APPROVE, area: "Intakes", label: "Approve / progress intakes", description: "Move intakes through workflow gates." },

  { key: PERMISSIONS.TASK_VIEW, area: "Tasks", label: "View tasks", description: "Read tasks." },
  { key: PERMISSIONS.TASK_CREATE, area: "Tasks", label: "Create tasks", description: "Create new tasks." },
  { key: PERMISSIONS.TASK_UPDATE, area: "Tasks", label: "Update tasks", description: "Edit existing tasks." },
  { key: PERMISSIONS.TASK_DELETE, area: "Tasks", label: "Delete tasks", description: "Delete tasks." },

  { key: PERMISSIONS.RISK_VIEW, area: "Risks", label: "View risks", description: "Read project risks." },
  { key: PERMISSIONS.RISK_CREATE, area: "Risks", label: "Create risks", description: "Log new risks." },
  { key: PERMISSIONS.RISK_UPDATE, area: "Risks", label: "Update risks", description: "Edit existing risks." },
  { key: PERMISSIONS.RISK_DELETE, area: "Risks", label: "Delete risks", description: "Delete risks." },

  { key: PERMISSIONS.ISSUE_VIEW, area: "Issues", label: "View issues", description: "Read project issues." },
  { key: PERMISSIONS.ISSUE_CREATE, area: "Issues", label: "Create issues", description: "Log new issues." },
  { key: PERMISSIONS.ISSUE_UPDATE, area: "Issues", label: "Update issues", description: "Edit existing issues." },
  { key: PERMISSIONS.ISSUE_DELETE, area: "Issues", label: "Delete issues", description: "Delete issues." },

  { key: PERMISSIONS.RESOURCE_VIEW, area: "Resources", label: "View resources", description: "See the resource directory." },
  { key: PERMISSIONS.RESOURCE_CREATE, area: "Resources", label: "Create resources", description: "Add new resources to the directory." },
  { key: PERMISSIONS.RESOURCE_UPDATE, area: "Resources", label: "Update resources", description: "Edit existing resources." },
  { key: PERMISSIONS.RESOURCE_DELETE, area: "Resources", label: "Delete resources", description: "Delete resources." },

  { key: PERMISSIONS.FINANCIALS_VIEW, area: "Financials", label: "View financials", description: "See project financial data and grids." },
  { key: PERMISSIONS.FINANCIALS_EDIT, area: "Financials", label: "Edit financials", description: "Edit cost items and financial cells." },
  { key: PERMISSIONS.FINANCIALS_LOCKDOWN, area: "Financials", label: "Lock financial periods", description: "Apply or lift period lockdowns." },

  { key: PERMISSIONS.TIMESHEET_LOG_OWN, area: "Timesheets", label: "Log own time", description: "Submit timesheet entries for assigned tasks." },
  { key: PERMISSIONS.TIMESHEET_VIEW_TEAM, area: "Timesheets", label: "View team timesheets", description: "See timesheets for other people in the org." },
  { key: PERMISSIONS.TIMESHEET_APPROVE, area: "Timesheets", label: "Approve timesheets", description: "Approve or reject timesheet submissions." },
  { key: PERMISSIONS.TIMESHEET_MANAGE_SETTINGS, area: "Timesheets", label: "Manage timesheet settings", description: "Configure org timesheet policies and reminders." },

  { key: PERMISSIONS.REPORTS_VIEW, area: "Reports", label: "View reports", description: "Read analytics dashboards and reports." },
  { key: PERMISSIONS.REPORTS_EXPORT, area: "Reports", label: "Export reports", description: "Export reports / analytics data." },
];

export const PERMISSION_KEYS: string[] = PERMISSION_CATALOG.map(p => p.key);

export function groupPermissionsByArea(): Record<string, PermissionDef[]> {
  const out: Record<string, PermissionDef[]> = {};
  for (const p of PERMISSION_CATALOG) {
    (out[p.area] ||= []).push(p);
  }
  return out;
}
