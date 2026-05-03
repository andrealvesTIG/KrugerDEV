import { db } from "../db";
import { projectAgents, projectAgentLogs, projects, tasks, issues, users, resources } from "@shared/schema";
import { eq, and, sql, lte, isNotNull, not, inArray } from "drizzle-orm";
import { sendEmail } from "./email";
import OpenAI from "openai";
import { withAiCredits, resolveSystemUserId } from "./aiCredits";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Resolve who to charge for a scheduled/on-demand agent action. If a
 * `triggerUserId` is supplied (on-demand button), charge them. Otherwise
 * (scheduled cron) charge the org owner. Returns null when the org has
 * no owner — callers MUST warn-skip the AI call rather than silently
 * bypass billing.
 */
async function resolveAgentChargeUser(projectId: number, triggerUserId: string | null): Promise<{ userId: string; orgId: number | null } | null> {
  const [proj] = await db.select({ organizationId: projects.organizationId })
    .from(projects).where(eq(projects.id, projectId));
  const orgId = proj?.organizationId ?? null;
  if (triggerUserId) return { userId: triggerUserId, orgId };
  if (!orgId) return null;
  const userId = await resolveSystemUserId(orgId);
  if (!userId) return null;
  return { userId, orgId };
}

interface StakeholderEmails {
  managerEmail: string | null;
  sponsorEmail: string | null;
  techLeadEmail: string | null;
}

export async function getProjectStakeholders(projectId: number): Promise<StakeholderEmails> {
  const [project] = await db.select({
    managerId: projects.managerId,
    businessSponsorId: projects.businessSponsorId,
    technicalLeadId: projects.technicalLeadId,
  }).from(projects).where(eq(projects.id, projectId));

  if (!project) return { managerEmail: null, sponsorEmail: null, techLeadEmail: null };

  const userIds = [project.managerId, project.businessSponsorId, project.technicalLeadId].filter(Boolean) as string[];
  if (userIds.length === 0) return { managerEmail: null, sponsorEmail: null, techLeadEmail: null };

  const userRecords = await db.select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, userIds));

  const emailMap = new Map(userRecords.map(u => [u.id, u.email]));

  return {
    managerEmail: project.managerId ? emailMap.get(project.managerId) || null : null,
    sponsorEmail: project.businessSponsorId ? emailMap.get(project.businessSponsorId) || null : null,
    techLeadEmail: project.technicalLeadId ? emailMap.get(project.technicalLeadId) || null : null,
  };
}

function wrapEmailHtml(title: string, content: string, projectName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
<tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px">
<h1 style="color:#fff;margin:0;font-size:20px">${title}</h1>
<p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:13px">${projectName}</p>
</td></tr>
<tr><td style="padding:24px 32px">${content}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
<p style="color:#9ca3af;font-size:11px;margin:0">Sent by AI Project Agent &middot; <a href="https://fridayreport.ai" style="color:#6366f1">FridayReport.AI</a></p>
<p style="margin:8px 0 0;font-size:11px"><a href="https://fridayreport.ai/profile?section=notifications" style="color:#9ca3af;text-decoration:underline">Manage notification preferences</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function getProjectContext(projectId: number) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;

  const allTasks = await db.select().from(tasks)
    .where(and(eq(tasks.projectId, projectId), sql`${tasks.deletedAt} IS NULL`));

  const allIssues = await db.select().from(issues)
    .where(and(eq(issues.projectId, projectId), sql`${issues.deletedAt} IS NULL`));

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Tasks/issues use canonical title-case status values from STATUS_ENUMS
  // (server/openapi-schemas.ts). Comparing against lowercase strings here
  // would always be false and silently produce empty agendas/follow-ups.
  const completedTasks = allTasks.filter(t => t.status === 'Completed').slice(-5);
  const inProgressTasks = allTasks.filter(t => t.status === 'In Progress');
  const overdueTasks = allTasks.filter(t =>
    t.endDate && new Date(t.endDate) < now && t.status !== 'Completed' && t.status !== 'Cancelled'
  );
  const upcomingDeadlines = allTasks.filter(t =>
    t.endDate && new Date(t.endDate) >= now && new Date(t.endDate) <= weekFromNow && t.status !== 'Completed'
  );
  const openIssues = allIssues.filter(i => i.status !== 'Closed' && i.status !== 'Resolved');

  return {
    project,
    allTasks,
    completedTasks,
    inProgressTasks,
    overdueTasks,
    upcomingDeadlines,
    openIssues,
    totalTasks: allTasks.length,
    completionPct: allTasks.length > 0 ? Math.round(completedTasks.length / allTasks.length * 100) : 0,
  };
}

export async function runMeetingAgenda(agentId: number, projectId: number, triggerUserId: string | null = null): Promise<void> {
  const ctx = await getProjectContext(projectId);
  if (!ctx) throw new Error("Project not found");

  const stakeholders = await getProjectStakeholders(projectId);
  const recipients = [stakeholders.managerEmail, stakeholders.sponsorEmail, stakeholders.techLeadEmail].filter(Boolean) as string[];

  if (recipients.length === 0) {
    await logAgentAction(agentId, projectId, "meeting_agenda", "Meeting Agenda", [], "skipped", "No stakeholder emails configured");
    return;
  }

  const charge = await resolveAgentChargeUser(projectId, triggerUserId);
  if (!charge) {
    console.warn(`[agent] Skipping meeting agenda for project ${projectId}: no eligible user to bill credits to.`);
    await logAgentAction(agentId, projectId, "meeting_agenda", "Meeting Agenda", recipients, "skipped", "No org owner/admin to bill AI credits");
    return;
  }

  const contextSummary = `
Project: ${ctx.project.name}
Completion: ${ctx.completionPct}%
Recently completed: ${ctx.completedTasks.map(t => `- ${t.name}`).join('\n') || 'None'}
In progress: ${ctx.inProgressTasks.map(t => `- ${t.name} (${t.progress || 0}%)`).join('\n') || 'None'}
Upcoming deadlines (7 days): ${ctx.upcomingDeadlines.map(t => `- ${t.name} (due ${t.endDate})`).join('\n') || 'None'}
Overdue: ${ctx.overdueTasks.map(t => `- ${t.name} (was due ${t.endDate})`).join('\n') || 'None'}
Open issues: ${ctx.openIssues.map(i => `- [${i.priority || 'medium'}] ${i.title}`).join('\n') || 'None'}`;

  try {
    const completion = await withAiCredits(
      { userId: charge.userId, orgId: charge.orgId, action: "agent_meeting_agenda", entityId: projectId },
      () => openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a project management assistant. Generate a structured meeting agenda in HTML format with these sections: Wins & Accomplishments, Current Focus, Upcoming Deadlines, Blockers & Risks, Discussion Points, and Action Items. Use clean HTML with <h3> for sections, <ul>/<li> for items. Be concise and actionable."
          },
          { role: "user", content: `Generate a meeting agenda for this project:\n${contextSummary}` }
        ],
        max_tokens: 1500,
      }),
    );

    const agendaHtml = completion.choices[0]?.message?.content || "<p>Unable to generate agenda</p>";
    const subject = `Meeting Agenda: ${ctx.project.name}`;
    const emailHtml = wrapEmailHtml("Weekly Meeting Agenda", agendaHtml, ctx.project.name);

    const { shouldSendEmailToAddress } = await import("./userNotificationPreferences");
    for (const to of recipients) {
      if (!(await shouldSendEmailToAddress(to, "ai.meetingAgenda"))) continue;
      await sendEmail({ to, subject, text: `Meeting agenda for ${ctx.project.name}`, html: emailHtml });
    }

    await logAgentAction(agentId, projectId, "meeting_agenda", subject, recipients, "success", null, agendaHtml.substring(0, 2000));
  } catch (err: any) {
    await logAgentAction(agentId, projectId, "meeting_agenda", `Meeting Agenda: ${ctx.project.name}`, recipients, "error", err.message);
    throw err;
  }
}

export async function runTaskFollowUp(agentId: number, projectId: number, _triggerUserId: string | null = null): Promise<void> {
  const ctx = await getProjectContext(projectId);
  if (!ctx) throw new Error("Project not found");

  const stakeholders = await getProjectStakeholders(projectId);
  const now = new Date();
  const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const overdueTasks = ctx.allTasks.filter(t =>
    t.endDate && new Date(t.endDate) < now && t.status !== 'Completed' && t.status !== 'Cancelled'
  );
  const approachingTasks = ctx.allTasks.filter(t =>
    t.endDate && new Date(t.endDate) >= now && new Date(t.endDate) <= threeDaysOut && t.status !== 'Completed'
  );

  if (overdueTasks.length === 0 && approachingTasks.length === 0) {
    await logAgentAction(agentId, projectId, "task_follow_up", "Task Follow-Up", [], "skipped", "No overdue or approaching tasks");
    return;
  }

  const allRecipients: string[] = [];

  if (stakeholders.managerEmail) {
    const allIncompleteTasks = ctx.allTasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
    const overdueSection = overdueTasks.map(t => `<li><strong>${t.name}</strong> — due ${t.endDate}</li>`).join('');
    const inProgressSection = ctx.inProgressTasks.map(t => `<li>${t.name} (${t.progress || 0}%)</li>`).join('');
    const notStartedSection = allIncompleteTasks.filter(t => t.status === 'Not Started' || !t.status).map(t => `<li>${t.name}</li>`).join('');

    let digestHtml = `<h3>PM Digest: All Incomplete Tasks</h3>`;
    if (overdueSection) digestHtml += `<h4 style="color:#ef4444">Overdue (${overdueTasks.length})</h4><ul>${overdueSection}</ul>`;
    if (inProgressSection) digestHtml += `<h4>In Progress (${ctx.inProgressTasks.length})</h4><ul>${inProgressSection}</ul>`;
    if (notStartedSection) digestHtml += `<h4 style="color:#6b7280">Not Started</h4><ul>${notStartedSection}</ul>`;

    const emailHtml = wrapEmailHtml("Task Follow-Up Digest", digestHtml, ctx.project.name);
    const { shouldSendEmailToAddress } = await import("./userNotificationPreferences");
    if (await shouldSendEmailToAddress(stakeholders.managerEmail, "ai.followUp")) {
      await sendEmail({
        to: stakeholders.managerEmail,
        subject: `Task Follow-Up: ${ctx.project.name} — ${overdueTasks.length} overdue`,
        text: `Task follow-up digest for ${ctx.project.name}`,
        html: emailHtml,
      });
      allRecipients.push(stakeholders.managerEmail);
    }
  }

  await logAgentAction(agentId, projectId, "task_follow_up",
    `Task Follow-Up: ${overdueTasks.length} overdue, ${approachingTasks.length} approaching`,
    allRecipients, "success", null,
    `Overdue: ${overdueTasks.length}, Approaching: ${approachingTasks.length}`);
}

export async function runStatusReport(agentId: number, projectId: number, _triggerUserId: string | null = null): Promise<void> {
  const ctx = await getProjectContext(projectId);
  if (!ctx) throw new Error("Project not found");

  const stakeholders = await getProjectStakeholders(projectId);
  const recipients = [stakeholders.managerEmail, stakeholders.sponsorEmail, stakeholders.techLeadEmail].filter(Boolean) as string[];

  if (recipients.length === 0) {
    await logAgentAction(agentId, projectId, "status_report", "Status Report", [], "skipped", "No stakeholder emails configured");
    return;
  }

  const healthColor = ctx.overdueTasks.length > 3 || ctx.completionPct < 20 ? "#ef4444"
    : ctx.overdueTasks.length > 0 ? "#f59e0b" : "#10b981";
  const healthLabel = healthColor === "#ef4444" ? "Red" : healthColor === "#f59e0b" ? "Yellow" : "Green";

  let reportHtml = `
<div style="background:${healthColor};color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:16px;text-align:center">
<strong>Project Health: ${healthLabel}</strong>
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
<tr>
<td style="padding:12px;border:1px solid #e5e7eb;text-align:center"><strong>${ctx.completionPct}%</strong><br><span style="color:#6b7280;font-size:12px">Complete</span></td>
<td style="padding:12px;border:1px solid #e5e7eb;text-align:center"><strong>${ctx.totalTasks}</strong><br><span style="color:#6b7280;font-size:12px">Total Tasks</span></td>
<td style="padding:12px;border:1px solid #e5e7eb;text-align:center"><strong>${ctx.inProgressTasks.length}</strong><br><span style="color:#6b7280;font-size:12px">In Progress</span></td>
<td style="padding:12px;border:1px solid #e5e7eb;text-align:center"><strong style="color:${ctx.overdueTasks.length > 0 ? '#ef4444' : 'inherit'}">${ctx.overdueTasks.length}</strong><br><span style="color:#6b7280;font-size:12px">Overdue</span></td>
</tr>
</table>`;

  const criticalIssues = ctx.openIssues.filter(i => i.priority === 'critical' || i.priority === 'high');
  if (criticalIssues.length > 0) {
    reportHtml += `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:16px">
<h4 style="color:#ef4444;margin:0 0 8px">High-Priority Issues (${criticalIssues.length})</h4>
<ul style="margin:0;padding-left:20px">${criticalIssues.map(i => `<li>${i.title}</li>`).join('')}</ul>
</div>`;
  }

  reportHtml += `<p style="color:#6b7280;font-size:13px">Open issues: ${ctx.openIssues.length}</p>`;

  const subject = `Status Report: ${ctx.project.name} — ${healthLabel}`;
  const emailHtml = wrapEmailHtml("Weekly Status Report", reportHtml, ctx.project.name);

  try {
    const { shouldSendEmailToAddress } = await import("./userNotificationPreferences");
    for (const to of recipients) {
      if (!(await shouldSendEmailToAddress(to, "ai.statusReport"))) continue;
      await sendEmail({ to, subject, text: `Status report for ${ctx.project.name}`, html: emailHtml });
    }
    await logAgentAction(agentId, projectId, "status_report", subject, recipients, "success", null, reportHtml.substring(0, 2000));
  } catch (err: any) {
    await logAgentAction(agentId, projectId, "status_report", subject, recipients, "error", err.message);
    throw err;
  }
}

async function logAgentAction(
  agentId: number, projectId: number, actionType: string, subject: string,
  recipientEmails: string[], status: string, errorMessage?: string | null, emailPreview?: string
) {
  await db.insert(projectAgentLogs).values({
    projectAgentId: agentId,
    projectId,
    actionType,
    subject,
    recipientEmails,
    emailPreview: emailPreview?.substring(0, 2000),
    status,
    errorMessage,
  });
}

// Resolve the UTC instant that corresponds to a given local wall-clock time
// (y/mo/d at h:m) in the named IANA timezone. Two passes cover DST/offset
// shifts. Used by calculateNextWeeklyRun so that a user picking "Sunday
// 16:42 America/New_York" actually fires at 16:42 ET (not 16:42 UTC).
function utcInstantForLocalTz(
  y: number, mo: number, d: number, h: number, m: number, timezone: string,
): Date {
  let guess = new Date(Date.UTC(y, mo - 1, d, h, m, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  for (let i = 0; i < 2; i++) {
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(guess)) parts[p.type] = p.value;
    const hourNum = parts.hour === "24" ? 0 : parseInt(parts.hour, 10);
    const shownUtc = Date.UTC(
      parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10),
      hourNum, parseInt(parts.minute, 10),
    );
    const wantUtc = Date.UTC(y, mo - 1, d, h, m);
    const diff = shownUtc - wantUtc;
    if (diff === 0) return guess;
    guess = new Date(guess.getTime() - diff);
  }
  return guess;
}

function dayOfWeekInTz(y: number, mo: number, d: number, timezone: string): number {
  const noonUtc = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const wk = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(noonUtc);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wk] ?? 0;
}

export function calculateNextWeeklyRun(dayOfWeek: number, timeStr: string, timezone: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  const tz = timezone || "UTC";
  // Walk forward day-by-day in the target timezone (up to 14 days to cover
  // DST + same-day-still-future cases) and pick the first instant that lands
  // on the requested weekday at h:m and is strictly in the future.
  for (let offset = 0; offset < 14; offset++) {
    const probe = new Date(now.getTime() + offset * 86_400_000);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(probe);
    const [y, mo, d] = ymd.split("-").map(Number);
    if (dayOfWeekInTz(y, mo, d, tz) !== dayOfWeek) continue;
    const candidate = utcInstantForLocalTz(y, mo, d, hours, minutes, tz);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  // Defensive fallback: a week from now at the requested wall time, UTC.
  const fallback = new Date(now.getTime() + 7 * 86_400_000);
  fallback.setUTCHours(hours, minutes, 0, 0);
  return fallback;
}

export async function checkAndRunDueAgentActions(): Promise<number> {
  const now = new Date();
  let actionsExecuted = 0;

  const dueAgents = await db.select().from(projectAgents)
    .where(and(
      eq(projectAgents.enabled, true),
      sql`(
        (${projectAgents.agendaEnabled} = true AND ${projectAgents.nextAgendaRun} IS NOT NULL AND ${projectAgents.nextAgendaRun} <= ${now})
        OR (${projectAgents.taskFollowUpEnabled} = true AND ${projectAgents.nextTaskFollowUpRun} IS NOT NULL AND ${projectAgents.nextTaskFollowUpRun} <= ${now})
        OR (${projectAgents.statusReportEnabled} = true AND ${projectAgents.nextStatusReportRun} IS NOT NULL AND ${projectAgents.nextStatusReportRun} <= ${now})
      )`
    ));

  for (const agent of dueAgents) {
    if (agent.agendaEnabled && agent.nextAgendaRun && agent.nextAgendaRun <= now) {
      try {
        await runMeetingAgenda(agent.id, agent.projectId);
        actionsExecuted++;
      } catch (err) {
        console.error(`[agent] Meeting agenda failed for project ${agent.projectId}:`, err);
      }
      await db.update(projectAgents).set({
        lastAgendaRun: now,
        nextAgendaRun: calculateNextWeeklyRun(agent.agendaDay, agent.agendaTime, agent.timezone),
      }).where(eq(projectAgents.id, agent.id));
    }

    if (agent.taskFollowUpEnabled && agent.nextTaskFollowUpRun && agent.nextTaskFollowUpRun <= now) {
      try {
        await runTaskFollowUp(agent.id, agent.projectId);
        actionsExecuted++;
      } catch (err) {
        console.error(`[agent] Task follow-up failed for project ${agent.projectId}:`, err);
      }
      await db.update(projectAgents).set({
        lastTaskFollowUpRun: now,
        nextTaskFollowUpRun: calculateNextWeeklyRun(agent.taskFollowUpDay, agent.taskFollowUpTime, agent.timezone),
      }).where(eq(projectAgents.id, agent.id));
    }

    if (agent.statusReportEnabled && agent.nextStatusReportRun && agent.nextStatusReportRun <= now) {
      try {
        await runStatusReport(agent.id, agent.projectId);
        actionsExecuted++;
      } catch (err) {
        console.error(`[agent] Status report failed for project ${agent.projectId}:`, err);
      }
      await db.update(projectAgents).set({
        lastStatusReportRun: now,
        nextStatusReportRun: calculateNextWeeklyRun(agent.statusReportDay, agent.statusReportTime, agent.timezone),
      }).where(eq(projectAgents.id, agent.id));
    }
  }

  return actionsExecuted;
}
