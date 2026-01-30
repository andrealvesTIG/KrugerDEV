import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FridayReport.AI API',
      version: '1.0.0',
      description: 'Enterprise Project Portfolio Management API Documentation',
      contact: {
        name: 'FridayReport.AI Support',
        email: 'support@fridayreport.ai',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API Server',
      },
    ],
    tags: [
      { name: 'Organizations', description: 'Organization management endpoints' },
      { name: 'Portfolios', description: 'Portfolio management endpoints' },
      { name: 'Projects', description: 'Project management endpoints' },
      { name: 'Intakes', description: 'Project intake workflow endpoints' },
      { name: 'Tasks', description: 'Task management endpoints' },
      { name: 'Milestones', description: 'Milestone management endpoints' },
      { name: 'Risks', description: 'Risk management endpoints' },
      { name: 'Issues', description: 'Issue tracking endpoints' },
      { name: 'Resources', description: 'Resource management endpoints' },
      { name: 'Timesheets', description: 'Timesheet management endpoints' },
      { name: 'Invoices', description: 'Invoice management endpoints' },
      { name: 'Documents', description: 'Document management endpoints' },
      { name: 'Users', description: 'User management and API key endpoints' },
      { name: 'Dashboards', description: 'Dashboard endpoints' },
      { name: 'Analytics', description: 'Analytics API endpoints for Power BI and external tools (API key required)' },
      { name: 'Integrations', description: 'Third-party integration endpoints' },
    ],
    components: {
      securitySchemes: {
        sessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session-based authentication via Replit Auth',
        },
        basicAuth: {
          type: 'http',
          scheme: 'basic',
          description: 'Basic authentication for Analytics API. Username = your email, Password = your API key',
        },
      },
      schemas: {
        Organization: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Organization ID' },
            name: { type: 'string', description: 'Organization name' },
            slug: { type: 'string', description: 'URL-friendly slug' },
            description: { type: 'string', description: 'Organization description' },
            logoUrl: { type: 'string', nullable: true, description: 'Logo URL' },
            ownerId: { type: 'string', description: 'Owner user ID' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Portfolio: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Portfolio ID' },
            organizationId: { type: 'integer', description: 'Organization ID' },
            name: { type: 'string', description: 'Portfolio name' },
            description: { type: 'string', description: 'Portfolio description' },
            status: { type: 'string', enum: ['active', 'on-hold', 'completed', 'cancelled'] },
            startDate: { type: 'string', format: 'date', nullable: true },
            endDate: { type: 'string', format: 'date', nullable: true },
            budget: { type: 'number', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Project ID' },
            organizationId: { type: 'integer', description: 'Organization ID' },
            portfolioId: { type: 'integer', nullable: true, description: 'Portfolio ID' },
            name: { type: 'string', description: 'Project name' },
            description: { type: 'string', description: 'Project description' },
            status: { type: 'string', enum: ['Initiation', 'Planning', 'Execution', 'Monitoring', 'Closing'] },
            priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
            startDate: { type: 'string', format: 'date', nullable: true },
            endDate: { type: 'string', format: 'date', nullable: true },
            budget: { type: 'number', nullable: true },
            projectManagerId: { type: 'integer', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ProjectIntake: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Intake ID' },
            organizationId: { type: 'integer', description: 'Organization ID' },
            projectName: { type: 'string', description: 'Proposed project name' },
            description: { type: 'string', description: 'Project description' },
            status: { type: 'string', enum: ['draft', 'submitted', 'in_progress', 'approved', 'rejected'] },
            currentStep: { type: 'string', description: 'Current workflow step' },
            pmoApproved: { type: 'boolean', description: 'PM approval status' },
            createdProjectId: { type: 'integer', nullable: true, description: 'Created project ID after approval' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Task: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Task ID' },
            projectId: { type: 'integer', description: 'Project ID' },
            name: { type: 'string', description: 'Task name' },
            description: { type: 'string', description: 'Task description' },
            status: { type: 'string', enum: ['Not Started', 'In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
            progress: { type: 'integer', minimum: 0, maximum: 100 },
            startDate: { type: 'string', format: 'date', nullable: true },
            endDate: { type: 'string', format: 'date', nullable: true },
            parentId: { type: 'integer', nullable: true, description: 'Parent task ID for subtasks' },
            assignee: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Milestone: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Milestone ID' },
            projectId: { type: 'integer', description: 'Project ID' },
            title: { type: 'string', description: 'Milestone title' },
            description: { type: 'string', description: 'Milestone description' },
            status: { type: 'string', enum: ['Pending', 'In Progress', 'completed', 'Backlog'] },
            dueDate: { type: 'string', format: 'date' },
            priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
          },
        },
        Risk: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Risk ID' },
            projectId: { type: 'integer', description: 'Project ID' },
            title: { type: 'string', description: 'Risk title' },
            description: { type: 'string', description: 'Risk description' },
            probability: { type: 'string', enum: ['Low', 'Medium', 'High'] },
            impact: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
            status: { type: 'string', enum: ['Open', 'Mitigated', 'Closed', 'Occurred'] },
            mitigationPlan: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Issue: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Issue ID' },
            projectId: { type: 'integer', description: 'Project ID' },
            title: { type: 'string', description: 'Issue title' },
            description: { type: 'string', description: 'Issue description' },
            priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
            impact: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
            status: { type: 'string', enum: ['Open', 'In Progress', 'Resolved', 'Closed'] },
            resolution: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Resource: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Resource ID' },
            organizationId: { type: 'integer', description: 'Organization ID' },
            displayName: { type: 'string', description: 'Display name' },
            email: { type: 'string', description: 'Email address' },
            title: { type: 'string', nullable: true, description: 'Job title' },
            department: { type: 'string', nullable: true },
            hourlyRate: { type: 'number', nullable: true },
            weeklyCapacity: { type: 'integer', default: 40 },
            isActive: { type: 'boolean', default: true },
          },
        },
        TimesheetEntry: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Entry ID' },
            organizationId: { type: 'integer', description: 'Organization ID' },
            userId: { type: 'string', description: 'User ID' },
            resourceId: { type: 'integer', nullable: true },
            taskId: { type: 'integer', nullable: true },
            projectId: { type: 'integer', nullable: true },
            entryDate: { type: 'string', format: 'date' },
            hours: { type: 'number' },
            notes: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['draft', 'submitted', 'approved', 'rejected'] },
          },
        },
        Invoice: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Invoice ID' },
            projectId: { type: 'integer', description: 'Project ID' },
            organizationId: { type: 'integer', description: 'Organization ID' },
            invoiceNumber: { type: 'string' },
            title: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string', default: 'USD' },
            status: { type: 'string', enum: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'] },
            invoiceDate: { type: 'string', format: 'date' },
            dueDate: { type: 'string', format: 'date' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' },
          },
        },
      },
    },
    security: [{ sessionAuth: [] }],
  },
  apis: [], // We'll define paths inline below
};

// Generate API paths
const apiPaths = {
  paths: {
    // Organizations
    '/organizations': {
      get: {
        tags: ['Organizations'],
        summary: 'List all organizations',
        description: 'Returns all organizations the current user has access to',
        responses: {
          '200': {
            description: 'List of organizations',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Organization' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Organizations'],
        summary: 'Create a new organization',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Organization created' },
          '400': { description: 'Invalid input' },
        },
      },
    },
    '/organizations/{id}': {
      get: {
        tags: ['Organizations'],
        summary: 'Get organization by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Organization details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Organization' },
              },
            },
          },
          '404': { description: 'Organization not found' },
        },
      },
      put: {
        tags: ['Organizations'],
        summary: 'Update organization',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Organization' },
            },
          },
        },
        responses: {
          '200': { description: 'Organization updated' },
        },
      },
    },
    // Portfolios
    '/portfolios': {
      get: {
        tags: ['Portfolios'],
        summary: 'List portfolios',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' }, description: 'Organization ID' },
        ],
        responses: {
          '200': {
            description: 'List of portfolios',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Portfolio' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Portfolios'],
        summary: 'Create a new portfolio',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Portfolio' },
            },
          },
        },
        responses: {
          '201': { description: 'Portfolio created' },
        },
      },
    },
    '/portfolios/{id}': {
      get: {
        tags: ['Portfolios'],
        summary: 'Get portfolio by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Portfolio details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Portfolio' },
              },
            },
          },
        },
      },
      put: {
        tags: ['Portfolios'],
        summary: 'Update portfolio',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Portfolio updated' },
        },
      },
      delete: {
        tags: ['Portfolios'],
        summary: 'Delete portfolio',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '204': { description: 'Portfolio deleted' },
        },
      },
    },
    // Projects
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List projects',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' }, description: 'Organization ID' },
          { name: 'portfolioId', in: 'query', schema: { type: 'integer' }, description: 'Filter by portfolio' },
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
        ],
        responses: {
          '200': {
            description: 'List of projects',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Project' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create a new project',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Project' },
            },
          },
        },
        responses: {
          '201': { description: 'Project created' },
        },
      },
    },
    '/projects/{id}': {
      get: {
        tags: ['Projects'],
        summary: 'Get project by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Project details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Project' },
              },
            },
          },
        },
      },
      put: {
        tags: ['Projects'],
        summary: 'Update project',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Project updated' },
        },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Delete project',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '204': { description: 'Project deleted' },
        },
      },
    },
    // Project Intakes
    '/project-intakes': {
      get: {
        tags: ['Intakes'],
        summary: 'List project intakes',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'List of intakes',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ProjectIntake' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Intakes'],
        summary: 'Create a new intake',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProjectIntake' },
            },
          },
        },
        responses: {
          '201': { description: 'Intake created' },
        },
      },
    },
    '/project-intakes/{id}': {
      get: {
        tags: ['Intakes'],
        summary: 'Get intake by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Intake details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProjectIntake' },
              },
            },
          },
        },
      },
      put: {
        tags: ['Intakes'],
        summary: 'Update intake',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Intake updated' },
        },
      },
    },
    '/project-intakes/{id}/approve': {
      post: {
        tags: ['Intakes'],
        summary: 'Approve intake and convert to project',
        description: 'Approves the intake and creates a new project. Requires PM approval to be checked.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Intake approved and project created' },
          '400': { description: 'PM approval required' },
        },
      },
    },
    // Tasks
    '/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List tasks',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'projectId', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of tasks',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tasks: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Task' },
                    },
                    total: { type: 'integer' },
                    hasMore: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create a new task',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Task' },
            },
          },
        },
        responses: {
          '201': { description: 'Task created' },
        },
      },
    },
    '/tasks/{id}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get task by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Task details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
        },
      },
      put: {
        tags: ['Tasks'],
        summary: 'Update task',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Task updated' },
        },
      },
      delete: {
        tags: ['Tasks'],
        summary: 'Delete task',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '204': { description: 'Task deleted' },
        },
      },
    },
    // Milestones
    '/milestones': {
      get: {
        tags: ['Milestones'],
        summary: 'List milestones',
        parameters: [
          { name: 'projectId', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'List of milestones',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Milestone' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Milestones'],
        summary: 'Create a new milestone',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Milestone' },
            },
          },
        },
        responses: {
          '201': { description: 'Milestone created' },
        },
      },
    },
    // Risks
    '/risks': {
      get: {
        tags: ['Risks'],
        summary: 'List risks',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'projectId', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'List of risks',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Risk' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Risks'],
        summary: 'Create a new risk',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Risk' },
            },
          },
        },
        responses: {
          '201': { description: 'Risk created' },
        },
      },
    },
    '/risks/{id}': {
      get: {
        tags: ['Risks'],
        summary: 'Get risk by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Risk details' },
        },
      },
      put: {
        tags: ['Risks'],
        summary: 'Update risk',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Risk updated' },
        },
      },
      delete: {
        tags: ['Risks'],
        summary: 'Delete risk',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '204': { description: 'Risk deleted' },
        },
      },
    },
    // Issues
    '/issues': {
      get: {
        tags: ['Issues'],
        summary: 'List issues',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'projectId', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'List of issues',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Issue' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Issues'],
        summary: 'Create a new issue',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Issue' },
            },
          },
        },
        responses: {
          '201': { description: 'Issue created' },
        },
      },
    },
    // Resources
    '/resources': {
      get: {
        tags: ['Resources'],
        summary: 'List resources',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'List of resources',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Resource' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Resources'],
        summary: 'Create a new resource',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Resource' },
            },
          },
        },
        responses: {
          '201': { description: 'Resource created' },
        },
      },
    },
    // Timesheets
    '/timesheet-entries': {
      get: {
        tags: ['Timesheets'],
        summary: 'List timesheet entries',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'List of timesheet entries',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/TimesheetEntry' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Timesheets'],
        summary: 'Create a timesheet entry',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TimesheetEntry' },
            },
          },
        },
        responses: {
          '201': { description: 'Entry created' },
        },
      },
    },
    // Invoices
    '/project-invoices': {
      get: {
        tags: ['Invoices'],
        summary: 'List invoices',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'projectId', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'List of invoices',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Invoice' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Invoices'],
        summary: 'Create an invoice',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Invoice' },
            },
          },
        },
        responses: {
          '201': { description: 'Invoice created' },
        },
      },
    },
    // Documents
    '/projects/{projectId}/documents': {
      get: {
        tags: ['Documents'],
        summary: 'List project documents',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'List of documents' },
        },
      },
      post: {
        tags: ['Documents'],
        summary: 'Upload a document',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  category: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Document uploaded' },
        },
      },
    },
    // Dashboards
    '/dashboard/executive': {
      get: {
        tags: ['Dashboards'],
        summary: 'Get executive dashboard data',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Executive dashboard data' },
        },
      },
    },
    '/dashboard/portfolio': {
      get: {
        tags: ['Dashboards'],
        summary: 'Get portfolio dashboard data',
        parameters: [
          { name: 'orgId', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Portfolio dashboard data' },
        },
      },
    },
    // API Key Management
    '/user/api-key': {
      get: {
        tags: ['Users'],
        summary: 'Get current API key status',
        description: 'Check if the current user has an API key and get a masked version',
        responses: {
          '200': {
            description: 'API key status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    hasApiKey: { type: 'boolean' },
                    apiKey: { type: 'string', nullable: true, description: 'Masked API key (first 8 chars only)' },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Revoke API key',
        description: 'Revoke the current user API key. Any integrations using this key will stop working.',
        responses: {
          '200': { description: 'API key revoked' },
        },
      },
    },
    '/user/api-key/generate': {
      post: {
        tags: ['Users'],
        summary: 'Generate new API key',
        description: 'Generate a new API key for the current user. Any existing key will be replaced.',
        responses: {
          '200': {
            description: 'New API key generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    apiKey: { type: 'string', description: 'The full API key (only shown once)' },
                    usage: {
                      type: 'object',
                      properties: {
                        username: { type: 'string', description: 'Your email' },
                        password: { type: 'string', description: 'Your API key' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    // Analytics API (Power BI Integration)
    '/analytics/projects': {
      get: {
        tags: ['Analytics'],
        summary: 'Get projects data for analytics',
        description: 'Returns flattened project data optimized for Power BI and other analytics tools. Requires API key authentication.',
        security: [{ basicAuth: [] }],
        responses: {
          '200': {
            description: 'List of projects with analytics data',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string' },
                      status: { type: 'string' },
                      organizationName: { type: 'string' },
                      portfolioName: { type: 'string' },
                      budget: { type: 'number' },
                      actualCost: { type: 'number' },
                      startDate: { type: 'string' },
                      endDate: { type: 'string' },
                      progress: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized - Invalid or missing API key' },
        },
      },
    },
    '/analytics/portfolios': {
      get: {
        tags: ['Analytics'],
        summary: 'Get portfolios data for analytics',
        description: 'Returns portfolio summary data for Power BI and analytics tools. Requires API key authentication.',
        security: [{ basicAuth: [] }],
        responses: {
          '200': { description: 'List of portfolios with analytics data' },
          '401': { description: 'Unauthorized - Invalid or missing API key' },
        },
      },
    },
    '/analytics/risks': {
      get: {
        tags: ['Analytics'],
        summary: 'Get risks data for analytics',
        description: 'Returns risk data for Power BI and analytics tools. Requires API key authentication.',
        security: [{ basicAuth: [] }],
        responses: {
          '200': { description: 'List of risks with analytics data' },
          '401': { description: 'Unauthorized - Invalid or missing API key' },
        },
      },
    },
    '/analytics/issues': {
      get: {
        tags: ['Analytics'],
        summary: 'Get issues data for analytics',
        description: 'Returns issue data for Power BI and analytics tools. Requires API key authentication.',
        security: [{ basicAuth: [] }],
        responses: {
          '200': { description: 'List of issues with analytics data' },
          '401': { description: 'Unauthorized - Invalid or missing API key' },
        },
      },
    },
    '/analytics/milestones': {
      get: {
        tags: ['Analytics'],
        summary: 'Get milestones data for analytics',
        description: 'Returns milestone data for Power BI and analytics tools. Requires API key authentication.',
        security: [{ basicAuth: [] }],
        responses: {
          '200': { description: 'List of milestones with analytics data' },
          '401': { description: 'Unauthorized - Invalid or missing API key' },
        },
      },
    },
    '/analytics/intakes': {
      get: {
        tags: ['Analytics'],
        summary: 'Get project intakes data for analytics',
        description: 'Returns intake pipeline data for Power BI and analytics tools. Requires API key authentication.',
        security: [{ basicAuth: [] }],
        responses: {
          '200': { description: 'List of intakes with analytics data' },
          '401': { description: 'Unauthorized - Invalid or missing API key' },
        },
      },
    },
  },
};

// Merge paths with options
const swaggerSpec = {
  ...options.definition,
  ...apiPaths,
};

export function setupSwagger(app: Express): void {
  // Serve swagger docs at /api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'FridayReport.AI API Documentation',
  }));

  // Also serve the raw spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
