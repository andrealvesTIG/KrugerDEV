import type { Express } from "express";
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
import { db } from "./db";
import { trainingModules, trainingLessons, trainingQuizQuestions } from "@shared/schema";
import { registerUserRoutes } from "./routes/userRoutes";
import { registerOrganizationRoutes } from "./routes/organizationRoutes";
import { registerOrgMemberRoutes } from "./routes/orgMemberRoutes";
import { registerPortfolioRoutes } from "./routes/portfolioRoutes";
import { registerProjectRoutes } from "./routes/projectRoutes";
import { registerProjectFeatureRoutes } from "./routes/projectFeatureRoutes";
import { registerProjectItemRoutes } from "./routes/projectItemRoutes";
import { registerResourceRoutes } from "./routes/resourceRoutes";
import { registerDashboardRoutes } from "./routes/dashboardRoutes";
import { registerMiscRoutes } from "./routes/miscRoutes";
import { registerBillingRoutes } from "./routes/billingRoutes";
import { registerAiRoutes } from "./routes/aiRoutes";
import { registerIntakeRoutes } from "./routes/intakeRoutes";
import { registerTimesheetRoutes } from "./routes/timesheetRoutes";
import { registerAnalyticsRoutes } from "./routes/analyticsRoutes";
import { registerCrossProjectReferenceRoutes } from "./routes/crossProjectReferenceRoutes";
import { registerPartnerRoutes } from "./routes/partnerRoutes";
import { registerUserActivityRoutes } from "./routes/userActivityRoutes";
import { registerProjectAgentRoutes } from "./routes/projectAgentRoutes";
import { registerJarvisRoutes } from "./routes/jarvisRoutes";
import { registerInvestorRoutes } from "./routes/investorRoutes";
import { registerDailyLogRoutes } from "./routes/dailyLogRoutes";
import { registerRfiRoutes } from "./routes/rfiRoutes";
import { registerSubmittalRoutes } from "./routes/submittalRoutes";
import { seedDatabase } from "./routes/helpers";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const numericParams = ['id', 'projectId', 'portfolioId', 'taskId', 'issueId', 'milestoneId', 'riskId', 'resourceId', 'orgId', 'organizationId', 'memberId', 'ticketId', 'documentId', 'assessmentId', 'subscriptionId', 'planId', 'viewId', 'entryId', 'notificationId', 'logId', 'rfiId', 'submittalId', 'revisionId', 'responseId'];
  for (const param of numericParams) {
    app.param(param, (req, res, next, value) => {
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num)) {
        return res.status(400).json({ message: `Invalid ${param}: must be an integer` });
      }
      next();
    });
  }

  app.use(async (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const existingUserId = req.user?.claims?.sub || req.session?.userId;
      if (!existingUserId) {
        try {
          const token = authHeader.slice(7);
          const tokenRecord = await storage.getApiTokenByToken(token);
          if (tokenRecord) {
            if (!tokenRecord.expiresAt || tokenRecord.expiresAt >= new Date()) {
              if (!req.session) req.session = {};
              req.session.userId = tokenRecord.userId;
              req.bearerOrgId = tokenRecord.organizationId;
              storage.updateApiTokenLastUsed(tokenRecord.id);
            }
          }
        } catch (err) {
          // Silently continue — session/other auth will apply
        }
      }
    }
    next();
  });

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
  registerProjectFeatureRoutes(app);
  registerProjectItemRoutes(app);
  registerResourceRoutes(app);
  registerDashboardRoutes(app);
  await registerMiscRoutes(app);
  await registerBillingRoutes(app);
  registerAiRoutes(app);
  registerIntakeRoutes(app);
  registerTimesheetRoutes(app);
  registerAnalyticsRoutes(app);
  registerCrossProjectReferenceRoutes(app);
  registerPartnerRoutes(app);
  registerUserActivityRoutes(app);
  registerProjectAgentRoutes(app);
  registerJarvisRoutes(app);
  registerInvestorRoutes(app);
  registerDailyLogRoutes(app);
  registerRfiRoutes(app);
  registerSubmittalRoutes(app);

  seedTrainingDataIfEmpty().catch(err => {
    console.error('[training] Failed to seed training data:', err.message);
  });

  return httpServer;
}

async function seedTrainingDataIfEmpty() {
  const existing = await db.select({ id: trainingModules.id }).from(trainingModules).limit(1);
  if (existing.length > 0) return;

  console.log('[training] No training data found, auto-seeding from static content...');

  try {
    const { allModules: staticModules } = await import('../client/src/lib/trainingData');
    await db.transaction(async (tx) => {
      for (let i = 0; i < staticModules.length; i++) {
        const mod = staticModules[i];
        const [createdModule] = await tx.insert(trainingModules).values({
          moduleKey: mod.id,
          name: mod.name,
          subtitle: mod.subtitle,
          certPrefix: mod.certPrefix,
          sortOrder: i,
        }).returning();

        for (let j = 0; j < mod.lessons.length; j++) {
          const lesson = mod.lessons[j];
          const [createdLesson] = await tx.insert(trainingLessons).values({
            moduleId: createdModule.id,
            lessonKey: lesson.id,
            title: lesson.title,
            description: lesson.description,
            videoTitle: lesson.videoTitle,
            videoDescription: lesson.videoDescription,
            keyConcepts: lesson.keyConcepts,
            sortOrder: j,
          }).returning();

          for (let k = 0; k < lesson.questions.length; k++) {
            const q = lesson.questions[k];
            await tx.insert(trainingQuizQuestions).values({
              lessonId: createdLesson.id,
              questionKey: q.id,
              scenario: q.scenario,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              sortOrder: k,
            });
          }
        }
      }
    });
    const totalLessons = staticModules.reduce((s: number, m: { lessons: unknown[] }) => s + m.lessons.length, 0);
    const totalQuestions = staticModules.reduce((s: number, m: { lessons: { questions: unknown[] }[] }) => s + m.lessons.reduce((ls: number, l) => ls + l.questions.length, 0), 0);
    console.log(`[training] Auto-seeded ${staticModules.length} modules, ${totalLessons} lessons, ${totalQuestions} questions`);
  } catch (err: any) {
    console.error('[training] Auto-seed failed, will use static fallback:', err.message);
  }
}
