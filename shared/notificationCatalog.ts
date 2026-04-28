export type NotificationChannel = "email" | "inApp";

export interface NotificationDefinition {
  key: string;
  groupId: string;
  label: string;
  description: string;
  channels: NotificationChannel[];
  required?: boolean;
  defaultEnabled?: boolean;
}

export interface NotificationGroup {
  id: string;
  label: string;
  description: string;
  sortOrder: number;
}

export const NOTIFICATION_GROUPS: NotificationGroup[] = [
  { id: "account", label: "Account & Security", description: "Sign-in, password, and account verification messages.", sortOrder: 10 },
  { id: "organization", label: "Organizations & Access", description: "Invitations and access requests for your organizations.", sortOrder: 20 },
  { id: "projects", label: "Projects & Intake", description: "Intake workflow updates, project health, and project documents.", sortOrder: 30 },
  { id: "tasks", label: "Tasks & Work", description: "Task assignments, deadlines, milestones, risks, and issues.", sortOrder: 40 },
  { id: "ai", label: "AI Agent", description: "Updates from the AI project agent (agendas, status reports, follow-ups).", sortOrder: 50 },
  { id: "timesheets", label: "Timesheets", description: "Submission reminders, approvals, and digests.", sortOrder: 60 },
  { id: "marketing", label: "Digests & Marketing", description: "Weekly product digests and plan offers.", sortOrder: 70 },
  { id: "support", label: "Support & Other", description: "Support tickets and partner / investor inquiries.", sortOrder: 80 },
];

export const ALL_EMAIL_MASTER_KEY = "all.email";
export const GROUP_MASTER_PREFIX = "group:";

export function groupMasterFieldId(groupId: string, channel: NotificationChannel): string {
  return `${GROUP_MASTER_PREFIX}${groupId}.${channel}`;
}

export const NOTIFICATION_CATALOG: NotificationDefinition[] = [
  {
    key: "account.passwordReset",
    groupId: "account",
    label: "Password reset",
    description: "Email containing a link to reset your password.",
    channels: ["email"],
    required: true,
  },
  {
    key: "account.emailVerification",
    groupId: "account",
    label: "Verify your email",
    description: "Confirmation link sent when you create or change your account email.",
    channels: ["email"],
    required: true,
  },
  {
    key: "account.magicLink",
    groupId: "account",
    label: "Magic sign-in link",
    description: "One-time sign-in link sent on request.",
    channels: ["email"],
    required: true,
  },
  {
    key: "account.passwordlessSignIn",
    groupId: "account",
    label: "Passwordless sign-in",
    description: "One-time passwordless sign-in link.",
    channels: ["email"],
    required: true,
  },
  {
    key: "account.welcome",
    groupId: "account",
    label: "Welcome email",
    description: "One-time welcome message after you sign up. Always sent.",
    channels: ["email"],
    required: true,
  },

  {
    key: "org.invite",
    groupId: "organization",
    label: "Organization invitation",
    description: "When you're invited to join an organization.",
    channels: ["email"],
    required: true,
  },
  {
    key: "org.accessRequestReceived",
    groupId: "organization",
    label: "Access request received",
    description: "Sent to admins when a user requests access to an organization.",
    channels: ["email"],
  },
  {
    key: "org.accessRequestDecision",
    groupId: "organization",
    label: "Access request decision",
    description: "When your access request is approved or rejected.",
    channels: ["email"],
  },
  {
    key: "org.resourceInvite",
    groupId: "organization",
    label: "Resource invitation",
    description: "When you're invited to FridayReport.AI as a project resource.",
    channels: ["email"],
    required: true,
  },

  {
    key: "intake.stepTransition",
    groupId: "projects",
    label: "Intake step transitions",
    description: "When an intake enters or exits a workflow step you're watching.",
    channels: ["email"],
  },
  {
    key: "report.shared",
    groupId: "projects",
    label: "Report shared with you",
    description: "When someone shares a report or dashboard with you by email.",
    channels: ["email"],
  },
  {
    key: "project_health_alert",
    groupId: "projects",
    label: "Project health turned red",
    description: "When a project you administer is marked at risk.",
    channels: ["inApp"],
  },
  {
    key: "rfi_due_date",
    groupId: "projects",
    label: "RFI due dates",
    description: "When an RFI you own is approaching its due date or is overdue.",
    channels: ["inApp"],
  },
  {
    key: "submittal_due_date",
    groupId: "projects",
    label: "Submittal due dates",
    description: "When a submittal you review is approaching its required date or is overdue.",
    channels: ["inApp"],
  },
  {
    key: "rfi_assignment",
    groupId: "projects",
    label: "RFI assigned to you",
    description: "When you're assigned to respond to an RFI.",
    channels: ["inApp"],
  },
  {
    key: "rfi_response",
    groupId: "projects",
    label: "RFI response received",
    description: "When someone responds to an RFI you submitted or follow.",
    channels: ["inApp"],
  },
  {
    key: "rfi_update",
    groupId: "projects",
    label: "Other RFI activity",
    description: "Other RFI lifecycle changes on your project.",
    channels: ["inApp"],
  },
  {
    key: "submittal_assignment",
    groupId: "projects",
    label: "Submittal assigned to you",
    description: "When you're assigned to review a submittal.",
    channels: ["inApp"],
  },
  {
    key: "submittal_review",
    groupId: "projects",
    label: "Submittal reviewed",
    description: "When a submittal you submitted is reviewed.",
    channels: ["inApp"],
  },
  {
    key: "submittal_status_change",
    groupId: "projects",
    label: "Submittal status changes",
    description: "When a submittal you follow changes status.",
    channels: ["inApp"],
  },
  {
    key: "submittal_update",
    groupId: "projects",
    label: "Other submittal activity",
    description: "Other submittal lifecycle changes on your project.",
    channels: ["inApp"],
  },
  {
    key: "punch_list_update",
    groupId: "projects",
    label: "Punch list activity",
    description: "When punch list items on your project are created or updated.",
    channels: ["inApp"],
  },
  {
    key: "bid_received",
    groupId: "projects",
    label: "New bid received",
    description: "When a vendor submits a bid on a package you manage.",
    channels: ["inApp"],
  },
  {
    key: "bid_awarded",
    groupId: "projects",
    label: "Bid awarded",
    description: "When a bid package on your project is awarded.",
    channels: ["inApp"],
  },
  {
    key: "project_assignment",
    groupId: "projects",
    label: "Added to a project",
    description: "When you're added to a project as a team member.",
    channels: ["inApp"],
  },
  {
    key: "mention",
    groupId: "projects",
    label: "You were @mentioned",
    description: "When someone mentions you in a comment.",
    channels: ["inApp"],
  },
  {
    key: "comment_reply",
    groupId: "projects",
    label: "Reply to your comment",
    description: "When someone replies to a comment you made.",
    channels: ["inApp"],
  },

  {
    key: "task_assignment",
    groupId: "tasks",
    label: "Task assigned to you",
    description: "When you're assigned to a new task.",
    channels: ["inApp", "email"],
  },
  {
    key: "task_unassignment",
    groupId: "tasks",
    label: "Task unassigned",
    description: "When you're removed from a task.",
    channels: ["inApp"],
  },
  {
    key: "task_field_change",
    groupId: "tasks",
    label: "Task updated",
    description: "When a task you're assigned to is updated.",
    channels: ["inApp"],
  },
  {
    key: "task_deadline_warning",
    groupId: "tasks",
    label: "Task deadline approaching",
    description: "Reminders for tasks due in the next few days.",
    channels: ["inApp"],
  },
  {
    key: "task_overdue",
    groupId: "tasks",
    label: "Task overdue",
    description: "Alerts when one of your tasks is past its due date.",
    channels: ["inApp"],
  },
  {
    key: "milestone_approaching",
    groupId: "tasks",
    label: "Milestone approaching",
    description: "When a project milestone is due within a week.",
    channels: ["inApp"],
  },
  {
    key: "milestone_overdue",
    groupId: "tasks",
    label: "Milestone overdue",
    description: "When a project milestone has passed its target date.",
    channels: ["inApp"],
  },
  {
    key: "risk_assignment",
    groupId: "tasks",
    label: "Risk assigned to you",
    description: "When a risk is assigned to you.",
    channels: ["inApp"],
  },
  {
    key: "issue_assignment",
    groupId: "tasks",
    label: "Issue assigned to you",
    description: "When an issue is assigned to you.",
    channels: ["inApp"],
  },

  {
    key: "ai.meetingAgenda",
    groupId: "ai",
    label: "AI meeting agenda",
    description: "When the AI agent emails you a generated meeting agenda.",
    channels: ["email"],
  },
  {
    key: "ai.statusReport",
    groupId: "ai",
    label: "AI status report",
    description: "When the AI agent emails you a generated project status report.",
    channels: ["email"],
  },
  {
    key: "ai.followUp",
    groupId: "ai",
    label: "AI follow-up",
    description: "When the AI agent sends a generic follow-up on your behalf.",
    channels: ["email"],
  },

  {
    key: "timesheet.submissionReminder",
    groupId: "timesheets",
    label: "Submit your timesheet (email)",
    description: "Weekly email reminder to submit your timesheet.",
    channels: ["email"],
  },
  {
    key: "timesheet_submission_reminder",
    groupId: "timesheets",
    label: "Submit your timesheet (in-app)",
    description: "In-app reminder to submit your timesheet.",
    channels: ["inApp"],
  },
  {
    key: "timesheet.approvalReminder",
    groupId: "timesheets",
    label: "Timesheets pending your approval (email)",
    description: "Email when you have timesheets waiting for your approval.",
    channels: ["email"],
  },
  {
    key: "timesheet_approval_reminder",
    groupId: "timesheets",
    label: "Timesheets pending your approval (in-app)",
    description: "In-app alert when you have timesheets waiting for your approval.",
    channels: ["inApp"],
  },
  {
    key: "timesheet.escalation",
    groupId: "timesheets",
    label: "Timesheet escalation (email)",
    description: "Email escalation when timesheets remain unapproved past the SLA window.",
    channels: ["email"],
  },
  {
    key: "timesheet_escalation",
    groupId: "timesheets",
    label: "Timesheet escalation (in-app)",
    description: "In-app escalation when timesheets remain unapproved past the SLA window.",
    channels: ["inApp"],
  },
  {
    key: "timesheet.weeklyDigest",
    groupId: "timesheets",
    label: "Weekly timesheet digest",
    description: "Manager weekly summary of pending approvals.",
    channels: ["email"],
  },

  {
    key: "marketing.upgradeOffer",
    groupId: "marketing",
    label: "Plan upgrade offers",
    description: "Occasional offers to upgrade your plan.",
    channels: ["email"],
  },
  {
    key: "marketing.weeklyDigest",
    groupId: "marketing",
    label: "Weekly product digest",
    description: "Roundup of activity across your organization.",
    channels: ["email"],
  },
  {
    key: "marketing.event",
    groupId: "marketing",
    label: "Event follow-ups",
    description: "Follow-ups from events and conferences (e.g. unCON).",
    channels: ["email"],
  },

  {
    key: "support.ticket",
    groupId: "support",
    label: "Support ticket updates",
    description: "Confirmations when you submit a support request.",
    channels: ["email"],
  },
  {
    key: "support.partnerApplication",
    groupId: "support",
    label: "Partner application updates",
    description: "Confirmations when you submit a partner application.",
    channels: ["email"],
  },
  {
    key: "support.investorInquiry",
    groupId: "support",
    label: "Investor inquiry updates",
    description: "Confirmations when you submit an investor inquiry.",
    channels: ["email"],
  },
  {
    key: "support.investorDeck",
    groupId: "support",
    label: "Investor deck delivery",
    description: "Delivery emails for the investor deck PDF.",
    channels: ["email"],
  },
  {
    key: "support.adminMessage",
    groupId: "support",
    label: "Direct messages from FridayReport admins",
    description: "Direct emails sent to you by a FridayReport.AI administrator.",
    channels: ["email"],
  },
  {
    key: "support.enterpriseInquiry",
    groupId: "support",
    label: "Enterprise inquiry updates",
    description: "Confirmations when you submit an enterprise sales inquiry.",
    channels: ["email"],
  },
];

const CATALOG_BY_KEY: Map<string, NotificationDefinition> = new Map(
  NOTIFICATION_CATALOG.map((entry) => [entry.key, entry])
);

export function getNotificationDefinition(key: string): NotificationDefinition | undefined {
  return CATALOG_BY_KEY.get(key);
}

export function notificationSupportsChannel(key: string, channel: NotificationChannel): boolean {
  const def = CATALOG_BY_KEY.get(key);
  return !!def && def.channels.includes(channel);
}

export function isRequiredNotification(key: string): boolean {
  return CATALOG_BY_KEY.get(key)?.required === true;
}

export function defaultPreferenceFor(_key: string, _channel: NotificationChannel): boolean {
  return true;
}

export function preferenceFieldId(key: string, channel: NotificationChannel): string {
  return `${key}.${channel}`;
}

export interface NotificationPreferenceCatalogPayload {
  groups: NotificationGroup[];
  entries: NotificationDefinition[];
  allEmailMasterKey: string;
}

export function getNotificationCatalogPayload(): NotificationPreferenceCatalogPayload {
  return {
    groups: [...NOTIFICATION_GROUPS].sort((a, b) => a.sortOrder - b.sortOrder),
    entries: NOTIFICATION_CATALOG,
    allEmailMasterKey: ALL_EMAIL_MASTER_KEY,
  };
}

export function isAllEmailDisabled(prefs: Record<string, boolean> | null | undefined): boolean {
  if (!prefs) return false;
  const v = prefs[`${ALL_EMAIL_MASTER_KEY}.email`];
  return v === false;
}

export function isGroupMasterDisabled(
  prefs: Record<string, boolean> | null | undefined,
  groupId: string,
  channel: NotificationChannel,
): boolean {
  if (!prefs) return false;
  return prefs[groupMasterFieldId(groupId, channel)] === false;
}

export function resolvePreference(
  prefs: Record<string, boolean> | null | undefined,
  key: string,
  channel: NotificationChannel,
): boolean {
  const def = CATALOG_BY_KEY.get(key);
  if (def?.required) return true;
  if (channel === "email" && isAllEmailDisabled(prefs) && !def?.required) return false;
  if (def && isGroupMasterDisabled(prefs, def.groupId, channel) && !def.required) return false;
  if (!prefs) return defaultPreferenceFor(key, channel);
  const stored = prefs[preferenceFieldId(key, channel)];
  if (typeof stored === "boolean") return stored;
  return defaultPreferenceFor(key, channel);
}

export function sanitizePreferenceUpdate(
  partial: Record<string, unknown>,
): { sanitized: Record<string, boolean>; rejected: string[] } {
  const sanitized: Record<string, boolean> = {};
  const rejected: string[] = [];
  for (const [field, value] of Object.entries(partial)) {
    if (typeof value !== "boolean") {
      rejected.push(field);
      continue;
    }
    const lastDot = field.lastIndexOf(".");
    if (lastDot <= 0) {
      rejected.push(field);
      continue;
    }
    const key = field.slice(0, lastDot);
    const channel = field.slice(lastDot + 1) as NotificationChannel;
    if (channel !== "email" && channel !== "inApp") {
      rejected.push(field);
      continue;
    }
    if (key === ALL_EMAIL_MASTER_KEY) {
      if (channel !== "email") {
        rejected.push(field);
        continue;
      }
      sanitized[field] = value;
      continue;
    }
    if (key.startsWith(GROUP_MASTER_PREFIX)) {
      const groupId = key.slice(GROUP_MASTER_PREFIX.length);
      const known = NOTIFICATION_GROUPS.some((g) => g.id === groupId);
      if (!known) {
        rejected.push(field);
        continue;
      }
      if (channel !== "email" && channel !== "inApp") {
        rejected.push(field);
        continue;
      }
      sanitized[field] = value;
      continue;
    }
    const def = CATALOG_BY_KEY.get(key);
    if (!def) {
      rejected.push(field);
      continue;
    }
    if (!def.channels.includes(channel)) {
      rejected.push(field);
      continue;
    }
    if (def.required && value === false) {
      rejected.push(field);
      continue;
    }
    sanitized[field] = value;
  }
  return { sanitized, rejected };
}
