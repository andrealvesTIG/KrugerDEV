import { z } from 'zod';
import { 
  insertPortfolioSchema, 
  insertProjectSchema, 
  insertRiskSchema, 
  insertMilestoneSchema,
  insertIssueSchema,
  insertTaskSchema,
  portfolios,
  projects,
  risks,
  milestones,
  issues,
  tasks
} from './schema';

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
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof projects.$inferSelect>()),
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
        health: z.string().optional()
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
  },
  risks: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/risks',
      responses: {
        200: z.array(z.custom<typeof risks.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/risks',
      input: insertRiskSchema,
      responses: {
        201: z.custom<typeof risks.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/risks/:id',
      input: insertRiskSchema.partial(),
      responses: {
        200: z.custom<typeof risks.$inferSelect>(),
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
  },
  milestones: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/milestones',
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
