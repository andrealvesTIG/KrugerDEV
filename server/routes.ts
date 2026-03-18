import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth as setupReplitAuth } from "./replit_integrations/auth";
import { setupAuth as setupEmailAuth } from "./auth/emailAuth";
import { setupMicrosoftAuth } from "./auth/microsoftAuth";
import { setupGoogleAuth } from "./auth/googleAuth";
import { setupProjectOnlineRoutes } from "./services/projectOnline";
import { setupPlannerRoutes } from "./services/microsoftPlanner";
import { setupDataverseRoutes } from "./services/microsoftDataverse";
import { setupDynamics365Routes } from "./services/dynamics365Sales";
import { seedDatabase } from "./routes/helpers";
import { registerUserRoutes } from "./routes/userRoutes";
import { registerOrganizationRoutes } from "./routes/organizationRoutes";
import { registerOrgMemberRoutes } from "./routes/orgMemberRoutes";
import { registerPortfolioRoutes } from "./routes/portfolioRoutes";
import { registerProjectRoutes } from "./routes/projectRoutes";
import { registerProjectItemRoutes } from "./routes/projectItemRoutes";
import { registerResourceRoutes } from "./routes/resourceRoutes";
import { registerDashboardRoutes } from "./routes/dashboardRoutes";
import { registerIntakeRoutes } from "./routes/intakeRoutes";
import { registerProjectFeatureRoutes } from "./routes/projectFeatureRoutes";
import { registerAiRoutes } from "./routes/aiRoutes";
import { registerAnalyticsRoutes } from "./routes/analyticsRoutes";
import { registerBillingRoutes } from "./routes/billingRoutes";
import { registerTimesheetRoutes } from "./routes/timesheetRoutes";
import { registerMiscRoutes, seedTrainingDataIfEmpty } from "./routes/miscRoutes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const numericParams = ['id', 'projectId', 'portfolioId', 'taskId', 'issueId', 'milestoneId', 'riskId', 'resourceId', 'orgId', 'organizationId', 'memberId', 'ticketId', 'documentId', 'assessmentId', 'subscriptionId', 'planId', 'viewId', 'entryId', 'notificationId'];
  for (const param of numericParams) {
    app.param(param, (req, res, next, value) => {
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num)) {
        return res.status(400).json({ message: `Invalid ${param}: must be an integer` });
      }
      next();
    });
  }

  app.use((async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const r = req as Request & { user?: { claims?: { sub?: string } }; session?: Record<string, unknown>; bearerOrgId?: number };
      const existingUserId = r.user?.claims?.sub || r.session?.userId;
      if (!existingUserId) {
        try {
          const token = authHeader.slice(7);
          const tokenRecord = await storage.getApiTokenByToken(token);
          if (tokenRecord) {
            if (!tokenRecord.expiresAt || tokenRecord.expiresAt >= new Date()) {
              if (!r.session) (r as any).session = {};
              (r.session as Record<string, unknown>).userId = tokenRecord.userId;
              r.bearerOrgId = tokenRecord.organizationId;
              storage.updateApiTokenLastUsed(tokenRecord.id);
            }
          }
        } catch (_err) {
        }
      }
    }
    next();
  }) as RequestHandler);

  await setupReplitAuth(app);
  await setupEmailAuth(app);
  await setupMicrosoftAuth(app);
  setupGoogleAuth(app);
  await setupProjectOnlineRoutes(app);
  await setupPlannerRoutes(app);
  await setupDataverseRoutes(app);
  await setupDynamics365Routes(app);

  seedDatabase().catch(err => console.error("Error seeding database:", err));

  registerUserRoutes(app);
  registerOrganizationRoutes(app);
  registerOrgMemberRoutes(app);
  registerPortfolioRoutes(app);
  registerProjectRoutes(app);
  registerProjectItemRoutes(app);
  registerResourceRoutes(app);
  registerDashboardRoutes(app);
  registerIntakeRoutes(app);
  registerProjectFeatureRoutes(app);
  registerAiRoutes(app);
  registerAnalyticsRoutes(app);
  await registerBillingRoutes(app);
  registerTimesheetRoutes(app);
  await registerMiscRoutes(app);

  seedTrainingDataIfEmpty().catch(err => {
    console.error('[training] Failed to seed training data:', err.message);
  });

  return httpServer;
}
