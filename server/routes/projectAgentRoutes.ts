import { Express, Request, Response } from "express";
import { db } from "../db";
import { projectAgents, projectAgentLogs, projects } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  getProjectStakeholders,
  runMeetingAgenda,
  runTaskFollowUp,
  runStatusReport,
  calculateNextWeeklyRun,
} from "../services/projectAgentService";
import { apiRoute, pathId, ref, arrOf, r200, r201, body, authRes, fullRes, inputRes } from "../route-registry";
import { isTeamMemberInOrg, getTeamMemberProjectIds, userHasOrgAccess } from "./helpers";
import { sendLimitExceeded, AiCreditsLimitError } from "../services/aiCredits";

function getUserIdFromRequest(req: Request): string | null {
  const user = req.user as any;
  return user?.claims?.sub || (req.session as any)?.userId || null;
}

export function registerProjectAgentRoutes(app: Express) {
  apiRoute(app, 'get', '/api/projects/:projectId/agent', {
    tag: 'Projects',
    summary: 'Get project agent configuration',
    parameters: [pathId('projectId')],
    responses: { ...r200('Agent config', ref('Project')), ...authRes },
  }, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const projectId = Number(req.params.projectId);

    const [project] = await db.select({ id: projects.id, organizationId: projects.organizationId })
      .from(projects).where(eq(projects.id, projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.organizationId && !await userHasOrgAccess(userId, project.organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (project.organizationId && await isTeamMemberInOrg(userId, project.organizationId)) {
      const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, project.organizationId));
      if (!allowedProjectIds.has(projectId)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const [agent] = await db.select().from(projectAgents).where(eq(projectAgents.projectId, projectId));
    res.json(agent || null);
  });

  apiRoute(app, 'get', '/api/projects/:projectId/agent/stakeholders', {
    tag: 'Projects',
    summary: 'Get project agent stakeholders',
    parameters: [pathId('projectId')],
    responses: { ...r200('Stakeholder list', arrOf('Project')), ...authRes },
  }, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const projectId = Number(req.params.projectId);

    const [project] = await db.select({ id: projects.id, organizationId: projects.organizationId })
      .from(projects).where(eq(projects.id, projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.organizationId && !await userHasOrgAccess(userId, project.organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (project.organizationId && await isTeamMemberInOrg(userId, project.organizationId)) {
      const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, project.organizationId));
      if (!allowedProjectIds.has(projectId)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const stakeholders = await getProjectStakeholders(projectId);
    res.json(stakeholders);
  });

  apiRoute(app, 'put', '/api/projects/:projectId/agent', {
    tag: 'Projects',
    summary: 'Create or update project agent configuration',
    parameters: [pathId('projectId')],
    requestBody: body({
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        agendaEnabled: { type: 'boolean' },
        agendaDay: { type: 'integer' },
        agendaTime: { type: 'string' },
        taskFollowUpEnabled: { type: 'boolean' },
        taskFollowUpDay: { type: 'integer' },
        taskFollowUpTime: { type: 'string' },
        statusReportEnabled: { type: 'boolean' },
        statusReportDay: { type: 'integer' },
        statusReportTime: { type: 'string' },
        timezone: { type: 'string' },
      },
    }),
    responses: { ...r200('Updated agent', ref('Project')), ...fullRes },
  }, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const projectId = Number(req.params.projectId);

    const [project] = await db.select({ id: projects.id, organizationId: projects.organizationId })
      .from(projects).where(eq(projects.id, projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.organizationId && !await userHasOrgAccess(userId, project.organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (project.organizationId && await isTeamMemberInOrg(userId, project.organizationId)) {
      return res.status(403).json({ message: "Team members cannot modify agent configurations" });
    }

    const {
      enabled, agendaEnabled, agendaDay, agendaTime,
      taskFollowUpEnabled, taskFollowUpDay, taskFollowUpTime,
      statusReportEnabled, statusReportDay, statusReportTime,
      timezone,
    } = req.body;

    const tz = timezone || "America/New_York";
    const values = {
      enabled: enabled ?? false,
      agendaEnabled: agendaEnabled ?? true,
      agendaDay: agendaDay ?? 1,
      agendaTime: agendaTime || "09:00",
      taskFollowUpEnabled: taskFollowUpEnabled ?? true,
      taskFollowUpDay: taskFollowUpDay ?? 3,
      taskFollowUpTime: taskFollowUpTime || "09:00",
      statusReportEnabled: statusReportEnabled ?? true,
      statusReportDay: statusReportDay ?? 5,
      statusReportTime: statusReportTime || "09:00",
      timezone: tz,
      updatedAt: new Date(),
    };

    const [existing] = await db.select({ id: projectAgents.id })
      .from(projectAgents).where(eq(projectAgents.projectId, projectId));

    let agent;
    if (existing) {
      const nextRuns: Record<string, Date | null> = {};
      if (values.enabled) {
        if (values.agendaEnabled) nextRuns.nextAgendaRun = calculateNextWeeklyRun(values.agendaDay, values.agendaTime, tz);
        else nextRuns.nextAgendaRun = null;
        if (values.taskFollowUpEnabled) nextRuns.nextTaskFollowUpRun = calculateNextWeeklyRun(values.taskFollowUpDay, values.taskFollowUpTime, tz);
        else nextRuns.nextTaskFollowUpRun = null;
        if (values.statusReportEnabled) nextRuns.nextStatusReportRun = calculateNextWeeklyRun(values.statusReportDay, values.statusReportTime, tz);
        else nextRuns.nextStatusReportRun = null;
      } else {
        nextRuns.nextAgendaRun = null;
        nextRuns.nextTaskFollowUpRun = null;
        nextRuns.nextStatusReportRun = null;
      }

      [agent] = await db.update(projectAgents)
        .set({ ...values, ...nextRuns })
        .where(eq(projectAgents.id, existing.id))
        .returning();
    } else {
      const nextRuns: Record<string, Date | null> = {};
      if (values.enabled) {
        if (values.agendaEnabled) nextRuns.nextAgendaRun = calculateNextWeeklyRun(values.agendaDay, values.agendaTime, tz);
        if (values.taskFollowUpEnabled) nextRuns.nextTaskFollowUpRun = calculateNextWeeklyRun(values.taskFollowUpDay, values.taskFollowUpTime, tz);
        if (values.statusReportEnabled) nextRuns.nextStatusReportRun = calculateNextWeeklyRun(values.statusReportDay, values.statusReportTime, tz);
      }

      [agent] = await db.insert(projectAgents).values({
        projectId,
        organizationId: project.organizationId!,
        ...values,
        ...nextRuns,
        createdBy: userId,
      }).returning();
    }

    res.json(agent);
  });

  apiRoute(app, 'get', '/api/projects/:projectId/agent/logs', {
    tag: 'Projects',
    summary: 'Get project agent execution logs',
    parameters: [pathId('projectId')],
    responses: { ...r200('Agent logs', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const projectId = Number(req.params.projectId);

    const [project] = await db.select({ id: projects.id, organizationId: projects.organizationId })
      .from(projects).where(eq(projects.id, projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.organizationId && !await userHasOrgAccess(userId, project.organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (project.organizationId && await isTeamMemberInOrg(userId, project.organizationId)) {
      const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, project.organizationId));
      if (!allowedProjectIds.has(projectId)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const [agent] = await db.select({ id: projectAgents.id })
      .from(projectAgents).where(eq(projectAgents.projectId, projectId));

    if (!agent) return res.json([]);

    const logs = await db.select().from(projectAgentLogs)
      .where(eq(projectAgentLogs.projectAgentId, agent.id))
      .orderBy(desc(projectAgentLogs.createdAt))
      .limit(100);

    res.json(logs);
  });

  apiRoute(app, 'post', '/api/projects/:projectId/agent/trigger/:action', {
    tag: 'Projects',
    summary: 'Manually trigger a project agent action',
    parameters: [pathId('projectId'), { name: 'action', in: 'path', required: true, schema: { type: 'string', enum: ['meeting_agenda', 'task_follow_up', 'status_report'] } }],
    responses: { ...r200('Action result', { type: 'object' }), ...fullRes, ...inputRes },
  }, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const projectId = Number(req.params.projectId);
    const action = req.params.action;

    const [projectForTrigger] = await db.select({ id: projects.id, organizationId: projects.organizationId })
      .from(projects).where(eq(projects.id, projectId));
    if (!projectForTrigger) return res.status(404).json({ message: "Project not found" });
    if (projectForTrigger.organizationId && !await userHasOrgAccess(userId, projectForTrigger.organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (projectForTrigger.organizationId && await isTeamMemberInOrg(userId, projectForTrigger.organizationId)) {
      return res.status(403).json({ message: "Team members cannot trigger agent actions" });
    }

    const [agent] = await db.select().from(projectAgents)
      .where(eq(projectAgents.projectId, projectId));

    if (!agent) return res.status(404).json({ message: "Agent not configured for this project" });

    try {
      switch (action) {
        case "meeting_agenda":
          await runMeetingAgenda(agent.id, projectId, userId);
          break;
        case "task_follow_up":
          await runTaskFollowUp(agent.id, projectId, userId);
          break;
        case "status_report":
          await runStatusReport(agent.id, projectId, userId);
          break;
        default:
          return res.status(400).json({ message: `Unknown action: ${action}` });
      }
      res.json({ message: `Action '${action}' executed successfully` });
    } catch (err: any) {
      // Surface AI-credit limit errors as the standard 403 envelope so the
      // client can render the upgrade prompt instead of a generic 500.
      if (err instanceof AiCreditsLimitError) {
        if (sendLimitExceeded(res, err)) return;
      }
      res.status(500).json({ message: `Action failed: ${err.message}` });
    }
  });
}
