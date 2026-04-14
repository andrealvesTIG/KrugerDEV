import type { Express } from "express";
import { db } from "../db";
import { eq, sql, isNull } from "drizzle-orm";
import {
  users, organizations, userActivityLogs,
} from "@shared/schema";
import { getUserIdFromRequest, hasAdminAccess } from "./helpers";
import { apiRoute, r200, authRes, stdRes, qStr } from "../route-registry";

export function registerUserActivityRoutes(app: Express) {

  apiRoute(app, 'get', '/api/admin/user-activity-kpi', {
    tag: 'Admin',
    summary: 'Get user activity KPI dashboard data',
    responses: { ...r200('Activity KPIs'), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: "Super admin access required" });

      const now = new Date();

      const [[totalUsersRow], [activeUsers7dRow], [activeUsers30dRow], [avgActionsRow],
        [newUsersThisWeekRow], [newUsersLastWeekRow], [retentionRow],
        actionBreakdownRows, dailyActiveUsersRows, weeklyRetentionRows
      ] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int as count FROM users`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT COUNT(DISTINCT user_id)::int as count FROM user_activity_logs WHERE created_at >= NOW() - INTERVAL '7 days'`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT COUNT(DISTINCT user_id)::int as count FROM user_activity_logs WHERE created_at >= NOW() - INTERVAL '30 days'`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT COALESCE(ROUND(AVG(action_count)), 0)::int as avg_actions FROM (SELECT user_id, COUNT(*) as action_count FROM user_activity_logs WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY user_id) sub`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT COUNT(*)::int as count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT COUNT(*)::int as count FROM users WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT CASE WHEN total > 0 THEN ROUND((active::numeric / total) * 100) ELSE 0 END as rate FROM (SELECT (SELECT COUNT(*) FROM users WHERE created_at <= NOW() - INTERVAL '7 days') as total, (SELECT COUNT(DISTINCT ual.user_id) FROM user_activity_logs ual INNER JOIN users u ON u.id = ual.user_id WHERE ual.created_at >= NOW() - INTERVAL '7 days' AND u.created_at <= NOW() - INTERVAL '7 days') as active) sub`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT action, COUNT(*)::int as count FROM user_activity_logs WHERE created_at >= NOW() - INTERVAL '90 days' GROUP BY action ORDER BY count DESC LIMIT 20`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT TO_CHAR(DATE_TRUNC('day', created_at AT TIME ZONE 'UTC'), 'Mon DD') as date, COUNT(DISTINCT user_id)::int as count FROM user_activity_logs WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') ORDER BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')`).then(r => r.rows as Record<string, unknown>[]),

        db.execute(sql`SELECT w.week_start, w.active_users, (SELECT COUNT(*) FROM users WHERE created_at <= w.week_start + INTERVAL '7 days')::int as total_users FROM (SELECT DATE_TRUNC('week', created_at) as week_start, COUNT(DISTINCT user_id)::int as active_users FROM user_activity_logs WHERE created_at >= NOW() - INTERVAL '12 weeks' GROUP BY DATE_TRUNC('week', created_at)) w ORDER BY w.week_start`).then(r => r.rows as Record<string, unknown>[]),
      ]);

      const totalUsers = Number(totalUsersRow?.count ?? 0);
      const activeUsersLast7d = Number(activeUsers7dRow?.count ?? 0);
      const activeUsersLast30d = Number(activeUsers30dRow?.count ?? 0);
      const avgActionsPerUser = Number(avgActionsRow?.avg_actions ?? 0);
      const newUsersThisWeek = Number(newUsersThisWeekRow?.count ?? 0);
      const newUsersLastWeek = Number(newUsersLastWeekRow?.count ?? 0);
      const overallRetentionRate = Number(retentionRow?.rate ?? 0);

      const totalActionsBreakdown = actionBreakdownRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.count ?? 0), 0);
      const actionBreakdown = actionBreakdownRows.map((r: Record<string, unknown>) => ({
        action: humanizeAction(String(r.action ?? '')),
        count: Number(r.count ?? 0),
        percentage: totalActionsBreakdown > 0 ? Math.round(Number(r.count ?? 0) / totalActionsBreakdown * 100) : 0,
      }));

      const dailyActiveUsers = dailyActiveUsersRows.map((r: Record<string, unknown>) => ({
        date: String(r.date ?? ''),
        count: Number(r.count ?? 0),
      }));

      const weeklyRetentionTrend = weeklyRetentionRows.map((r: Record<string, unknown>) => {
        const total = Number(r.total_users ?? 0);
        const active = Number(r.active_users ?? 0);
        const weekDate = r.week_start ? new Date(String(r.week_start)) : new Date();
        return {
          week: weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          rate: total > 0 ? Math.round((active / total) * 100) : 0,
        };
      });

      const lifecyclePeriods = [
        { label: "Week 1", key: "w1", minDays: 0, maxDays: 7 },
        { label: "Week 2", key: "w2", minDays: 7, maxDays: 14 },
        { label: "Week 3-4", key: "w3_4", minDays: 14, maxDays: 28 },
        { label: "Month 2", key: "m2", minDays: 28, maxDays: 56 },
        { label: "Month 3", key: "m3", minDays: 56, maxDays: 84 },
        { label: "Months 4-6", key: "m4_6", minDays: 84, maxDays: 168 },
        { label: "Months 7-12", key: "m7_12", minDays: 168, maxDays: 336 },
        { label: "12+ months", key: "y2plus", minDays: 336, maxDays: 99999 },
      ];

      const cohortBoundaries = [
        { label: "Week 1", minDays: 0, maxDays: 7 },
        { label: "Week 2", minDays: 7, maxDays: 14 },
        { label: "Week 3-4", minDays: 14, maxDays: 28 },
        { label: "Month 2", minDays: 28, maxDays: 56 },
        { label: "Month 3", minDays: 56, maxDays: 84 },
        { label: "Months 4-6", minDays: 84, maxDays: 168 },
        { label: "Months 7-12", minDays: 168, maxDays: 336 },
        { label: "12+ months", minDays: 336, maxDays: 99999 },
      ];

      const allUsersRaw = await db.select({ id: users.id, createdAt: users.createdAt }).from(users);
      const allActivityRaw = await db.select({
        userId: userActivityLogs.userId,
        action: userActivityLogs.action,
        createdAt: userActivityLogs.createdAt,
      }).from(userActivityLogs);

      const cohorts = cohortBoundaries.map(cb => {
        const cohortUsers = allUsersRaw.filter(u => {
          if (!u.createdAt) return false;
          const da = Math.floor((now.getTime() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          return da >= cb.minDays && da < cb.maxDays;
        });
        const cohortUserIds = new Set(cohortUsers.map(u => u.id));
        const cohortStartDate = new Date(now.getTime() - cb.maxDays * 24 * 60 * 60 * 1000);

        const periods = lifecyclePeriods.map(lp => {
          const periodActivities = allActivityRaw.filter(a => {
            if (!cohortUserIds.has(a.userId)) return false;
            if (!a.createdAt) return false;
            const actDaysAgo = Math.floor((now.getTime() - new Date(a.createdAt).getTime()) / (1000 * 60 * 60 * 24));
            return actDaysAgo >= lp.minDays && actDaysAgo < lp.maxDays;
          });
          const activeUserIds = new Set(periodActivities.map(a => a.userId));
          const actionCounts: Record<string, number> = {};
          for (const a of periodActivities) {
            actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
          }
          const topActions = Object.entries(actionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([action, count]) => ({ action: humanizeAction(action), count }));

          return {
            label: lp.label,
            key: lp.key,
            totalUsers: cohortUsers.length,
            activeUsers: activeUserIds.size,
            totalActions: periodActivities.length,
            avgActionsPerUser: cohortUsers.length > 0 ? Math.round(periodActivities.length / cohortUsers.length) : 0,
            retentionRate: cohortUsers.length > 0 ? Math.round((activeUserIds.size / cohortUsers.length) * 100) : 0,
            topActions,
          };
        });

        return {
          cohortLabel: cb.label,
          cohortStart: cohortStartDate.toISOString(),
          totalUsers: cohortUsers.length,
          periods,
        };
      });

      res.json({
        totalUsers,
        activeUsersLast7d,
        activeUsersLast30d,
        avgActionsPerUser,
        overallRetentionRate,
        newUsersThisWeek,
        newUsersLastWeek,
        cohorts,
        actionBreakdown,
        dailyActiveUsers,
        weeklyRetentionTrend,
      });
    } catch (err) {
      console.error('Error fetching user activity KPI:', err);
      res.status(500).json({ message: 'Failed to fetch user activity KPI' });
    }
  });

  apiRoute(app, 'get', '/api/admin/user-activity-kpi/organizations', {
    tag: 'Admin',
    summary: 'Get per-organization activity KPI breakdown',
    parameters: [qStr('period', false, 'Time period (7d, 14d, 30d, 90d, 6m, 1y, all)')],
    responses: { ...r200('Organization activity data'), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: "Super admin access required" });

      const period = String(req.query.period || '30d');
      const validPeriods = ['7d', '14d', '30d', '90d', '6m', '1y', 'all'];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period value" });
      }
      const intervalMap: Record<string, number> = {
        '7d': 7, '14d': 14, '30d': 30, '90d': 90,
        '6m': 180, '1y': 365, 'all': 0,
      };
      const intervalDays = intervalMap[period] || 30;

      const orgsRaw = await db.select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
      }).from(organizations).where(isNull(organizations.deactivatedAt));

      const orgResults = await Promise.all(orgsRaw.map(async (org) => {
        const orgId = org.id;
        const metricsQuery = intervalDays > 0
          ? sql`SELECT
              (SELECT COUNT(*) FROM organization_members WHERE organization_id = ${orgId})::int as member_count,
              (SELECT COUNT(*) FROM projects WHERE organization_id = ${orgId} AND deleted_at IS NULL AND created_at >= NOW() - MAKE_INTERVAL(days => ${intervalDays}))::int as projects_created,
              (SELECT COUNT(*) FROM tasks t INNER JOIN projects p ON t.project_id = p.id WHERE p.organization_id = ${orgId} AND t.deleted_at IS NULL AND t.created_at >= NOW() - MAKE_INTERVAL(days => ${intervalDays}))::int as tasks_created,
              (SELECT COUNT(*) FROM issues i INNER JOIN projects p ON i.project_id = p.id WHERE p.organization_id = ${orgId} AND i.deleted_at IS NULL AND i.item_type = 'risk' AND i.created_at >= NOW() - MAKE_INTERVAL(days => ${intervalDays}))::int as risks_created,
              (SELECT COUNT(*) FROM issues i INNER JOIN projects p ON i.project_id = p.id WHERE p.organization_id = ${orgId} AND i.deleted_at IS NULL AND i.item_type = 'issue' AND i.created_at >= NOW() - MAKE_INTERVAL(days => ${intervalDays}))::int as issues_created,
              (SELECT COUNT(*) FROM timesheet_entries WHERE organization_id = ${orgId} AND entry_date >= (NOW() - MAKE_INTERVAL(days => ${intervalDays}))::date)::int as timesheet_entries,
              COALESCE((SELECT SUM(hours::numeric) FROM timesheet_entries WHERE organization_id = ${orgId} AND entry_date >= (NOW() - MAKE_INTERVAL(days => ${intervalDays}))::date), 0)::numeric as timesheet_hours,
              (SELECT COUNT(*) FROM resources WHERE organization_id = ${orgId})::int as resources_managed,
              (SELECT COUNT(*) FROM portfolios WHERE organization_id = ${orgId} AND deleted_at IS NULL AND created_at >= NOW() - MAKE_INTERVAL(days => ${intervalDays}))::int as portfolios_created,
              (SELECT COUNT(*) FROM user_activity_logs ual INNER JOIN organization_members om ON ual.user_id = om.user_id WHERE om.organization_id = ${orgId} AND ual.created_at >= NOW() - MAKE_INTERVAL(days => ${intervalDays}))::int as total_activity_logs,
              (SELECT COUNT(DISTINCT ual.user_id) FROM user_activity_logs ual INNER JOIN organization_members om ON ual.user_id = om.user_id WHERE om.organization_id = ${orgId} AND ual.created_at >= NOW() - MAKE_INTERVAL(days => ${intervalDays}))::int as active_users`
          : sql`SELECT
              (SELECT COUNT(*) FROM organization_members WHERE organization_id = ${orgId})::int as member_count,
              (SELECT COUNT(*) FROM projects WHERE organization_id = ${orgId} AND deleted_at IS NULL)::int as projects_created,
              (SELECT COUNT(*) FROM tasks t INNER JOIN projects p ON t.project_id = p.id WHERE p.organization_id = ${orgId} AND t.deleted_at IS NULL)::int as tasks_created,
              (SELECT COUNT(*) FROM issues i INNER JOIN projects p ON i.project_id = p.id WHERE p.organization_id = ${orgId} AND i.deleted_at IS NULL AND i.item_type = 'risk')::int as risks_created,
              (SELECT COUNT(*) FROM issues i INNER JOIN projects p ON i.project_id = p.id WHERE p.organization_id = ${orgId} AND i.deleted_at IS NULL AND i.item_type = 'issue')::int as issues_created,
              (SELECT COUNT(*) FROM timesheet_entries WHERE organization_id = ${orgId})::int as timesheet_entries,
              COALESCE((SELECT SUM(hours::numeric) FROM timesheet_entries WHERE organization_id = ${orgId}), 0)::numeric as timesheet_hours,
              (SELECT COUNT(*) FROM resources WHERE organization_id = ${orgId})::int as resources_managed,
              (SELECT COUNT(*) FROM portfolios WHERE organization_id = ${orgId} AND deleted_at IS NULL)::int as portfolios_created,
              (SELECT COUNT(*) FROM user_activity_logs ual INNER JOIN organization_members om ON ual.user_id = om.user_id WHERE om.organization_id = ${orgId})::int as total_activity_logs,
              (SELECT COUNT(DISTINCT ual.user_id) FROM user_activity_logs ual INNER JOIN organization_members om ON ual.user_id = om.user_id WHERE om.organization_id = ${orgId})::int as active_users`;

        const metricsResult = await db.execute(metricsQuery);
        const metrics = metricsResult.rows[0] as Record<string, unknown> | undefined;

        const topActionsQuery = intervalDays > 0
          ? sql`SELECT ual.action, COUNT(*)::int as count FROM user_activity_logs ual INNER JOIN organization_members om ON ual.user_id = om.user_id WHERE om.organization_id = ${orgId} AND ual.created_at >= NOW() - MAKE_INTERVAL(days => ${intervalDays}) GROUP BY ual.action ORDER BY count DESC LIMIT 5`
          : sql`SELECT ual.action, COUNT(*)::int as count FROM user_activity_logs ual INNER JOIN organization_members om ON ual.user_id = om.user_id WHERE om.organization_id = ${orgId} GROUP BY ual.action ORDER BY count DESC LIMIT 5`;

        const topActionsResult = await db.execute(topActionsQuery);
        const topActionsRaw = topActionsResult.rows as Record<string, unknown>[];

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          createdAt: org.createdAt?.toISOString() ?? '',
          memberCount: Number(metrics?.member_count ?? 0),
          metrics: {
            projectsCreated: Number(metrics?.projects_created ?? 0),
            tasksCreated: Number(metrics?.tasks_created ?? 0),
            risksCreated: Number(metrics?.risks_created ?? 0),
            issuesCreated: Number(metrics?.issues_created ?? 0),
            timesheetEntries: Number(metrics?.timesheet_entries ?? 0),
            timesheetHours: Math.round(Number(metrics?.timesheet_hours ?? 0) * 10) / 10,
            reportsGenerated: 0,
            importsExports: 0,
            integrationsSetUp: 0,
            resourcesManaged: Number(metrics?.resources_managed ?? 0),
            portfoliosCreated: Number(metrics?.portfolios_created ?? 0),
            totalActivityLogs: Number(metrics?.total_activity_logs ?? 0),
            activeUsers: Number(metrics?.active_users ?? 0),
            topActions: topActionsRaw.map((r: Record<string, unknown>) => ({
              action: humanizeAction(String(r.action ?? '')),
              count: Number(r.count ?? 0),
            })),
          },
        };
      }));

      const totals = orgResults.reduce((acc, org) => ({
        totalOrgs: acc.totalOrgs + 1,
        totalProjects: acc.totalProjects + org.metrics.projectsCreated,
        totalTasks: acc.totalTasks + org.metrics.tasksCreated,
        totalRisks: acc.totalRisks + org.metrics.risksCreated,
        totalIssues: acc.totalIssues + org.metrics.issuesCreated,
        totalTimesheetEntries: acc.totalTimesheetEntries + org.metrics.timesheetEntries,
        totalTimesheetHours: acc.totalTimesheetHours + org.metrics.timesheetHours,
        totalReports: 0,
        totalImportsExports: 0,
        totalIntegrations: 0,
        totalResources: acc.totalResources + org.metrics.resourcesManaged,
        totalPortfolios: acc.totalPortfolios + org.metrics.portfoliosCreated,
      }), {
        totalOrgs: 0, totalProjects: 0, totalTasks: 0, totalRisks: 0, totalIssues: 0,
        totalTimesheetEntries: 0, totalTimesheetHours: 0, totalReports: 0,
        totalImportsExports: 0, totalIntegrations: 0, totalResources: 0, totalPortfolios: 0,
      });

      res.json({ organizations: orgResults, totals, period });
    } catch (err) {
      console.error('Error fetching org user activity KPI:', err);
      res.status(500).json({ message: 'Failed to fetch organization activity' });
    }
  });
}

function humanizeAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
