import { db } from "../db";
import { reportSubscriptions, users, organizations, timesheetEntries, projects, portfolios, resources, issues } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { sendEmail } from "./email";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addWeeks, addMonths } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export const AVAILABLE_DASHBOARDS = [
  { id: "timesheet-overview", name: "Timesheet Overview", description: "Monthly compliance, approval status, and team performance" },
  { id: "timesheet-weekly", name: "Weekly Summary", description: "Week-over-week trends and daily breakdowns" },
  { id: "timesheet-project", name: "Project Hours", description: "Time distribution across projects" },
  { id: "timesheet-resource", name: "Resource Hours", description: "Hours logged vs goals per resource" },
  { id: "portfolio-health", name: "Portfolio Health", description: "Portfolio status overview with project health indicators" },
  { id: "project-status", name: "Project Status", description: "Project status summary with milestones and risks" },
  { id: "risks-issues", name: "Risks & Issues", description: "Open risks and issues requiring attention" },
];

interface DashboardData {
  id: string;
  name: string;
  summary: string;
  metrics: { label: string; value: string | number; trend?: string }[];
}

async function getTimesheetOverviewData(organizationId: number): Promise<DashboardData> {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  
  const entries = await db.select()
    .from(timesheetEntries)
    .where(
      and(
        eq(timesheetEntries.organizationId, organizationId),
        lte(timesheetEntries.entryDate, monthEnd.toISOString().split('T')[0])
      )
    );
  
  const thisMonthEntries = entries.filter(e => {
    const entryDate = new Date(e.entryDate);
    return entryDate >= monthStart && entryDate <= monthEnd;
  });
  
  const totalHours = thisMonthEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const approvedEntries = thisMonthEntries.filter(e => e.status === 'approved');
  const approvalRate = thisMonthEntries.length > 0 
    ? Math.round((approvedEntries.length / thisMonthEntries.length) * 100) 
    : 0;
  const pendingCount = thisMonthEntries.filter(e => e.status === 'pending' || e.status === 'submitted').length;
  
  return {
    id: "timesheet-overview",
    name: "Timesheet Overview",
    summary: `${format(monthStart, 'MMMM yyyy')} Summary`,
    metrics: [
      { label: "Total Hours Logged", value: totalHours.toFixed(1) },
      { label: "Approval Rate", value: `${approvalRate}%` },
      { label: "Pending Approvals", value: pendingCount },
      { label: "Total Entries", value: thisMonthEntries.length },
    ],
  };
}

async function getTimesheetWeeklyData(organizationId: number): Promise<DashboardData> {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  
  const entries = await db.select()
    .from(timesheetEntries)
    .where(eq(timesheetEntries.organizationId, organizationId));
  
  const thisWeekEntries = entries.filter(e => {
    const entryDate = new Date(e.entryDate);
    return entryDate >= weekStart && entryDate <= weekEnd;
  });
  
  const totalHours = thisWeekEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const uniqueResources = new Set(thisWeekEntries.map(e => e.resourceId)).size;
  const avgHoursPerDay = totalHours / 5;
  
  return {
    id: "timesheet-weekly",
    name: "Weekly Summary",
    summary: `Week of ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
    metrics: [
      { label: "Total Hours This Week", value: totalHours.toFixed(1) },
      { label: "Active Team Members", value: uniqueResources },
      { label: "Avg Hours/Day", value: avgHoursPerDay.toFixed(1) },
    ],
  };
}

async function getTimesheetProjectData(organizationId: number): Promise<DashboardData> {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  
  const entries = await db.select()
    .from(timesheetEntries)
    .where(eq(timesheetEntries.organizationId, organizationId));
  
  const thisMonthEntries = entries.filter(e => {
    const entryDate = new Date(e.entryDate);
    return entryDate >= monthStart && entryDate <= monthEnd;
  });
  
  const projectHours: Record<number, number> = {};
  thisMonthEntries.forEach(e => {
    if (e.projectId) {
      projectHours[e.projectId] = (projectHours[e.projectId] || 0) + (Number(e.hours) || 0);
    }
  });
  
  const projectCount = Object.keys(projectHours).length;
  const totalHours = Object.values(projectHours).reduce((sum, h) => sum + h, 0);
  
  return {
    id: "timesheet-project",
    name: "Project Hours",
    summary: `${format(monthStart, 'MMMM yyyy')} Distribution`,
    metrics: [
      { label: "Total Project Hours", value: totalHours.toFixed(1) },
      { label: "Active Projects", value: projectCount },
      { label: "Avg Hours/Project", value: projectCount > 0 ? (totalHours / projectCount).toFixed(1) : "0" },
    ],
  };
}

async function getTimesheetResourceData(organizationId: number): Promise<DashboardData> {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  
  const entries = await db.select()
    .from(timesheetEntries)
    .where(eq(timesheetEntries.organizationId, organizationId));
  
  const thisMonthEntries = entries.filter(e => {
    const entryDate = new Date(e.entryDate);
    return entryDate >= monthStart && entryDate <= monthEnd;
  });
  
  const resourceHours: Record<number, number> = {};
  thisMonthEntries.forEach(e => {
    if (e.resourceId) {
      resourceHours[e.resourceId] = (resourceHours[e.resourceId] || 0) + (Number(e.hours) || 0);
    }
  });
  
  const resourceCount = Object.keys(resourceHours).length;
  const totalHours = Object.values(resourceHours).reduce((sum, h) => sum + h, 0);
  const avgHours = resourceCount > 0 ? totalHours / resourceCount : 0;
  
  return {
    id: "timesheet-resource",
    name: "Resource Hours",
    summary: `${format(monthStart, 'MMMM yyyy')} Performance`,
    metrics: [
      { label: "Total Team Hours", value: totalHours.toFixed(1) },
      { label: "Active Resources", value: resourceCount },
      { label: "Avg Hours/Resource", value: avgHours.toFixed(1) },
    ],
  };
}

async function getPortfolioHealthData(organizationId: number): Promise<DashboardData> {
  const portfolioData = await db.select()
    .from(portfolios)
    .where(eq(portfolios.organizationId, organizationId));
  
  const projectData = await db.select()
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
  
  const activeProjects = projectData.filter(p => p.status !== 'Closing' && p.status !== 'Completed' && p.status !== 'Cancelled');
  const greenProjects = activeProjects.filter(p => p.health === 'Green').length;
  const yellowProjects = activeProjects.filter(p => p.health === 'Yellow').length;
  const redProjects = activeProjects.filter(p => p.health === 'Red').length;
  
  return {
    id: "portfolio-health",
    name: "Portfolio Health",
    summary: "Current Portfolio Status",
    metrics: [
      { label: "Total Portfolios", value: portfolioData.length },
      { label: "Active Projects", value: activeProjects.length },
      { label: "Green Status", value: greenProjects },
      { label: "Yellow Status", value: yellowProjects },
      { label: "Red Status", value: redProjects },
    ],
  };
}

async function getProjectStatusData(organizationId: number): Promise<DashboardData> {
  const projectData = await db.select()
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
  
  const activeProjects = projectData.filter(p => p.status !== 'Closing' && p.status !== 'Completed' && p.status !== 'Cancelled');
  const completedProjects = projectData.filter(p => p.status === 'Closing' || p.status === 'Completed');
  const inProgressProjects = projectData.filter(p => p.status === 'Execution' || p.status === 'In Progress');
  const initiationProjects = projectData.filter(p => p.status === 'Initiation');
  
  return {
    id: "project-status",
    name: "Project Status",
    summary: "Project Overview",
    metrics: [
      { label: "Total Projects", value: projectData.length },
      { label: "Initiation", value: initiationProjects.length },
      { label: "In Progress", value: inProgressProjects.length },
      { label: "Completed", value: completedProjects.length },
      { label: "Active", value: activeProjects.length },
    ],
  };
}

async function getRisksIssuesData(organizationId: number): Promise<DashboardData> {
  // Get projects for this organization first, then get their issues
  const orgProjects = await db.select()
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
  
  const projectIds = orgProjects.map(p => p.id);
  
  if (projectIds.length === 0) {
    return {
      id: "risks-issues",
      name: "Risks & Issues",
      summary: "Items Requiring Attention",
      metrics: [
        { label: "Open Issues", value: 0 },
        { label: "Open Risks", value: 0 },
        { label: "High Priority", value: 0 },
        { label: "Total Items", value: 0 },
      ],
    };
  }
  
  const issueData = await db.select()
    .from(issues)
    .where(sql`${issues.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`);
  
  const openIssues = issueData.filter(i => i.status !== 'Closed' && i.status !== 'Resolved');
  const risks = issueData.filter(i => i.itemType === 'risk');
  const openRisks = risks.filter(r => r.status !== 'Closed' && r.status !== 'Mitigated');
  const highPriorityIssues = openIssues.filter(i => i.priority === 'Critical' || i.priority === 'High');
  
  return {
    id: "risks-issues",
    name: "Risks & Issues",
    summary: "Items Requiring Attention",
    metrics: [
      { label: "Open Issues", value: openIssues.filter(i => i.itemType !== 'risk').length },
      { label: "Open Risks", value: openRisks.length },
      { label: "High Priority", value: highPriorityIssues.length },
      { label: "Total Items", value: issueData.length },
    ],
  };
}

async function getDashboardData(dashboardId: string, organizationId: number): Promise<DashboardData | null> {
  switch (dashboardId) {
    case "timesheet-overview":
      return getTimesheetOverviewData(organizationId);
    case "timesheet-weekly":
      return getTimesheetWeeklyData(organizationId);
    case "timesheet-project":
      return getTimesheetProjectData(organizationId);
    case "timesheet-resource":
      return getTimesheetResourceData(organizationId);
    case "portfolio-health":
      return getPortfolioHealthData(organizationId);
    case "project-status":
      return getProjectStatusData(organizationId);
    case "risks-issues":
      return getRisksIssuesData(organizationId);
    default:
      return null;
  }
}

function generateReportEmailHtml(
  subscriptionName: string, 
  organizationName: string, 
  dashboardData: DashboardData[],
  appUrl: string
): string {
  const dashboardsHtml = dashboardData.map(dashboard => `
    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 18px;">${dashboard.name}</h3>
      <p style="margin: 0 0 16px 0; color: #64748b; font-size: 14px;">${dashboard.summary}</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          ${dashboard.metrics.map((metric, idx) => `
            <tr style="border-bottom: ${idx < dashboard.metrics.length - 1 ? '1px solid #e2e8f0' : 'none'};">
              <td style="padding: 10px 0; color: #475569; font-size: 14px;">${metric.label}</td>
              <td style="padding: 10px 0; text-align: right; color: #0f172a; font-size: 16px; font-weight: 600;">${metric.value}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">📊 ${subscriptionName}</h1>
        <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${organizationName}</p>
      </div>
      
      <div style="padding: 30px;">
        <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px;">
          Here's your scheduled report summary generated on ${format(new Date(), 'MMMM d, yyyy')} at ${format(new Date(), 'h:mm a')}.
        </p>
        
        ${dashboardsHtml}
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${appUrl}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">View Full Dashboard</a>
        </div>
      </div>
      
      <div style="background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          You're receiving this because you subscribed to scheduled reports.<br>
          <a href="${appUrl}/settings/reports" style="color: #3b82f6; text-decoration: none;">Manage your report subscriptions</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export function calculateNextScheduledTime(
  frequency: string,
  timeOfDay: string,
  timezone: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  fromDate: Date = new Date()
): Date {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  
  let nextDate = new Date(fromDate);
  nextDate.setHours(hours, minutes, 0, 0);
  
  // Convert to user's timezone for calculation
  const zonedNow = toZonedTime(new Date(), timezone);
  const zonedNext = toZonedTime(nextDate, timezone);
  
  switch (frequency) {
    case 'daily':
      // If time already passed today, schedule for tomorrow
      if (zonedNext <= zonedNow) {
        nextDate = addDays(nextDate, 1);
      }
      break;
      
    case 'weekly':
      const targetDay = dayOfWeek ?? 1; // Default to Monday
      const currentDay = zonedNow.getDay();
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget < 0 || (daysUntilTarget === 0 && zonedNext <= zonedNow)) {
        daysUntilTarget += 7;
      }
      nextDate = addDays(fromDate, daysUntilTarget);
      nextDate.setHours(hours, minutes, 0, 0);
      break;
      
    case 'monthly':
      const targetDayOfMonth = dayOfMonth ?? 1; // Default to 1st
      nextDate = new Date(fromDate.getFullYear(), fromDate.getMonth(), targetDayOfMonth, hours, minutes, 0, 0);
      // If date already passed this month, move to next month
      if (nextDate <= fromDate) {
        nextDate = addMonths(nextDate, 1);
      }
      break;
  }
  
  // Convert back from user's timezone to UTC for storage
  return fromZonedTime(nextDate, timezone);
}

export async function sendScheduledReport(subscriptionId: number): Promise<boolean> {
  try {
    const [subscription] = await db.select()
      .from(reportSubscriptions)
      .where(eq(reportSubscriptions.id, subscriptionId));
    
    if (!subscription || !subscription.isActive) {
      return false;
    }
    
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, subscription.userId));
    
    const [org] = await db.select()
      .from(organizations)
      .where(eq(organizations.id, subscription.organizationId));
    
    if (!user || !org) {
      console.error(`Cannot send report: user or org not found for subscription ${subscriptionId}`);
      return false;
    }
    
    // Gather dashboard data
    const dashboardData: DashboardData[] = [];
    for (const dashboardId of subscription.dashboards) {
      const data = await getDashboardData(dashboardId, subscription.organizationId);
      if (data) {
        dashboardData.push(data);
      }
    }
    
    if (dashboardData.length === 0) {
      console.error(`No dashboard data generated for subscription ${subscriptionId}`);
      return false;
    }
    
    const appUrl = process.env.REPLIT_DOMAINS?.split(',')[0] 
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'https://fridayreport.ai';
    
    const emailHtml = generateReportEmailHtml(
      subscription.name,
      org.name,
      dashboardData,
      appUrl
    );
    
    const recipients = [user.email];
    if (subscription.recipients && subscription.recipients.length > 0) {
      recipients.push(...subscription.recipients);
    }
    
    // Send to all recipients
    for (const recipient of recipients) {
      if (recipient) {
        await sendEmail({
          to: recipient,
          subject: `📊 ${subscription.name} - ${format(new Date(), 'MMM d, yyyy')}`,
          text: `Your scheduled report "${subscription.name}" is ready. View it at ${appUrl}`,
          html: emailHtml,
        });
      }
    }
    
    // Update subscription with last sent time and calculate next scheduled time
    const nextScheduled = calculateNextScheduledTime(
      subscription.frequency,
      subscription.timeOfDay,
      subscription.timezone,
      subscription.dayOfWeek,
      subscription.dayOfMonth,
      new Date()
    );
    
    await db.update(reportSubscriptions)
      .set({
        lastSentAt: new Date(),
        nextScheduledAt: nextScheduled,
        updatedAt: new Date(),
      })
      .where(eq(reportSubscriptions.id, subscriptionId));
    
    return true;
  } catch (error) {
    console.error(`Error sending scheduled report ${subscriptionId}:`, error);
    return false;
  }
}

export async function checkAndSendDueReports(): Promise<number> {
  const now = new Date();
  
  // Find all active subscriptions that are due
  const dueSubscriptions = await db.select()
    .from(reportSubscriptions)
    .where(
      and(
        eq(reportSubscriptions.isActive, true),
        lte(reportSubscriptions.nextScheduledAt, now)
      )
    );
  
  let sentCount = 0;
  for (const subscription of dueSubscriptions) {
    const success = await sendScheduledReport(subscription.id);
    if (success) {
      sentCount++;
    }
  }
  
  return sentCount;
}

export async function initializeSubscriptionSchedule(subscriptionId: number): Promise<void> {
  const [subscription] = await db.select()
    .from(reportSubscriptions)
    .where(eq(reportSubscriptions.id, subscriptionId));
  
  if (!subscription) return;
  
  const nextScheduled = calculateNextScheduledTime(
    subscription.frequency,
    subscription.timeOfDay,
    subscription.timezone,
    subscription.dayOfWeek,
    subscription.dayOfMonth
  );
  
  await db.update(reportSubscriptions)
    .set({ nextScheduledAt: nextScheduled })
    .where(eq(reportSubscriptions.id, subscriptionId));
}
