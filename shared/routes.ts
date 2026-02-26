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
  portfolios,
  projects,
  milestones,
  issues,
  tasks,
  taskChangeLogs,
  projectChangeLogs,
  issueChangeLogs,
  taskDependencies,
  projectFinancials
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
        completionPercentage: z.number().optional(),
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
      input: z.object({ dependsOnTaskId: z.number() }),
      responses: {
        201: z.custom<typeof taskDependencies.$inferSelect>(),
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
