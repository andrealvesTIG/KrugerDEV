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
import { registerOrgConfigExportRoutes } from "./routes/orgConfigExportRoutes";
import { registerOrgMemberRoutes } from "./routes/orgMemberRoutes";
import { registerRoleRoutes } from "./routes/roleRoutes";
import { registerPortfolioRoutes } from "./routes/portfolioRoutes";
import { registerProgramRoutes } from "./routes/programRoutes";
import { registerCalendarRoutes } from "./routes/calendarRoutes";
import { registerProjectRoutes } from "./routes/projectRoutes";
import { registerExecutiveSummaryRoutes } from "./routes/executiveSummaryRoutes";
import { registerPmoCommentRoutes } from "./routes/pmoCommentRoutes";
import { registerProjectSoftwareLicenseRoutes } from "./routes/projectSoftwareLicenseRoutes";
import { registerProjectFeatureRoutes } from "./routes/projectFeatureRoutes";
import { registerFinancialsRoutes } from "./routes/financialsRoutes";
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
import { registerUserInsightsRoutes } from "./routes/userInsightsRoutes";
import { registerProjectAgentRoutes } from "./routes/projectAgentRoutes";
import { registerCustomAgentRoutes } from "./routes/customAgentRoutes";
import { registerJarvisRoutes } from "./routes/jarvisRoutes";
import { registerJarvisGuestRoutes } from "./routes/jarvisGuestRoutes";
import { registerInvestorRoutes } from "./routes/investorRoutes";
import { registerDailyLogRoutes } from "./routes/dailyLogRoutes";
import { registerRfiRoutes } from "./routes/rfiRoutes";
import { registerSubmittalRoutes } from "./routes/submittalRoutes";
import { registerIntegrationRouteDocs } from "./routes/integrationRouteDocs";
import { registerDrawingRoutes } from "./routes/drawingRoutes";
import { registerPunchListRoutes } from "./routes/punchListRoutes";
import { registerQualitySafetyRoutes } from "./routes/qualitySafetyRoutes";
import { registerBiddingRoutes } from "./routes/biddingRoutes";
import { registerChangeOrderRoutes } from "./routes/changeOrderRoutes";
import { registerConstructionInvoiceRoutes } from "./routes/constructionInvoiceRoutes";
import { registerMeetingRoutes } from "./routes/meetingRoutes";
import { registerCorrespondenceRoutes } from "./routes/correspondenceRoutes";
import { registerBlogRoutes } from "./routes/blogRoutes";
import { registerSystemEmailRoutes } from "./routes/systemEmailRoutes";
import { registerSuperAdminAgentRoutes } from "./routes/superAdminAgentRoutes";
import { registerNotificationPreferenceRoutes } from "./routes/notificationPreferenceRoutes";
import { registerUiPreferenceRoutes } from "./routes/uiPreferenceRoutes";
import { registerPowerBIAgentRoutes } from "./routes/powerbiAgentRoutes";
import { registerLocationRoutes } from "./routes/locationRoutes";
import { registerProjectTabTemplateRoutes } from "./routes/projectTabTemplateRoutes";
import { seedDatabase } from "./routes/helpers";
import { seedSystemTemplates, backfillDefaultTemplateForOrgs, ensureDefaultTemplateRegistry } from "./services/projectTabTemplateSeed";
import { seedItSystemTemplates } from "./services/itProjectTemplateSeed";
import { seedHealthcareSystemTemplates } from "./services/healthcareProjectTemplateSeed";
import { seedFinancialServicesSystemTemplates } from "./services/financialServicesProjectTemplateSeed";
import { seedManufacturingSystemTemplates } from "./services/manufacturingProjectTemplateSeed";
import { seedIndustrialAutomationSystemTemplates } from "./services/industrialAutomationProjectTemplateSeed";
import { seedCapitalProjectsSystemTemplates } from "./services/capitalProjectsProjectTemplateSeed";
import { seedEnergySystemTemplates } from "./services/energyProjectTemplateSeed";
import { seedGovernmentSystemTemplates } from "./services/governmentProjectTemplateSeed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const numericParams = ['id', 'projectId', 'portfolioId', 'taskId', 'issueId', 'milestoneId', 'riskId', 'resourceId', 'orgId', 'organizationId', 'memberId', 'ticketId', 'documentId', 'assessmentId', 'subscriptionId', 'planId', 'viewId', 'entryId', 'notificationId', 'logId', 'rfiId', 'submittalId', 'revisionId', 'responseId', 'drawingId', 'markupId', 'setId', 'punchItemId', 'photoId', 'templateId', 'inspectionId', 'incidentId', 'observationId', 'actionId', 'vendorId', 'prequalId', 'bidPackageId', 'invitationId', 'bidId', 'changeOrderId', 'invoiceId', 'meetingId', 'actionItemId', 'correspondenceId'];
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
  registerOrgConfigExportRoutes(app);
  registerOrgMemberRoutes(app);
  registerRoleRoutes(app);
  registerPortfolioRoutes(app);
  registerProgramRoutes(app);
  registerCalendarRoutes(app);
  registerProjectRoutes(app);
  registerExecutiveSummaryRoutes(app);
  registerPmoCommentRoutes(app);
  registerProjectSoftwareLicenseRoutes(app);
  registerProjectFeatureRoutes(app);
  registerFinancialsRoutes(app);
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
  registerUserInsightsRoutes(app);
  registerProjectAgentRoutes(app);
  registerCustomAgentRoutes(app);
  registerJarvisRoutes(app);
  registerJarvisGuestRoutes(app);
  registerInvestorRoutes(app);
  registerDailyLogRoutes(app);
  registerRfiRoutes(app);
  registerSubmittalRoutes(app);
  registerDrawingRoutes(app);
  registerPunchListRoutes(app);
  registerQualitySafetyRoutes(app);
  registerBiddingRoutes(app);
  registerChangeOrderRoutes(app);
  registerConstructionInvoiceRoutes(app);
  registerMeetingRoutes(app);
  registerCorrespondenceRoutes(app);
  registerBlogRoutes(app);
  registerSystemEmailRoutes(app);
  registerSuperAdminAgentRoutes(app);
  registerNotificationPreferenceRoutes(app);
  registerUiPreferenceRoutes(app);
  registerPowerBIAgentRoutes(app);
  registerLocationRoutes(app);
  registerProjectTabTemplateRoutes(app);

  // Backfill OpenAPI metadata for routes that are still bound directly via
  // app.method() inside integration services (Microsoft Planner, Project
  // Online, Dynamics 365, Dataverse) and for RFI/submittal sub-resources.
  registerIntegrationRouteDocs();

  // Seed system project tab templates and backfill the default Generic PMO
  // template for any organization that hasn't received it yet. Both calls are
  // idempotent and safe to run on every boot.
  (async () => {
    try {
      await seedSystemTemplates();
      await backfillDefaultTemplateForOrgs();
      await ensureDefaultTemplateRegistry();
    } catch (err) {
      console.error('[project-tab-templates] Seed/backfill failed:', err);
    }
  })();

  // One-time idempotent backfill: mark `projectName` and `description` as
  // required on existing intake form layouts that pre-date the per-item
  // Required toggle.
  (async () => {
    try {
      const { backfillIntakeRequiredFlags } = await import('./storage/intakeStorage');
      const { updated } = await backfillIntakeRequiredFlags();
      if (updated > 0) {
        console.log(`[migration] Intake required-flags backfill: ${updated} item(s) updated`);
      }
    } catch (err) {
      console.error('[intake-required-backfill] Failed:', err);
    }
  })();

  // Seed the system project templates library across industries. Each seeder
  // is idempotent — upserts by slug and replaces its items in a transaction.
  (async () => {
    const seeders: Array<[string, () => Promise<void>]> = [
      ["it-templates", seedItSystemTemplates],
      ["healthcare-templates", seedHealthcareSystemTemplates],
      ["financial-services-templates", seedFinancialServicesSystemTemplates],
      ["manufacturing-templates", seedManufacturingSystemTemplates],
      ["industrial-automation-templates", seedIndustrialAutomationSystemTemplates],
      ["capital-projects-templates", seedCapitalProjectsSystemTemplates],
      ["energy-templates", seedEnergySystemTemplates],
      ["government-templates", seedGovernmentSystemTemplates],
    ];
    for (const [tag, seeder] of seeders) {
      try {
        await seeder();
      } catch (err) {
        console.error(`[${tag}] Seed failed:`, err);
      }
    }
  })();

  seedTrainingDataIfEmpty().catch(err => {
    console.error('[training] Failed to seed training data:', err.message);
  });

  syncAllProjectProgress().catch(err => {
    console.error('[progress] Failed to sync project progress:', err.message);
  });

  return httpServer;
}

async function syncAllProjectProgress() {
  const allProjects = await storage.getProjects();
  let updated = 0;
  for (const project of allProjects) {
    const tasks = await storage.getTasks(project.id);
    let avg = 0;
    if (tasks.length > 0) {
      const childIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId!));
      const leafTasks = tasks.filter(t => !childIds.has(t.id));
      if (leafTasks.length > 0) {
        avg = Math.round(leafTasks.reduce((sum, t) => sum + (t.progress || 0), 0) / leafTasks.length);
      }
    }
    if (project.completionPercentage !== avg) {
      await storage.updateProject(project.id, { completionPercentage: avg });
      updated++;
    }
  }
  if (updated > 0) {
    console.log(`[progress] Synced progress for ${updated} projects`);
  }
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
