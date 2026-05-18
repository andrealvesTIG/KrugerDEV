/**
 * Built-in roles seeded per organization, plus the mapping from legacy
 * `organization_members.role` values to a built-in role key.
 *
 * Built-in roles are system-managed (cannot be deleted). Their permission
 * sets are re-applied on each boot so admins always get new perms when the
 * catalog grows, but custom roles created by admins are left alone.
 */

import { PERMISSIONS } from "./permissionCatalog";

export interface BuiltInRoleDef {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const ALL_PERMS = Object.values(PERMISSIONS);

export const BUILTIN_ROLES: BuiltInRoleDef[] = [
  {
    key: "system_admin",
    name: "System Administrator",
    description: "Full access to everything in the organization.",
    permissions: [...ALL_PERMS],
  },
  {
    key: "pmo_admin",
    name: "PMO Administrator",
    description: "Runs the PMO. Full project / portfolio / role management, plus billing.",
    permissions: [...ALL_PERMS],
  },
  {
    key: "portfolio_manager",
    name: "Portfolio Manager",
    description: "Manages portfolios, programs, and the projects inside them.",
    permissions: [
      PERMISSIONS.ORG_VIEW,
      PERMISSIONS.PORTFOLIO_VIEW, PERMISSIONS.PORTFOLIO_CREATE, PERMISSIONS.PORTFOLIO_UPDATE, PERMISSIONS.PORTFOLIO_DELETE,
      PERMISSIONS.PROGRAM_VIEW, PERMISSIONS.PROGRAM_CREATE, PERMISSIONS.PROGRAM_UPDATE, PERMISSIONS.PROGRAM_DELETE,
      PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_CREATE, PERMISSIONS.PROJECT_UPDATE,
      PERMISSIONS.INTAKE_VIEW, PERMISSIONS.INTAKE_APPROVE,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_CREATE, PERMISSIONS.RISK_UPDATE, PERMISSIONS.RISK_DELETE,
      PERMISSIONS.ISSUE_VIEW, PERMISSIONS.ISSUE_CREATE, PERMISSIONS.ISSUE_UPDATE, PERMISSIONS.ISSUE_DELETE,
      PERMISSIONS.RESOURCE_VIEW,
      PERMISSIONS.FINANCIALS_VIEW,
      PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Runs individual projects: tasks, scheduling, risks, issues, financial edits.",
    permissions: [
      PERMISSIONS.ORG_VIEW,
      PERMISSIONS.PORTFOLIO_VIEW,
      PERMISSIONS.PROGRAM_VIEW,
      PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_CREATE, PERMISSIONS.PROJECT_UPDATE,
      PERMISSIONS.INTAKE_VIEW, PERMISSIONS.INTAKE_CREATE, PERMISSIONS.INTAKE_UPDATE,
      PERMISSIONS.TASK_VIEW, PERMISSIONS.TASK_CREATE, PERMISSIONS.TASK_UPDATE, PERMISSIONS.TASK_DELETE,
      PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_CREATE, PERMISSIONS.RISK_UPDATE, PERMISSIONS.RISK_DELETE,
      PERMISSIONS.ISSUE_VIEW, PERMISSIONS.ISSUE_CREATE, PERMISSIONS.ISSUE_UPDATE, PERMISSIONS.ISSUE_DELETE,
      PERMISSIONS.RESOURCE_VIEW,
      PERMISSIONS.FINANCIALS_VIEW, PERMISSIONS.FINANCIALS_EDIT,
      PERMISSIONS.TIMESHEET_LOG_OWN,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  {
    key: "resource_manager",
    name: "Resource Manager",
    description: "Manages the resource pool, capacity, and assignments.",
    permissions: [
      PERMISSIONS.ORG_VIEW,
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.RESOURCE_VIEW, PERMISSIONS.RESOURCE_CREATE, PERMISSIONS.RESOURCE_UPDATE, PERMISSIONS.RESOURCE_DELETE,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  {
    key: "finance_manager",
    name: "Finance Manager",
    description: "Owns the financial books: budgets, cost items, lockdowns.",
    permissions: [
      PERMISSIONS.ORG_VIEW,
      PERMISSIONS.PORTFOLIO_VIEW,
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.FINANCIALS_VIEW, PERMISSIONS.FINANCIALS_EDIT, PERMISSIONS.FINANCIALS_LOCKDOWN,
      PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "timesheet_approver",
    name: "Timesheet Approver",
    description: "Approves their team's timesheets.",
    permissions: [
      PERMISSIONS.ORG_VIEW,
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.RESOURCE_VIEW,
      PERMISSIONS.TIMESHEET_LOG_OWN, PERMISSIONS.TIMESHEET_VIEW_TEAM, PERMISSIONS.TIMESHEET_APPROVE,
    ],
  },
  {
    key: "executive_viewer",
    name: "Executive Viewer",
    description: "Read-only access to portfolios, projects, financials and reports.",
    permissions: [
      PERMISSIONS.ORG_VIEW,
      PERMISSIONS.PORTFOLIO_VIEW, PERMISSIONS.PROGRAM_VIEW,
      PERMISSIONS.PROJECT_VIEW, PERMISSIONS.INTAKE_VIEW,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.RISK_VIEW, PERMISSIONS.ISSUE_VIEW,
      PERMISSIONS.RESOURCE_VIEW,
      PERMISSIONS.FINANCIALS_VIEW,
      PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "team_member",
    name: "Team Member",
    description: "Works on tasks they're assigned to. Logs their own time.",
    permissions: [
      PERMISSIONS.ORG_VIEW,
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.TASK_VIEW, PERMISSIONS.TASK_UPDATE,
      PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_CREATE, PERMISSIONS.RISK_UPDATE,
      PERMISSIONS.ISSUE_VIEW, PERMISSIONS.ISSUE_CREATE, PERMISSIONS.ISSUE_UPDATE,
      PERMISSIONS.TIMESHEET_LOG_OWN,
    ],
  },
  {
    key: "read_only",
    name: "Read Only",
    description: "Look but don't touch. Read access to the basics.",
    permissions: [
      PERMISSIONS.ORG_VIEW,
      PERMISSIONS.PORTFOLIO_VIEW, PERMISSIONS.PROGRAM_VIEW,
      PERMISSIONS.PROJECT_VIEW, PERMISSIONS.INTAKE_VIEW,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.RISK_VIEW, PERMISSIONS.ISSUE_VIEW,
      PERMISSIONS.RESOURCE_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
];

/**
 * Map a legacy `organization_members.role` value to the built-in role key
 * that should be auto-assigned on first seed. `owner` is treated as
 * system_admin so org owners keep their unrestricted access.
 */
export function mapLegacyMemberRole(legacyRole: string | null | undefined): string {
  switch ((legacyRole || "").toLowerCase()) {
    case "owner":
    case "system_admin":
      return "system_admin";
    case "org_admin":
    case "admin":
      return "pmo_admin";
    case "member":
      return "project_manager";
    case "team_member":
      return "team_member";
    case "viewer":
      return "read_only";
    default:
      return "team_member";
  }
}
