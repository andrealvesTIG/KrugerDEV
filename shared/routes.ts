import { z } from 'zod';
import { 
  insertPortfolioSchema, 
  insertProjectSchema, 
  insertRiskSchema, 
  insertMilestoneSchema,
  insertIssueSchema,
  insertTaskSchema,
  insertTaskChangeLogSchema,
  insertTaskDependencySchema,
  insertProjectFinancialSchema,
  insertIntakeFinancialSchema,
  insertIntakeGovernanceQuestionSchema,
  insertIntakeCostingChecklistSchema,
  portfolios,
  projects,
  milestones,
  issues,
  tasks,
  taskChangeLogs,
  projectChangeLogs,
  issueChangeLogs,
  taskDependencies,
  projectFinancials,
  intakeFinancials,
  intakeGovernanceQuestions,
  intakeCostingChecklist
} from './schema';

// ============================================
// TYPE EXPORTS FOR REQUEST TYPES
// ============================================
export type CreateRiskRequest = z.infer<typeof insertRiskSchema>;
export type UpdateRiskRequest = Partial<z.infer<typeof insertRiskSchema>>;

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  portfolios: {
    list: {
      method: 'GET' as const,
      path: '/api/portfolios',
      responses: {
        200: z.array(z.custom<typeof portfolios.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/portfolios/:id',
      responses: {
        200: z.custom<typeof portfolios.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/portfolios',
      input: insertPortfolioSchema,
      responses: {
        201: z.custom<typeof portfolios.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/portfolios/:id',
      input: insertPortfolioSchema.partial(),
      responses: {
        200: z.custom<typeof portfolios.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/portfolios/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  projects: {
    list: {
      method: 'GET' as const,
      path: '/api/projects',
      input: z.object({
        portfolioId: z.coerce.number().optional(),
        isInternal: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
        page: z.coerce.number().optional(),
        pageSize: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.union([
          z.array(z.custom<typeof projects.$inferSelect>()),
          z.object({
            projects: z.array(z.custom<typeof projects.$inferSelect>()),
            total: z.number(),
            page: z.number(),
            pageSize: z.number(),
          }),
        ]),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/projects/:id',
      responses: {
        200: z.custom<typeof projects.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects',
      input: insertProjectSchema,
      responses: {
        201: z.custom<typeof projects.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/projects/:id',
      input: insertProjectSchema.partial().extend({
        completionPercentage: z.number().int().min(0).max(100).optional(),
        health: z.string().optional(),
        startDate: z.union([z.string(), z.date(), z.null()]).optional(),
        endDate: z.union([z.string(), z.date(), z.null()]).optional(),
        baselineStartDate: z.union([z.string(), z.date(), z.null()]).optional(),
        baselineEndDate: z.union([z.string(), z.date(), z.null()]).optional(),
        actualStartDate: z.union([z.string(), z.date(), z.null()]).optional(),
        actualEndDate: z.union([z.string(), z.date(), z.null()]).optional(),
        healthReason: z.union([z.string(), z.null()]).optional(),
        healthReasonUpdatedAt: z.union([z.string(), z.date(), z.null()]).optional(),
        deletedAt: z.union([z.string(), z.date(), z.null()]).optional(),
      }),
      responses: {
        200: z.custom<typeof projects.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/projects/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    getHistory: {
      method: 'GET' as const,
      path: '/api/projects/:id/history',
      responses: {
        200: z.array(z.custom<typeof projectChangeLogs.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
  },
  risks: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/risks',
      responses: {
        200: z.array(z.custom<typeof issues.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/risks',
      input: insertRiskSchema,
      responses: {
        201: z.custom<typeof issues.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/risks/:id',
      input: insertRiskSchema.partial(),
      responses: {
        200: z.custom<typeof issues.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/risks/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    getHistory: {
      method: 'GET' as const,
      path: '/api/risks/:id/history',
      responses: {
        200: z.array(z.custom<typeof issueChangeLogs.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
  },
  milestones: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/milestones',
      responses: {
        200: z.array(z.custom<typeof milestones.$inferSelect>()),
      },
    },
    listAll: {
      method: 'GET' as const,
      path: '/api/milestones',
      responses: {
        200: z.array(z.custom<typeof milestones.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/milestones',
      input: insertMilestoneSchema,
      responses: {
        201: z.custom<typeof milestones.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/milestones/:id',
      input: insertMilestoneSchema.partial(),
      responses: {
        200: z.custom<typeof milestones.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/milestones/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  issues: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/issues',
      responses: {
        200: z.array(z.custom<typeof issues.$inferSelect>()),
      },
    },
    listAll: {
      method: 'GET' as const,
      path: '/api/issues',
      responses: {
        200: z.array(z.custom<typeof issues.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/issues',
      input: insertIssueSchema,
      responses: {
        201: z.custom<typeof issues.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/issues/:id',
      input: insertIssueSchema.partial(),
      responses: {
        200: z.custom<typeof issues.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/issues/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    getHistory: {
      method: 'GET' as const,
      path: '/api/issues/:id/history',
      responses: {
        200: z.array(z.custom<typeof issueChangeLogs.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
  },
  tasks: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/tasks',
      responses: {
        200: z.array(z.custom<typeof tasks.$inferSelect>()),
      },
    },
    listAll: {
      method: 'GET' as const,
      path: '/api/tasks',
      responses: {
        200: z.array(z.custom<typeof tasks.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/tasks',
      input: insertTaskSchema,
      responses: {
        201: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/tasks/:id',
      input: insertTaskSchema.partial(),
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tasks/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    bulkUpdate: {
      method: 'POST' as const,
      path: '/api/tasks/bulk-update',
      responses: {
        200: z.object({ updatedCount: z.number() }),
        400: errorSchemas.validation,
      },
    },
    bulkDelete: {
      method: 'POST' as const,
      path: '/api/tasks/bulk-delete',
      responses: {
        200: z.object({ deletedCount: z.number() }),
        400: errorSchemas.validation,
      },
    },
    getHistory: {
      method: 'GET' as const,
      path: '/api/tasks/:id/history',
      responses: {
        200: z.array(z.custom<typeof taskChangeLogs.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    getDependencies: {
      method: 'GET' as const,
      path: '/api/tasks/:id/dependencies',
      responses: {
        200: z.array(z.custom<typeof taskDependencies.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    addDependency: {
      method: 'POST' as const,
      path: '/api/tasks/:id/dependencies',
      input: z.object({
        dependsOnTaskId: z.number(),
        dependencyType: z.preprocess(
          (val) => {
            if (val === null || val === undefined) return undefined;
            if (typeof val !== 'string') return val;
            const normalized = val.toLowerCase().replace(/[\s_]/g, '');
            const map: Record<string, string> = {
              'finishtostart': 'finish-to-start', 'fs': 'finish-to-start',
              'starttostart': 'start-to-start', 'ss': 'start-to-start',
              'finishtofinish': 'finish-to-finish', 'ff': 'finish-to-finish',
              'starttofinish': 'start-to-finish', 'sf': 'start-to-finish',
              'finish-to-start': 'finish-to-start',
              'start-to-start': 'start-to-start',
              'finish-to-finish': 'finish-to-finish',
              'start-to-finish': 'start-to-finish',
            };
            return map[normalized] || val;
          },
          z.enum(['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish']).optional().default('finish-to-start'),
        ),
        lagDays: z.preprocess(
          (val) => (val === null ? undefined : val),
          z.number().int().optional().default(0),
        ),
      }),
      responses: {
        201: z.custom<typeof taskDependencies.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateDependency: {
      method: 'PUT' as const,
      path: '/api/tasks/:id/dependencies/:dependsOnTaskId',
      input: z.object({
        dependencyType: z.preprocess(
          (val) => {
            if (val === null || val === undefined) return undefined;
            if (typeof val !== 'string') return val;
            const normalized = val.toLowerCase().replace(/[\s_]/g, '');
            const map: Record<string, string> = {
              'finishtostart': 'finish-to-start', 'fs': 'finish-to-start',
              'starttostart': 'start-to-start', 'ss': 'start-to-start',
              'finishtofinish': 'finish-to-finish', 'ff': 'finish-to-finish',
              'starttofinish': 'start-to-finish', 'sf': 'start-to-finish',
              'finish-to-start': 'finish-to-start',
              'start-to-start': 'start-to-start',
              'finish-to-finish': 'finish-to-finish',
              'start-to-finish': 'start-to-finish',
            };
            return map[normalized] || val;
          },
          z.enum(['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish']).optional(),
        ),
        lagDays: z.preprocess(
          (val) => (val === null ? undefined : val),
          z.number().int().optional(),
        ),
      }),
      responses: {
        200: z.custom<typeof taskDependencies.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    removeDependency: {
      method: 'DELETE' as const,
      path: '/api/tasks/:id/dependencies/:dependsOnTaskId',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  projectFinancials: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/financials',
      responses: {
        200: z.array(z.custom<typeof projectFinancials.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/project-financials/:id',
      responses: {
        200: z.custom<typeof projectFinancials.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/financials',
      input: insertProjectFinancialSchema.omit({ projectId: true }),
      responses: {
        201: z.custom<typeof projectFinancials.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/project-financials/:id',
      input: insertProjectFinancialSchema.partial(),
      responses: {
        200: z.custom<typeof projectFinancials.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/project-financials/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  intakeFinancials: {
    list: {
      method: 'GET' as const,
      path: '/api/project-intakes/:intakeId/financials',
      responses: {
        200: z.array(z.custom<typeof intakeFinancials.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/project-intakes/:intakeId/financials',
      input: insertIntakeFinancialSchema.omit({ intakeId: true }),
      responses: {
        201: z.custom<typeof intakeFinancials.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/intake-financials/:id',
      input: insertIntakeFinancialSchema.omit({ intakeId: true }).partial(),
      responses: {
        200: z.custom<typeof intakeFinancials.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/intake-financials/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  intakeGovernanceQuestions: {
    list: {
      method: 'GET' as const,
      path: '/api/project-intakes/:intakeId/governance-questions',
      responses: {
        200: z.array(z.custom<typeof intakeGovernanceQuestions.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/project-intakes/:intakeId/governance-questions',
      input: insertIntakeGovernanceQuestionSchema.omit({ intakeId: true }),
      responses: {
        201: z.custom<typeof intakeGovernanceQuestions.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/intake-governance-questions/:id',
      input: insertIntakeGovernanceQuestionSchema.omit({ intakeId: true }).partial(),
      responses: {
        200: z.custom<typeof intakeGovernanceQuestions.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/intake-governance-questions/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  intakeCostingChecklist: {
    list: {
      method: 'GET' as const,
      path: '/api/project-intakes/:intakeId/costing-checklist',
      responses: {
        200: z.array(z.custom<typeof intakeCostingChecklist.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/project-intakes/:intakeId/costing-checklist',
      input: insertIntakeCostingChecklistSchema.omit({ intakeId: true }),
      responses: {
        201: z.custom<typeof intakeCostingChecklist.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/intake-costing-checklist/:id',
      input: insertIntakeCostingChecklistSchema.omit({ intakeId: true }).partial(),
      responses: {
        200: z.custom<typeof intakeCostingChecklist.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/intake-costing-checklist/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

// ============================================
// HELPER
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
