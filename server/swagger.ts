import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const p = (name: string, location: 'path' | 'query', schema: any, required = true, description?: string) => ({
  name, in: location, required, schema, ...(description ? { description } : {}),
});

const pathId = (name = 'id') => p(name, 'path', { type: 'integer' }, true);
const pathStr = (name: string) => p(name, 'path', { type: 'string' }, true);
const qInt = (name: string, required = false, description?: string) => p(name, 'query', { type: 'integer' }, required, description);
const qStr = (name: string, required = false, description?: string) => p(name, 'query', { type: 'string' }, required, description);

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const arrOf = (name: string) => ({ type: 'array' as const, items: ref(name) });
const json = (schema: any) => ({ 'application/json': { schema } });
const body = (schema: any, required = true) => ({ required, content: json(schema) });

const r200 = (desc: string, schema?: any) => ({
  '200': { description: desc, ...(schema ? { content: json(schema) } : {}) },
});
const r201 = (desc: string, schema?: any) => ({
  '201': { description: desc, ...(schema ? { content: json(schema) } : {}) },
});
const r204 = (desc: string) => ({ '204': { description: desc } });

const err = (code: string, msg: string) => ({
  [code]: { description: msg, content: json(ref('Error')) },
});
const e400 = err('400', 'Bad request');
const e401 = err('401', 'Authentication required');
const e403 = err('403', 'Access denied');
const e404 = err('404', 'Not found');

const authRes = { ...e401 };
const stdRes = { ...e401, ...e403 };
const idRes = { ...e401, ...e404 };
const fullRes = { ...e401, ...e403, ...e404 };
const inputRes = { ...e400, ...e401 };
const createRes = { ...e400, ...e401, ...e403 };
const updateRes = { ...e400, ...e401, ...e403, ...e404 };

const op = (tag: string, summary: string, extras: any = {}) => ({
  tags: [tag], summary, ...extras,
});

const spec = {
  openapi: '3.0.0',
  info: {
    title: 'FridayReport.AI API',
    version: '1.0.0',
    description: 'Enterprise Project Portfolio Management API Documentation',
    contact: { name: 'FridayReport.AI Support', email: 'support@fridayreport.ai' },
  },
  servers: [{ url: '/api', description: 'API Server' }],
  tags: [
    { name: 'Users', description: 'User management' },
    { name: 'User Account', description: 'Current user account & API keys' },
    { name: 'Organizations', description: 'Organization CRUD and settings' },
    { name: 'Organization Members', description: 'Member management, invites, access requests' },
    { name: 'Admin', description: 'Super admin endpoints' },
    { name: 'Portfolios', description: 'Portfolio CRUD, risk assessments' },
    { name: 'Projects', description: 'Project CRUD, history, import/export' },
    { name: 'Tasks', description: 'Task CRUD, dependencies, history, reorder' },
    { name: 'Milestones', description: 'Milestone CRUD' },
    { name: 'Risks', description: 'Risk CRUD, assignments, history' },
    { name: 'Issues', description: 'Issue CRUD, assignments, history, escalation' },
    { name: 'Project Financials', description: 'Project financial records' },
    { name: 'Cost Items', description: 'Project cost item management' },
    { name: 'Resources', description: 'Resource CRUD, skills, availability, assignments' },
    { name: 'Timesheets', description: 'Timesheet entries, approval, periods' },
    { name: 'Invoices', description: 'Invoice CRUD, notes' },
    { name: 'Documents', description: 'Document management' },
    { name: 'Comments', description: 'Project comments' },
    { name: 'Change Requests', description: 'Change request management' },
    { name: 'Project Views', description: 'Saved project views' },
    { name: 'Notifications', description: 'Notification management' },
    { name: 'Project Intakes', description: 'Intake workflow' },
    { name: 'Intake Workflow', description: 'Intake workflow configuration' },
    { name: 'MPP Imports', description: 'MS Project file imports' },
    { name: 'Analytics', description: 'Power BI analytics endpoints (basicAuth)' },
    { name: 'AI', description: 'AI-powered features' },
    { name: 'Billing', description: 'Plans, subscriptions, billing management' },
    { name: 'Dashboards', description: 'Custom dashboards, export, sharing' },
    { name: 'Consents', description: 'Terms & privacy consent management' },
    { name: 'Custom Fields', description: 'Custom field definitions and values' },
    { name: 'Custom Tabs', description: 'Custom tab management' },
    { name: 'Demo Data', description: 'Demo data generation' },
    { name: 'Onboarding', description: 'User onboarding' },
    { name: 'Report Subscriptions', description: 'Scheduled report subscriptions' },
    { name: 'Help Tickets', description: 'Support ticket management' },
    { name: 'Monitoring', description: 'Admin monitoring endpoints' },
    { name: 'External Shares', description: 'Cross-org sharing' },
    { name: 'Scoring & Benefits', description: 'Project scoring, benefits, decisions, lessons learned' },
    { name: 'Recycle Bin', description: 'Soft-deleted item management' },
    { name: 'Search', description: 'Global search' },
    { name: 'Other', description: 'Miscellaneous endpoints' },
  ],
  components: {
    securitySchemes: {
      sessionAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
        description: 'Session-based authentication',
      },
      basicAuth: {
        type: 'http',
        scheme: 'basic',
        description: 'Basic auth for Analytics API. Username = email, Password = API key',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { message: { type: 'string' } },
      },
      Organization: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          logoUrl: { type: 'string', nullable: true },
          ownerId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Portfolio: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string' },
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
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          portfolioId: { type: 'integer', nullable: true },
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['Initiation', 'Planning', 'Execution', 'Monitoring', 'Closing'] },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
          startDate: { type: 'string', format: 'date', nullable: true },
          endDate: { type: 'string', format: 'date', nullable: true },
          budget: { type: 'number', nullable: true },
          health: { type: 'string', enum: ['Green', 'Yellow', 'Red'] },
          completionPercentage: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['Not Started', 'In Progress', 'Completed'] },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
          startDate: { type: 'string', format: 'date', nullable: true },
          endDate: { type: 'string', format: 'date', nullable: true },
          parentId: { type: 'integer', nullable: true },
          assignee: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Milestone: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['Pending', 'In Progress', 'completed', 'Backlog'] },
          dueDate: { type: 'string', format: 'date' },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
        },
      },
      Risk: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string' },
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
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string' },
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
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          displayName: { type: 'string' },
          email: { type: 'string' },
          title: { type: 'string', nullable: true },
          department: { type: 'string', nullable: true },
          hourlyRate: { type: 'number', nullable: true },
          weeklyCapacity: { type: 'integer' },
          isActive: { type: 'boolean' },
        },
      },
      TimesheetEntry: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          userId: { type: 'string' },
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
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          organizationId: { type: 'integer' },
          invoiceNumber: { type: 'string' },
          title: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          status: { type: 'string', enum: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'] },
          invoiceDate: { type: 'string', format: 'date' },
          dueDate: { type: 'string', format: 'date' },
        },
      },
      ProjectIntake: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          projectName: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'submitted', 'in_progress', 'approved', 'rejected'] },
          currentStep: { type: 'string' },
          pmoApproved: { type: 'boolean' },
          createdProjectId: { type: 'integer', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      TaskDependency: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Unique identifier for the dependency record' },
          taskId: { type: 'integer', description: 'The dependent task (the task that depends on another)' },
          dependsOnTaskId: { type: 'integer', description: 'The predecessor task (the task that must complete first)' },
          dependencyType: {
            type: 'string',
            enum: ['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish'],
            default: 'finish-to-start',
            description: 'The type of dependency relationship between the two tasks',
          },
          lagDays: { type: 'integer', default: 0, description: 'Lag (positive) or lead (negative) time in working days between the linked tasks' },
          createdAt: { type: 'string', format: 'date-time', description: 'When the dependency was created' },
        },
        required: ['id', 'taskId', 'dependsOnTaskId'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          firstName: { type: 'string', nullable: true },
          lastName: { type: 'string', nullable: true },
          profileImageUrl: { type: 'string', nullable: true },
          role: { type: 'string' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Document: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          name: { type: 'string' },
          url: { type: 'string' },
          type: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          userId: { type: 'string' },
          content: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ChangeRequest: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          userId: { type: 'string' },
          type: { type: 'string' },
          message: { type: 'string' },
          isRead: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CustomDashboard: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          name: { type: 'string' },
          config: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Plan: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          tier: { type: 'string' },
          monthlyPrice: { type: 'number' },
          yearlyPrice: { type: 'number' },
          features: { type: 'object' },
        },
      },
      HelpTicket: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          subject: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      MppImport: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          fileName: { type: 'string' },
          status: { type: 'string' },
          taskCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RiskAssessment: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          score: { type: 'number' },
          summary: { type: 'string' },
          recommendations: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ProjectFinancial: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          category: { type: 'string' },
          amount: { type: 'number' },
          description: { type: 'string' },
        },
      },
      CostItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          name: { type: 'string' },
          amount: { type: 'number' },
          category: { type: 'string' },
        },
      },
      CustomField: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          name: { type: 'string' },
          fieldType: { type: 'string' },
          options: { type: 'object', nullable: true },
        },
      },
      CustomTab: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          name: { type: 'string' },
          sortOrder: { type: 'integer' },
        },
      },
      ScoringCriterion: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          name: { type: 'string' },
          weight: { type: 'number' },
        },
      },
      ReportSubscription: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          dashboardType: { type: 'string' },
          schedule: { type: 'string' },
          recipients: { type: 'array', items: { type: 'string' } },
        },
      },
      TimesheetPeriod: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          status: { type: 'string' },
        },
      },
      ProjectView: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          organizationId: { type: 'integer' },
          name: { type: 'string' },
          filters: { type: 'object' },
          isDefault: { type: 'boolean' },
        },
      },
    },
  },
  security: [{ sessionAuth: [] }],
  paths: {
    // ======================== USERS ========================
    '/users': {
      get: op('Users', 'List all users', {
        parameters: [qInt('orgId', true, 'Organization ID')],
        responses: { ...r200('List of users', arrOf('User')), ...authRes },
      }),
    },
    '/users/{userId}/role': {
      put: op('Users', 'Update user role', {
        parameters: [pathId('userId')],
        requestBody: body({ type: 'object', properties: { role: { type: 'string' } } }),
        responses: { ...r200('Role updated'), ...updateRes },
      }),
    },
    '/users/{userId}/technician': {
      put: op('Users', 'Update user technician status', {
        parameters: [pathId('userId')],
        requestBody: body({ type: 'object', properties: { isTechnician: { type: 'boolean' } } }),
        responses: { ...r200('Technician status updated'), ...updateRes },
      }),
    },
    '/users/{userId}/deactivate': {
      put: op('Users', 'Deactivate a user', {
        parameters: [pathId('userId')],
        responses: { ...r200('User deactivated'), ...fullRes },
      }),
    },
    '/users/{userId}/reactivate': {
      put: op('Users', 'Reactivate a user', {
        parameters: [pathId('userId')],
        responses: { ...r200('User reactivated'), ...fullRes },
      }),
    },
    '/users/{userId}/profile': {
      patch: op('Users', 'Update user profile', {
        parameters: [pathId('userId')],
        requestBody: body({ type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' } } }),
        responses: { ...r200('Profile updated'), ...updateRes },
      }),
    },
    '/users/{userId}/avatar': {
      patch: op('Users', 'Update user avatar URL', {
        parameters: [pathId('userId')],
        requestBody: body({ type: 'object', properties: { avatarUrl: { type: 'string' } } }),
        responses: { ...r200('Avatar updated'), ...updateRes },
      }),
    },
    '/users/{userId}/avatar/upload-url': {
      post: op('Users', 'Get presigned avatar upload URL', {
        parameters: [pathId('userId')],
        requestBody: body({ type: 'object', properties: { contentType: { type: 'string' } } }),
        responses: { ...r200('Upload URL generated', { type: 'object', properties: { uploadUrl: { type: 'string' }, publicUrl: { type: 'string' } } }), ...createRes },
      }),
    },
    '/users/{userId}/avatar/upload': {
      post: op('Users', 'Upload user avatar directly', {
        parameters: [pathId('userId')],
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { ...r200('Avatar uploaded'), ...createRes },
      }),
    },
    '/users/{userId}': {
      delete: op('Users', 'Delete a user', {
        parameters: [pathId('userId')],
        responses: { ...r200('User deleted'), ...fullRes },
      }),
    },

    // ======================== USER ACCOUNT ========================
    '/user/api-key': {
      get: op('User Account', 'Get current user API key status', {
        responses: { ...r200('API key info'), ...authRes },
      }),
      delete: op('User Account', 'Revoke API key', {
        responses: { ...r200('API key revoked'), ...authRes },
      }),
    },
    '/user/api-key/generate': {
      post: op('User Account', 'Generate new API key', {
        responses: { ...r201('API key generated', { type: 'object', properties: { apiKey: { type: 'string' } } }), ...authRes },
      }),
    },
    '/user/account': {
      delete: op('User Account', 'Delete own account', {
        responses: { ...r200('Account deleted'), ...authRes },
      }),
    },

    // ======================== ORGANIZATIONS ========================
    '/organizations': {
      get: op('Organizations', 'List all organizations', {
        responses: { ...r200('List of organizations', arrOf('Organization')), ...authRes },
      }),
      post: op('Organizations', 'Create a new organization', {
        requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } }),
        responses: { ...r201('Organization created', ref('Organization')), ...inputRes },
      }),
    },
    '/organizations/{id}': {
      get: op('Organizations', 'Get organization by ID', {
        parameters: [pathId()],
        responses: { ...r200('Organization details', ref('Organization')), ...idRes },
      }),
      put: op('Organizations', 'Update organization', {
        parameters: [pathId()],
        requestBody: body(ref('Organization')),
        responses: { ...r200('Organization updated'), ...updateRes },
      }),
      delete: op('Organizations', 'Delete organization', {
        parameters: [pathId()],
        responses: { ...r200('Organization deleted'), ...fullRes },
      }),
    },
    '/organizations/{id}/risk-assessment-config': {
      get: op('Organizations', 'Get risk assessment configuration', {
        parameters: [pathId()],
        responses: { ...r200('Risk assessment config'), ...idRes },
      }),
      put: op('Organizations', 'Update risk assessment configuration', {
        parameters: [pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Config updated'), ...updateRes },
      }),
    },
    '/organizations/{id}/integrations': {
      get: op('Organizations', 'Get organization integrations', {
        parameters: [pathId()],
        responses: { ...r200('Integration settings'), ...idRes },
      }),
    },
    '/organizations/{id}/dashboard-tab-order': {
      get: op('Organizations', 'Get dashboard tab order', {
        parameters: [pathId()],
        responses: { ...r200('Tab order'), ...idRes },
      }),
      put: op('Organizations', 'Update dashboard tab order', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { tabOrder: { type: 'array', items: { type: 'string' } } } }),
        responses: { ...r200('Tab order updated'), ...updateRes },
      }),
    },
    '/organizations/{id}/logo/upload-url': {
      post: op('Organizations', 'Get presigned logo upload URL', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { contentType: { type: 'string' } } }),
        responses: { ...r200('Upload URL'), ...createRes },
      }),
    },
    '/organizations/{id}/logo/upload': {
      post: op('Organizations', 'Upload organization logo directly', {
        parameters: [pathId()],
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { ...r200('Logo uploaded'), ...createRes },
      }),
    },
    '/organizations/{id}/task-assignments': {
      get: op('Organizations', 'Get all task assignments for organization', {
        parameters: [pathId()],
        responses: { ...r200('Task assignments'), ...idRes },
      }),
    },

    // ======================== ORGANIZATION MEMBERS ========================
    '/organizations/{id}/members': {
      get: op('Organization Members', 'List organization members', {
        parameters: [pathId()],
        responses: { ...r200('List of members'), ...idRes },
      }),
      post: op('Organization Members', 'Add member to organization', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { userId: { type: 'string' }, role: { type: 'string' } } }),
        responses: { ...r201('Member added'), ...createRes },
      }),
    },
    '/organizations/{id}/members/{userId}': {
      put: op('Organization Members', 'Update member role', {
        parameters: [pathId(), pathId('userId')],
        requestBody: body({ type: 'object', properties: { role: { type: 'string' } } }),
        responses: { ...r200('Member updated'), ...updateRes },
      }),
      delete: op('Organization Members', 'Remove member from organization', {
        parameters: [pathId(), pathId('userId')],
        responses: { ...r200('Member removed'), ...fullRes },
      }),
    },
    '/users/{userId}/organizations': {
      get: op('Organization Members', 'List organizations for a user', {
        parameters: [pathId('userId')],
        responses: { ...r200('User organizations', arrOf('Organization')), ...authRes },
      }),
    },
    '/organizations/{id}/seats': {
      get: op('Organization Members', 'Get seat usage info', {
        parameters: [pathId()],
        responses: { ...r200('Seat info'), ...idRes },
      }),
    },
    '/organizations/{id}/seats/remove': {
      post: op('Organization Members', 'Remove extra seats', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { count: { type: 'integer' } } }),
        responses: { ...r200('Seats removed'), ...createRes },
      }),
    },
    '/organizations/{id}/seats/purchase': {
      post: op('Organization Members', 'Purchase additional seats', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { count: { type: 'integer' } } }),
        responses: { ...r200('Seats purchased'), ...createRes },
      }),
    },
    '/organizations/{id}/invites': {
      get: op('Organization Members', 'List pending invites', {
        parameters: [pathId()],
        responses: { ...r200('List of invites'), ...idRes },
      }),
      post: op('Organization Members', 'Send organization invite', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { email: { type: 'string' }, role: { type: 'string' } } }),
        responses: { ...r201('Invite sent'), ...createRes },
      }),
    },
    '/organizations/{id}/invites/{inviteId}': {
      delete: op('Organization Members', 'Cancel an invite', {
        parameters: [pathId(), pathId('inviteId')],
        responses: { ...r200('Invite cancelled'), ...fullRes },
      }),
    },
    '/organizations/{id}/invites/{inviteId}/resend': {
      post: op('Organization Members', 'Resend an invite', {
        parameters: [pathId(), pathId('inviteId')],
        responses: { ...r200('Invite resent'), ...fullRes },
      }),
    },
    '/invites/accept': {
      post: op('Organization Members', 'Accept an invite', {
        requestBody: body({ type: 'object', properties: { token: { type: 'string' } } }),
        responses: { ...r200('Invite accepted'), ...inputRes },
      }),
    },
    '/invites/{token}': {
      get: op('Organization Members', 'Get invite details by token', {
        parameters: [pathStr('token')],
        responses: { ...r200('Invite details'), ...e404 },
      }),
    },
    '/organizations/{id}/directory/search': {
      get: op('Organization Members', 'Search organization directory', {
        parameters: [pathId(), qStr('q', true, 'Search query')],
        responses: { ...r200('Search results'), ...idRes },
      }),
    },
    '/organizations/{id}/access-requests': {
      post: op('Organization Members', 'Submit access request', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { message: { type: 'string' } } }),
        responses: { ...r201('Request submitted'), ...createRes },
      }),
      get: op('Organization Members', 'List access requests', {
        parameters: [pathId()],
        responses: { ...r200('Access requests'), ...idRes },
      }),
    },
    '/organizations/{id}/access-requests/my-status': {
      get: op('Organization Members', 'Get current user access request status', {
        parameters: [pathId()],
        responses: { ...r200('Request status'), ...idRes },
      }),
    },
    '/organizations/{id}/access-requests/{requestId}/resend': {
      post: op('Organization Members', 'Resend access request notification', {
        parameters: [pathId(), pathId('requestId')],
        responses: { ...r200('Notification resent'), ...fullRes },
      }),
    },
    '/organizations/{id}/access-requests/{requestId}/approve': {
      post: op('Organization Members', 'Approve access request', {
        parameters: [pathId(), pathId('requestId')],
        responses: { ...r200('Request approved'), ...fullRes },
      }),
    },
    '/organizations/{id}/access-requests/{requestId}/reject': {
      post: op('Organization Members', 'Reject access request', {
        parameters: [pathId(), pathId('requestId')],
        responses: { ...r200('Request rejected'), ...fullRes },
      }),
    },

    // ======================== ADMIN ========================
    '/admin/organizations/deactivated': {
      get: op('Admin', 'List deactivated organizations', {
        responses: { ...r200('Deactivated orgs'), ...stdRes },
      }),
    },
    '/admin/organization-members': {
      get: op('Admin', 'List all organization members (admin)', {
        responses: { ...r200('All members'), ...stdRes },
      }),
    },
    '/admin/organizations/{id}/reactivate': {
      post: op('Admin', 'Reactivate a deactivated organization', {
        parameters: [pathId()],
        responses: { ...r200('Organization reactivated'), ...fullRes },
      }),
    },
    '/admin/organizations/subscriptions': {
      get: op('Admin', 'List all organization subscriptions', {
        responses: { ...r200('Subscriptions list'), ...stdRes },
      }),
    },
    '/admin/send-upgrade-offer': {
      post: op('Admin', 'Send upgrade offer email', {
        requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, message: { type: 'string' } } }),
        responses: { ...r200('Offer sent'), ...createRes },
      }),
    },
    '/admin/organizations/{id}/billing': {
      get: op('Admin', 'Get organization billing info (admin)', {
        parameters: [pathId()],
        responses: { ...r200('Billing info'), ...fullRes },
      }),
      put: op('Admin', 'Update organization billing (admin)', {
        parameters: [pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Billing updated'), ...updateRes },
      }),
    },
    '/admin/consents': {
      get: op('Admin', 'List all user consents', {
        responses: { ...r200('Consents list'), ...stdRes },
      }),
    },
    '/admin/consents/stats': {
      get: op('Admin', 'Get consent statistics', {
        responses: { ...r200('Consent stats'), ...stdRes },
      }),
    },
    '/admin/notifications/check-all': {
      post: op('Admin', 'Trigger notification check for all users', {
        responses: { ...r200('Notifications checked'), ...stdRes },
      }),
    },
    '/admin/plans': {
      get: op('Admin', 'List all billing plans (admin)', {
        responses: { ...r200('Plans list', arrOf('Plan')), ...stdRes },
      }),
      post: op('Admin', 'Create a billing plan', {
        requestBody: body(ref('Plan')),
        responses: { ...r201('Plan created'), ...createRes },
      }),
    },
    '/admin/plans/{id}': {
      put: op('Admin', 'Update a billing plan', {
        parameters: [pathId()],
        requestBody: body(ref('Plan')),
        responses: { ...r200('Plan updated'), ...updateRes },
      }),
      delete: op('Admin', 'Delete a billing plan', {
        parameters: [pathId()],
        responses: { ...r200('Plan deleted'), ...fullRes },
      }),
    },
    '/admin/plans/{id}/credits': {
      get: op('Admin', 'Get plan credit allocations', {
        parameters: [pathId()],
        responses: { ...r200('Plan credits'), ...fullRes },
      }),
    },
    '/admin/plans/{id}/rules': {
      post: op('Admin', 'Add rule to billing plan', {
        parameters: [pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r201('Rule created'), ...createRes },
      }),
    },
    '/admin/plans/{planId}/rules/{ruleId}': {
      put: op('Admin', 'Update a plan rule', {
        parameters: [pathId('planId'), pathId('ruleId')],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Rule updated'), ...updateRes },
      }),
      delete: op('Admin', 'Delete a plan rule', {
        parameters: [pathId('planId'), pathId('ruleId')],
        responses: { ...r200('Rule deleted'), ...fullRes },
      }),
    },
    '/admin/plans/init-extra-seat-prices': {
      post: op('Admin', 'Initialize extra seat prices for all plans', {
        responses: { ...r200('Prices initialized'), ...stdRes },
      }),
    },
    '/admin/plans/reorder': {
      post: op('Admin', 'Reorder billing plans', {
        requestBody: body({ type: 'object', properties: { order: { type: 'array', items: { type: 'integer' } } } }),
        responses: { ...r200('Plans reordered'), ...createRes },
      }),
    },
    '/admin/referrals': {
      get: op('Admin', 'List referral data', {
        responses: { ...r200('Referrals list'), ...stdRes },
      }),
    },
    '/admin/report-subscriptions/check': {
      post: op('Admin', 'Manually trigger report subscription check', {
        responses: { ...r200('Check completed'), ...stdRes },
      }),
    },
    '/admin/paypal/sync-plans': {
      post: op('Admin', 'Sync PayPal plans with billing plans', {
        responses: { ...r200('Plans synced'), ...stdRes },
      }),
    },
    '/admin/credit-costs': {
      get: op('Admin', 'Get AI credit costs configuration', {
        responses: { ...r200('Credit costs'), ...stdRes },
      }),
    },
    '/admin/credit-costs/{resourceType}': {
      post: op('Admin', 'Update credit cost for resource type', {
        parameters: [pathStr('resourceType')],
        requestBody: body({ type: 'object', properties: { cost: { type: 'number' } } }),
        responses: { ...r200('Cost updated'), ...createRes },
      }),
    },
    '/admin/monitoring/overview': {
      get: op('Monitoring', 'System overview dashboard', {
        responses: { ...r200('System overview'), ...stdRes },
      }),
    },
    '/admin/monitoring/api-logs': {
      get: op('Monitoring', 'API request logs', {
        parameters: [qInt('limit'), qStr('method'), qStr('path')],
        responses: { ...r200('API logs'), ...stdRes },
      }),
    },
    '/admin/monitoring/user-activity': {
      get: op('Monitoring', 'User activity metrics', {
        responses: { ...r200('User activity data'), ...stdRes },
      }),
    },
    '/admin/monitoring/feature-usage': {
      get: op('Monitoring', 'Feature usage analytics', {
        responses: { ...r200('Feature usage data'), ...stdRes },
      }),
    },
    '/admin/monitoring/performance': {
      get: op('Monitoring', 'System performance metrics', {
        responses: { ...r200('Performance data'), ...stdRes },
      }),
    },
    '/admin/monitoring/database': {
      get: op('Monitoring', 'Database health and stats', {
        responses: { ...r200('Database stats'), ...stdRes },
      }),
    },
    '/admin/monitoring/organization-usage': {
      get: op('Monitoring', 'Per-organization usage data', {
        responses: { ...r200('Organization usage'), ...stdRes },
      }),
    },
    '/admin/analytics/dashboard': {
      get: op('Admin', 'Admin analytics dashboard', {
        responses: { ...r200('Analytics dashboard data'), ...stdRes },
      }),
    },
    '/admin/help-tickets': {
      get: op('Admin', 'List all help tickets (admin)', {
        parameters: [qStr('status'), qInt('limit')],
        responses: { ...r200('Help tickets', arrOf('HelpTicket')), ...stdRes },
      }),
    },
    '/admin/help-tickets/{id}': {
      get: op('Admin', 'Get help ticket details (admin)', {
        parameters: [pathId()],
        responses: { ...r200('Ticket details', ref('HelpTicket')), ...fullRes },
      }),
      patch: op('Admin', 'Update help ticket (admin)', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { status: { type: 'string' }, response: { type: 'string' } } }),
        responses: { ...r200('Ticket updated'), ...updateRes },
      }),
      delete: op('Admin', 'Delete help ticket (admin)', {
        parameters: [pathId()],
        responses: { ...r200('Ticket deleted'), ...fullRes },
      }),
    },

    // ======================== EXTERNAL SHARES ========================
    '/external-shares': {
      get: op('External Shares', 'List external shares', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('External shares'), ...authRes },
      }),
    },
    '/external-projects': {
      get: op('External Shares', 'List externally shared projects', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('External projects'), ...authRes },
      }),
    },
    '/external-tasks': {
      get: op('External Shares', 'List externally shared tasks', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('External tasks'), ...authRes },
      }),
    },
    '/external-risks': {
      get: op('External Shares', 'List externally shared risks', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('External risks'), ...authRes },
      }),
    },
    '/external-issues': {
      get: op('External Shares', 'List externally shared issues', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('External issues'), ...authRes },
      }),
    },

    // ======================== RECYCLE BIN ========================
    '/organizations/{id}/recycle-bin': {
      get: op('Recycle Bin', 'List soft-deleted items', {
        parameters: [pathId()],
        responses: { ...r200('Deleted items'), ...idRes },
      }),
    },
    '/organizations/{id}/recycle-bin/restore': {
      post: op('Recycle Bin', 'Restore deleted items', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { type: { type: 'string' }, itemIds: { type: 'array', items: { type: 'integer' } } } }),
        responses: { ...r200('Items restored'), ...createRes },
      }),
    },
    '/organizations/{id}/recycle-bin/{type}/{itemId}': {
      delete: op('Recycle Bin', 'Permanently delete an item', {
        parameters: [pathId(), pathStr('type'), pathId('itemId')],
        responses: { ...r200('Item permanently deleted'), ...fullRes },
      }),
    },

    // ======================== SEARCH ========================
    '/search': {
      get: op('Search', 'Global search', {
        parameters: [qStr('q', true, 'Search query'), qInt('orgId', true)],
        responses: { ...r200('Search results'), ...authRes },
      }),
    },

    // ======================== PORTFOLIOS ========================
    '/portfolios': {
      get: op('Portfolios', 'List portfolios', {
        parameters: [qInt('orgId', true, 'Organization ID')],
        responses: { ...r200('List of portfolios', arrOf('Portfolio')), ...authRes },
      }),
      post: op('Portfolios', 'Create a new portfolio', {
        requestBody: body(ref('Portfolio')),
        responses: { ...r201('Portfolio created', ref('Portfolio')), ...inputRes },
      }),
    },
    '/portfolios/{id}': {
      get: op('Portfolios', 'Get portfolio by ID', {
        parameters: [pathId()],
        responses: { ...r200('Portfolio details', ref('Portfolio')), ...idRes },
      }),
      put: op('Portfolios', 'Update portfolio', {
        parameters: [pathId()],
        requestBody: body(ref('Portfolio')),
        responses: { ...r200('Portfolio updated'), ...updateRes },
      }),
      delete: op('Portfolios', 'Delete portfolio', {
        parameters: [pathId()],
        responses: { ...r204('Portfolio deleted'), ...fullRes },
      }),
    },
    '/portfolios/{id}/projects': {
      get: op('Portfolios', 'List projects in portfolio', {
        parameters: [pathId()],
        responses: { ...r200('Portfolio projects', arrOf('Project')), ...idRes },
      }),
    },
    '/portfolios/{id}/custom-projects': {
      post: op('Portfolios', 'Add custom project to portfolio', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { projectId: { type: 'integer' } } }),
        responses: { ...r201('Project added to portfolio'), ...createRes },
      }),
    },
    '/portfolios/{id}/custom-projects/{projectId}': {
      delete: op('Portfolios', 'Remove custom project from portfolio', {
        parameters: [pathId(), pathId('projectId')],
        responses: { ...r200('Project removed'), ...fullRes },
      }),
    },
    '/portfolios/{id}/risks': {
      get: op('Portfolios', 'List risks across portfolio projects', {
        parameters: [pathId()],
        responses: { ...r200('Portfolio risks', arrOf('Risk')), ...idRes },
      }),
    },
    '/portfolios/{id}/issues': {
      get: op('Portfolios', 'List issues across portfolio projects', {
        parameters: [pathId()],
        responses: { ...r200('Portfolio issues', arrOf('Issue')), ...idRes },
      }),
    },
    '/portfolios/{id}/milestones': {
      get: op('Portfolios', 'List milestones across portfolio projects', {
        parameters: [pathId()],
        responses: { ...r200('Portfolio milestones', arrOf('Milestone')), ...idRes },
      }),
    },
    '/portfolios/{id}/risk-assessment': {
      post: op('Portfolios', 'Run AI risk assessment for portfolio', {
        parameters: [pathId()],
        responses: { ...r201('Risk assessment created', ref('RiskAssessment')), ...createRes },
      }),
    },
    '/portfolios/{id}/risk-assessment/latest': {
      get: op('Portfolios', 'Get latest portfolio risk assessment', {
        parameters: [pathId()],
        responses: { ...r200('Latest assessment', ref('RiskAssessment')), ...idRes },
      }),
    },
    '/portfolios/{id}/risk-assessment/history': {
      get: op('Portfolios', 'Get portfolio risk assessment history', {
        parameters: [pathId()],
        responses: { ...r200('Assessment history', arrOf('RiskAssessment')), ...idRes },
      }),
    },
    '/portfolio-risk-assessments/org/{orgId}': {
      get: op('Portfolios', 'Get all portfolio risk assessments for org', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Org portfolio assessments'), ...idRes },
      }),
    },
    '/project-risk-assessments/org/{orgId}': {
      get: op('Portfolios', 'Get all project risk assessments for org', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Org project assessments'), ...idRes },
      }),
    },
    '/portfolio-risk-assessments/share/{token}': {
      get: op('Portfolios', 'View shared risk assessment (public)', {
        parameters: [pathStr('token')],
        security: [],
        responses: { ...r200('Shared assessment'), ...e404 },
      }),
    },
    '/portfolio-risk-assessments/share/{token}/pdf': {
      get: op('Portfolios', 'Download shared risk assessment as PDF (public)', {
        parameters: [pathStr('token')],
        security: [],
        responses: { '200': { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, ...e404 },
      }),
    },
    '/portfolios/{id}/risk-assessment/{assessmentId}/pdf': {
      get: op('Portfolios', 'Download portfolio risk assessment PDF', {
        parameters: [pathId(), pathId('assessmentId')],
        responses: { '200': { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, ...fullRes },
      }),
    },
    '/portfolios/{id}/overview': {
      get: op('Portfolios', 'Get portfolio overview with stats', {
        parameters: [pathId()],
        responses: { ...r200('Portfolio overview'), ...idRes },
      }),
    },

    // ======================== PROJECTS ========================
    '/projects': {
      get: op('Projects', 'List projects', {
        parameters: [qInt('orgId', true, 'Organization ID'), qInt('portfolioId', false, 'Filter by portfolio'), qStr('status', false, 'Filter by status')],
        responses: { ...r200('List of projects', arrOf('Project')), ...authRes },
      }),
      post: op('Projects', 'Create a new project', {
        requestBody: body(ref('Project')),
        responses: { ...r201('Project created', ref('Project')), ...inputRes },
      }),
    },
    '/projects/{id}': {
      get: op('Projects', 'Get project by ID', {
        parameters: [pathId()],
        responses: { ...r200('Project details', ref('Project')), ...idRes },
      }),
      put: op('Projects', 'Update project', {
        parameters: [pathId()],
        requestBody: body(ref('Project')),
        responses: { ...r200('Project updated'), ...updateRes },
      }),
      delete: op('Projects', 'Delete project', {
        parameters: [pathId()],
        responses: { ...r204('Project deleted'), ...fullRes },
      }),
    },
    '/projects/{id}/history': {
      get: op('Projects', 'Get project change history', {
        parameters: [pathId()],
        responses: { ...r200('Change history'), ...idRes },
      }),
    },
    '/projects/{id}/risk-assessment': {
      post: op('Projects', 'Run AI risk assessment for project', {
        parameters: [pathId()],
        responses: { ...r201('Risk assessment created', ref('RiskAssessment')), ...createRes },
      }),
    },
    '/projects/{id}/risk-assessment/latest': {
      get: op('Projects', 'Get latest project risk assessment', {
        parameters: [pathId()],
        responses: { ...r200('Latest assessment', ref('RiskAssessment')), ...idRes },
      }),
    },
    '/projects/{id}/risk-assessment/history': {
      get: op('Projects', 'Get project risk assessment history', {
        parameters: [pathId()],
        responses: { ...r200('Assessment history', arrOf('RiskAssessment')), ...idRes },
      }),
    },

    // ======================== TASKS ========================
    '/projects/{projectId}/tasks': {
      get: op('Tasks', 'List tasks for a project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Project tasks', arrOf('Task')), ...idRes },
      }),
    },
    '/tasks': {
      get: op('Tasks', 'List all tasks', {
        parameters: [qInt('orgId', true), qInt('projectId'), qStr('status'), qInt('limit'), qInt('offset')],
        responses: { ...r200('Tasks list', { type: 'object', properties: { tasks: arrOf('Task'), total: { type: 'integer' }, hasMore: { type: 'boolean' } } }), ...authRes },
      }),
      post: op('Tasks', 'Create a new task', {
        requestBody: body(ref('Task')),
        responses: { ...r201('Task created', ref('Task')), ...inputRes },
      }),
    },
    '/tasks/{id}': {
      get: op('Tasks', 'Get task by ID', {
        parameters: [pathId()],
        responses: { ...r200('Task details', ref('Task')), ...idRes },
      }),
      put: op('Tasks', 'Update task', {
        parameters: [pathId()],
        requestBody: body(ref('Task')),
        responses: { ...r200('Task updated'), ...updateRes },
      }),
      delete: op('Tasks', 'Delete task', {
        parameters: [pathId()],
        responses: { ...r204('Task deleted'), ...fullRes },
      }),
    },
    '/tasks/{id}/history': {
      get: op('Tasks', 'Get task change history', {
        parameters: [pathId()],
        responses: { ...r200('Task history'), ...idRes },
      }),
    },
    '/tasks/{id}/dependencies': {
      get: op('Tasks', 'Get task dependencies', {
        summary: 'Get all dependencies for a specific task',
        description: 'Returns an array of TaskDependency records where the given task is the dependent task (taskId). Each record identifies a predecessor task that must complete before this task can start (or as defined by the dependency type).',
        parameters: [pathId()],
        responses: {
          ...r200('Array of dependency records for the task', arrOf('TaskDependency')),
          ...idRes,
        },
      }),
      post: op('Tasks', 'Add task dependency', {
        summary: 'Add a dependency to a task',
        description: 'Creates a finish-to-start dependency where the specified task depends on the given predecessor task. Both tasks must be leaf tasks (no children). Self-dependencies and circular dependencies are not allowed.',
        parameters: [pathId()],
        requestBody: body({
          type: 'object',
          required: ['dependsOnTaskId'],
          properties: {
            dependsOnTaskId: { type: 'integer', description: 'The ID of the predecessor task that must complete first' },
          },
        }),
        responses: {
          ...r201('The created dependency record', ref('TaskDependency')),
          ...createRes,
        },
      }),
    },
    '/tasks/{id}/dependencies/{dependsOnTaskId}': {
      delete: op('Tasks', 'Remove task dependency', {
        summary: 'Remove a dependency from a task',
        description: 'Removes the dependency relationship between the task (id) and its predecessor (dependsOnTaskId).',
        parameters: [pathId(), pathId('dependsOnTaskId')],
        responses: { ...r200('Dependency removed successfully'), ...fullRes },
      }),
    },
    '/projects/{projectId}/dependencies': {
      get: op('Tasks', 'Get all dependencies for a project', {
        summary: 'Get all task dependencies within a project',
        description: 'Returns all TaskDependency records for tasks belonging to the specified project. Useful for building a full dependency graph or Gantt chart.',
        parameters: [pathId('projectId')],
        responses: {
          ...r200('Array of all dependency records in the project', arrOf('TaskDependency')),
          ...idRes,
        },
      }),
    },
    '/projects/{projectId}/recalculate-schedule': {
      post: op('Tasks', 'Recalculate project schedule (CPM)', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Schedule recalculated'), ...createRes },
      }),
    },
    '/projects/{projectId}/tasks/reorder': {
      post: op('Tasks', 'Reorder tasks in project', {
        parameters: [pathId('projectId')],
        requestBody: body({ type: 'object', properties: { taskIds: { type: 'array', items: { type: 'integer' } } } }),
        responses: { ...r200('Tasks reordered'), ...createRes },
      }),
    },
    '/projects/{projectId}/tasks/reindex': {
      post: op('Tasks', 'Reindex task row indices', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Tasks reindexed'), ...createRes },
      }),
    },

    // ======================== MILESTONES ========================
    '/projects/{projectId}/milestones': {
      get: op('Milestones', 'List milestones for a project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Project milestones', arrOf('Milestone')), ...idRes },
      }),
    },
    '/milestones': {
      get: op('Milestones', 'List all milestones', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Milestones list', arrOf('Milestone')), ...authRes },
      }),
      post: op('Milestones', 'Create a new milestone', {
        requestBody: body(ref('Milestone')),
        responses: { ...r201('Milestone created', ref('Milestone')), ...inputRes },
      }),
    },
    '/milestones/{id}': {
      put: op('Milestones', 'Update milestone', {
        parameters: [pathId()],
        requestBody: body(ref('Milestone')),
        responses: { ...r200('Milestone updated'), ...updateRes },
      }),
      delete: op('Milestones', 'Delete milestone', {
        parameters: [pathId()],
        responses: { ...r204('Milestone deleted'), ...fullRes },
      }),
    },

    // ======================== RISKS ========================
    '/projects/{projectId}/risks': {
      get: op('Risks', 'List risks for a project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Project risks', arrOf('Risk')), ...idRes },
      }),
    },
    '/risks': {
      get: op('Risks', 'List all risks', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Risks list', arrOf('Risk')), ...authRes },
      }),
      post: op('Risks', 'Create a new risk', {
        requestBody: body(ref('Risk')),
        responses: { ...r201('Risk created', ref('Risk')), ...inputRes },
      }),
    },
    '/risks/{id}': {
      put: op('Risks', 'Update risk', {
        parameters: [pathId()],
        requestBody: body(ref('Risk')),
        responses: { ...r200('Risk updated'), ...updateRes },
      }),
      delete: op('Risks', 'Delete risk', {
        parameters: [pathId()],
        responses: { ...r204('Risk deleted'), ...fullRes },
      }),
    },
    '/risks/{id}/history': {
      get: op('Risks', 'Get risk change history', {
        parameters: [pathId()],
        responses: { ...r200('Risk history'), ...idRes },
      }),
    },
    '/risks/{riskId}/resources': {
      get: op('Risks', 'Get resources assigned to a risk', {
        parameters: [pathId('riskId')],
        responses: { ...r200('Assigned resources'), ...idRes },
      }),
      put: op('Risks', 'Update risk resource assignments', {
        parameters: [pathId('riskId')],
        requestBody: body({ type: 'object', properties: { resourceIds: { type: 'array', items: { type: 'integer' } } } }),
        responses: { ...r200('Assignments updated'), ...updateRes },
      }),
    },

    // ======================== ISSUES ========================
    '/projects/{projectId}/issues': {
      get: op('Issues', 'List issues for a project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Project issues', arrOf('Issue')), ...idRes },
      }),
    },
    '/issues': {
      get: op('Issues', 'List all issues', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Issues list', arrOf('Issue')), ...authRes },
      }),
      post: op('Issues', 'Create a new issue', {
        requestBody: body(ref('Issue')),
        responses: { ...r201('Issue created', ref('Issue')), ...inputRes },
      }),
    },
    '/issues/{id}': {
      put: op('Issues', 'Update issue', {
        parameters: [pathId()],
        requestBody: body(ref('Issue')),
        responses: { ...r200('Issue updated'), ...updateRes },
      }),
      delete: op('Issues', 'Delete issue', {
        parameters: [pathId()],
        responses: { ...r204('Issue deleted'), ...fullRes },
      }),
    },
    '/issues/{id}/history': {
      get: op('Issues', 'Get issue change history', {
        parameters: [pathId()],
        responses: { ...r200('Issue history'), ...idRes },
      }),
    },
    '/issues/{id}/escalate': {
      post: op('Issues', 'Escalate an issue', {
        parameters: [pathId()],
        responses: { ...r200('Issue escalated'), ...fullRes },
      }),
    },
    '/issues/{issueId}/resources': {
      get: op('Issues', 'Get resources assigned to an issue', {
        parameters: [pathId('issueId')],
        responses: { ...r200('Assigned resources'), ...idRes },
      }),
      put: op('Issues', 'Update issue resource assignments', {
        parameters: [pathId('issueId')],
        requestBody: body({ type: 'object', properties: { resourceIds: { type: 'array', items: { type: 'integer' } } } }),
        responses: { ...r200('Assignments updated'), ...updateRes },
      }),
    },

    // ======================== PROJECT FINANCIALS ========================
    '/projects/{projectId}/financials': {
      get: op('Project Financials', 'List financial records for project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Financial records', arrOf('ProjectFinancial')), ...idRes },
      }),
      post: op('Project Financials', 'Create financial record', {
        parameters: [pathId('projectId')],
        requestBody: body(ref('ProjectFinancial')),
        responses: { ...r201('Record created'), ...createRes },
      }),
    },
    '/project-financials/{id}': {
      get: op('Project Financials', 'Get financial record by ID', {
        parameters: [pathId()],
        responses: { ...r200('Financial record', ref('ProjectFinancial')), ...idRes },
      }),
      put: op('Project Financials', 'Update financial record', {
        parameters: [pathId()],
        requestBody: body(ref('ProjectFinancial')),
        responses: { ...r200('Record updated'), ...updateRes },
      }),
      delete: op('Project Financials', 'Delete financial record', {
        parameters: [pathId()],
        responses: { ...r200('Record deleted'), ...fullRes },
      }),
    },

    // ======================== COST ITEMS ========================
    '/projects/{projectId}/cost-items': {
      get: op('Cost Items', 'List cost items for project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Cost items', arrOf('CostItem')), ...idRes },
      }),
      post: op('Cost Items', 'Create cost item', {
        parameters: [pathId('projectId')],
        requestBody: body(ref('CostItem')),
        responses: { ...r201('Cost item created'), ...createRes },
      }),
    },
    '/cost-items/{id}': {
      get: op('Cost Items', 'Get cost item by ID', {
        parameters: [pathId()],
        responses: { ...r200('Cost item', ref('CostItem')), ...idRes },
      }),
      put: op('Cost Items', 'Update cost item', {
        parameters: [pathId()],
        requestBody: body(ref('CostItem')),
        responses: { ...r200('Cost item updated'), ...updateRes },
      }),
      delete: op('Cost Items', 'Delete cost item', {
        parameters: [pathId()],
        responses: { ...r200('Cost item deleted'), ...fullRes },
      }),
    },

    // ======================== RESOURCES ========================
    '/resources': {
      get: op('Resources', 'List resources', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Resources list', arrOf('Resource')), ...authRes },
      }),
      post: op('Resources', 'Create a new resource', {
        requestBody: body(ref('Resource')),
        responses: { ...r201('Resource created', ref('Resource')), ...inputRes },
      }),
    },
    '/resources/duplicates': {
      get: op('Resources', 'Find duplicate resources', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Duplicate groups'), ...authRes },
      }),
    },
    '/resources/merge': {
      post: op('Resources', 'Merge duplicate resources', {
        requestBody: body({ type: 'object', properties: { primaryId: { type: 'integer' }, duplicateIds: { type: 'array', items: { type: 'integer' } } } }),
        responses: { ...r200('Resources merged'), ...createRes },
      }),
    },
    '/resources/invite': {
      post: op('Resources', 'Invite resource via email', {
        requestBody: body({ type: 'object', properties: { email: { type: 'string' }, organizationId: { type: 'integer' } } }),
        responses: { ...r201('Invitation sent'), ...createRes },
      }),
    },
    '/resources/{id}': {
      put: op('Resources', 'Update resource', {
        parameters: [pathId()],
        requestBody: body(ref('Resource')),
        responses: { ...r200('Resource updated'), ...updateRes },
      }),
      delete: op('Resources', 'Delete resource', {
        parameters: [pathId()],
        responses: { ...r204('Resource deleted'), ...fullRes },
      }),
    },
    '/resources/{id}/availability': {
      get: op('Resources', 'Get resource availability', {
        parameters: [pathId()],
        responses: { ...r200('Availability data'), ...idRes },
      }),
    },
    '/resources/{id}/assignments': {
      get: op('Resources', 'Get resource assignments', {
        parameters: [pathId()],
        responses: { ...r200('Assignments'), ...idRes },
      }),
    },
    '/resources/{id}/task-assignments': {
      get: op('Resources', 'Get resource task assignments', {
        parameters: [pathId()],
        responses: { ...r200('Task assignments'), ...idRes },
      }),
    },
    '/resources/{id}/issue-assignments': {
      get: op('Resources', 'Get resource issue assignments', {
        parameters: [pathId()],
        responses: { ...r200('Issue assignments'), ...idRes },
      }),
    },
    '/tasks/{taskId}/resources': {
      get: op('Resources', 'Get resources assigned to a task', {
        parameters: [pathId('taskId')],
        responses: { ...r200('Task resources'), ...idRes },
      }),
      put: op('Resources', 'Update task resource assignments', {
        parameters: [pathId('taskId')],
        requestBody: body({ type: 'object', properties: { resourceIds: { type: 'array', items: { type: 'integer' } } } }),
        responses: { ...r200('Assignments updated'), ...updateRes },
      }),
    },
    '/organizations/{orgId}/resources/{resourceId}/skills': {
      get: op('Resources', 'Get resource skills', {
        parameters: [pathId('orgId'), pathId('resourceId')],
        responses: { ...r200('Resource skills'), ...idRes },
      }),
      post: op('Resources', 'Add skill to resource', {
        parameters: [pathId('orgId'), pathId('resourceId')],
        requestBody: body({ type: 'object', properties: { name: { type: 'string' }, level: { type: 'string' } } }),
        responses: { ...r201('Skill added'), ...createRes },
      }),
    },
    '/organizations/{orgId}/resource-skills': {
      get: op('Resources', 'List all resource skills for org', {
        parameters: [pathId('orgId')],
        responses: { ...r200('All resource skills'), ...idRes },
      }),
    },
    '/organizations/{orgId}/resource-skills/{id}': {
      patch: op('Resources', 'Update a resource skill', {
        parameters: [pathId('orgId'), pathId()],
        requestBody: body({ type: 'object', properties: { name: { type: 'string' }, level: { type: 'string' } } }),
        responses: { ...r200('Skill updated'), ...updateRes },
      }),
      delete: op('Resources', 'Delete a resource skill', {
        parameters: [pathId('orgId'), pathId()],
        responses: { ...r200('Skill deleted'), ...fullRes },
      }),
    },
    '/organizations/{orgId}/resources/{resourceId}/availability': {
      get: op('Resources', 'Get resource availability entries', {
        parameters: [pathId('orgId'), pathId('resourceId')],
        responses: { ...r200('Availability entries'), ...idRes },
      }),
      post: op('Resources', 'Add availability entry for resource', {
        parameters: [pathId('orgId'), pathId('resourceId')],
        requestBody: body({ type: 'object', properties: { startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' }, hoursPerWeek: { type: 'number' } } }),
        responses: { ...r201('Availability entry created'), ...createRes },
      }),
    },
    '/organizations/{orgId}/resource-availability': {
      get: op('Resources', 'List all resource availability for org', {
        parameters: [pathId('orgId')],
        responses: { ...r200('All availability'), ...idRes },
      }),
    },
    '/organizations/{orgId}/resource-availability/{id}': {
      patch: op('Resources', 'Update an availability entry', {
        parameters: [pathId('orgId'), pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Availability updated'), ...updateRes },
      }),
      delete: op('Resources', 'Delete an availability entry', {
        parameters: [pathId('orgId'), pathId()],
        responses: { ...r200('Availability deleted'), ...fullRes },
      }),
    },
    '/organizations/{orgId}/resource-optimization': {
      post: op('Resources', 'Run AI resource optimization', {
        parameters: [pathId('orgId')],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Optimization results'), ...createRes },
      }),
    },
    '/organizations/{orgId}/resource-utilization': {
      get: op('Resources', 'Get resource utilization report', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Utilization data'), ...idRes },
      }),
    },
    '/resource-assignments': {
      get: op('Resources', 'Get all resource assignments', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('All assignments'), ...authRes },
      }),
    },
    '/dashboard/utilization': {
      get: op('Resources', 'Get utilization dashboard data', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Utilization dashboard'), ...authRes },
      }),
    },

    // ======================== TIMESHEETS ========================
    '/timesheets': {
      get: op('Timesheets', 'List timesheet entries', {
        parameters: [qInt('orgId', true), qStr('startDate'), qStr('endDate'), qStr('status')],
        responses: { ...r200('Timesheet entries', arrOf('TimesheetEntry')), ...authRes },
      }),
      post: op('Timesheets', 'Create timesheet entry', {
        requestBody: body(ref('TimesheetEntry')),
        responses: { ...r201('Timesheet entry created', ref('TimesheetEntry')), ...inputRes },
      }),
    },
    '/timesheets/{id}': {
      put: op('Timesheets', 'Update timesheet entry', {
        parameters: [pathId()],
        requestBody: body(ref('TimesheetEntry')),
        responses: { ...r200('Entry updated'), ...updateRes },
      }),
      delete: op('Timesheets', 'Delete timesheet entry', {
        parameters: [pathId()],
        responses: { ...r204('Entry deleted'), ...fullRes },
      }),
    },
    '/timesheets/bulk': {
      post: op('Timesheets', 'Create/update timesheet entries in bulk', {
        requestBody: body({ type: 'object', properties: { entries: { type: 'array', items: ref('TimesheetEntry') } } }),
        responses: { ...r201('Timesheet entries created'), ...inputRes },
      }),
    },
    '/timesheets/current-resource': {
      get: op('Timesheets', 'Get current user resource for timesheets', {
        responses: { ...r200('Current resource'), ...authRes },
      }),
    },
    '/timesheets/my-report': {
      get: op('Timesheets', 'Get current user timesheet report', {
        parameters: [qStr('startDate'), qStr('endDate')],
        responses: { ...r200('My report'), ...authRes },
      }),
    },
    '/timesheets/team': {
      get: op('Timesheets', 'Get team timesheet report', {
        parameters: [qInt('orgId', true), qStr('startDate'), qStr('endDate')],
        responses: { ...r200('Team report'), ...authRes },
      }),
    },
    '/timesheets/assigned-tasks': {
      get: op('Timesheets', 'Get tasks assigned to current user for time logging', {
        responses: { ...r200('Assigned tasks'), ...authRes },
      }),
    },
    '/timesheets/submit-week': {
      post: op('Timesheets', 'Submit a week of timesheets for approval', {
        requestBody: body({ type: 'object', properties: { weekStartDate: { type: 'string', format: 'date' } } }),
        responses: { ...r200('Week submitted'), ...inputRes },
      }),
    },
    '/timesheets/approval': {
      get: op('Timesheets', 'Get entries pending approval', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Pending approvals'), ...authRes },
      }),
    },
    '/timesheets/{id}/approve': {
      post: op('Timesheets', 'Approve a timesheet entry', {
        parameters: [pathId()],
        responses: { ...r200('Entry approved'), ...fullRes },
      }),
    },
    '/timesheets/{id}/reject': {
      post: op('Timesheets', 'Reject a timesheet entry', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { reason: { type: 'string' } } }, false),
        responses: { ...r200('Entry rejected'), ...fullRes },
      }),
    },
    '/timesheet-periods': {
      get: op('Timesheets', 'List timesheet periods', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Timesheet periods', arrOf('TimesheetPeriod')), ...authRes },
      }),
      post: op('Timesheets', 'Create timesheet period', {
        requestBody: body(ref('TimesheetPeriod')),
        responses: { ...r201('Period created'), ...inputRes },
      }),
    },
    '/timesheet-periods/closed': {
      get: op('Timesheets', 'List closed timesheet periods', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Closed periods'), ...authRes },
      }),
    },
    '/timesheet-periods/{id}': {
      put: op('Timesheets', 'Update timesheet period', {
        parameters: [pathId()],
        requestBody: body(ref('TimesheetPeriod')),
        responses: { ...r200('Period updated'), ...updateRes },
      }),
      delete: op('Timesheets', 'Delete timesheet period', {
        parameters: [pathId()],
        responses: { ...r200('Period deleted'), ...fullRes },
      }),
    },
    '/timesheet-periods/{id}/close': {
      post: op('Timesheets', 'Close a timesheet period', {
        parameters: [pathId()],
        responses: { ...r200('Period closed'), ...fullRes },
      }),
    },
    '/timesheet-periods/{id}/reopen': {
      post: op('Timesheets', 'Reopen a closed timesheet period', {
        parameters: [pathId()],
        responses: { ...r200('Period reopened'), ...fullRes },
      }),
    },
    '/non-project-time': {
      get: op('Timesheets', 'List non-project time entries', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Non-project time entries'), ...authRes },
      }),
      post: op('Timesheets', 'Create non-project time entry', {
        requestBody: body({ type: 'object' }),
        responses: { ...r201('Entry created'), ...inputRes },
      }),
    },
    '/non-project-time/{id}': {
      put: op('Timesheets', 'Update non-project time entry', {
        parameters: [pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Entry updated'), ...updateRes },
      }),
      delete: op('Timesheets', 'Delete non-project time entry', {
        parameters: [pathId()],
        responses: { ...r200('Entry deleted'), ...fullRes },
      }),
    },
    '/time-categories': {
      get: op('Timesheets', 'List time categories', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Time categories'), ...authRes },
      }),
      post: op('Timesheets', 'Create time category', {
        requestBody: body({ type: 'object', properties: { name: { type: 'string' }, organizationId: { type: 'integer' } } }),
        responses: { ...r201('Category created'), ...inputRes },
      }),
    },
    '/time-categories/{id}': {
      put: op('Timesheets', 'Update time category', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { name: { type: 'string' } } }),
        responses: { ...r200('Category updated'), ...updateRes },
      }),
      delete: op('Timesheets', 'Delete time category', {
        parameters: [pathId()],
        responses: { ...r200('Category deleted'), ...fullRes },
      }),
    },

    // ======================== INVOICES ========================
    '/organizations/{organizationId}/invoices': {
      get: op('Invoices', 'List invoices for organization', {
        parameters: [pathId('organizationId')],
        responses: { ...r200('Organization invoices', arrOf('Invoice')), ...idRes },
      }),
    },
    '/projects/{projectId}/invoices': {
      get: op('Invoices', 'List invoices for project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Project invoices', arrOf('Invoice')), ...idRes },
      }),
      post: op('Invoices', 'Create invoice for project', {
        parameters: [pathId('projectId')],
        requestBody: body(ref('Invoice')),
        responses: { ...r201('Invoice created', ref('Invoice')), ...createRes },
      }),
    },
    '/invoices/{invoiceId}': {
      patch: op('Invoices', 'Update invoice', {
        parameters: [pathId('invoiceId')],
        requestBody: body(ref('Invoice')),
        responses: { ...r200('Invoice updated'), ...updateRes },
      }),
      delete: op('Invoices', 'Delete invoice', {
        parameters: [pathId('invoiceId')],
        responses: { ...r200('Invoice deleted'), ...fullRes },
      }),
    },
    '/invoices/{invoiceId}/notes': {
      get: op('Invoices', 'List invoice notes', {
        parameters: [pathId('invoiceId')],
        responses: { ...r200('Invoice notes'), ...idRes },
      }),
      post: op('Invoices', 'Add note to invoice', {
        parameters: [pathId('invoiceId')],
        requestBody: body({ type: 'object', properties: { content: { type: 'string' } } }),
        responses: { ...r201('Note added'), ...createRes },
      }),
    },

    // ======================== DOCUMENTS ========================
    '/projects/{projectId}/documents': {
      get: op('Documents', 'List project documents', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Documents list', arrOf('Document')), ...idRes },
      }),
      post: op('Documents', 'Add document to project', {
        parameters: [pathId('projectId')],
        requestBody: body(ref('Document')),
        responses: { ...r201('Document added', ref('Document')), ...createRes },
      }),
    },
    '/documents/{id}': {
      patch: op('Documents', 'Update document', {
        parameters: [pathId()],
        requestBody: body(ref('Document')),
        responses: { ...r200('Document updated'), ...updateRes },
      }),
      delete: op('Documents', 'Delete document', {
        parameters: [pathId()],
        responses: { ...r200('Document deleted'), ...fullRes },
      }),
    },

    // ======================== COMMENTS ========================
    '/projects/{projectId}/comments': {
      get: op('Comments', 'List project comments', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Comments list', arrOf('Comment')), ...idRes },
      }),
      post: op('Comments', 'Add comment to project', {
        parameters: [pathId('projectId')],
        requestBody: body({ type: 'object', properties: { content: { type: 'string' } } }),
        responses: { ...r201('Comment added', ref('Comment')), ...createRes },
      }),
    },
    '/comments/{id}': {
      delete: op('Comments', 'Delete comment', {
        parameters: [pathId()],
        responses: { ...r200('Comment deleted'), ...fullRes },
      }),
    },
    '/projects/{projectId}/billable-status-comments': {
      get: op('Comments', 'List billable status comments for project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Billable status comments'), ...idRes },
      }),
      post: op('Comments', 'Add billable status comment', {
        parameters: [pathId('projectId')],
        requestBody: body({ type: 'object', properties: { content: { type: 'string' }, billableStatus: { type: 'string' } } }),
        responses: { ...r201('Comment added'), ...createRes },
      }),
    },
    '/projects/{projectId}/health-status-history': {
      get: op('Comments', 'Get project health status history', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Health status history'), ...idRes },
      }),
    },

    // ======================== CHANGE REQUESTS ========================
    '/projects/{projectId}/change-requests': {
      get: op('Change Requests', 'List change requests for project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Change requests', arrOf('ChangeRequest')), ...idRes },
      }),
      post: op('Change Requests', 'Create change request', {
        parameters: [pathId('projectId')],
        requestBody: body(ref('ChangeRequest')),
        responses: { ...r201('Change request created', ref('ChangeRequest')), ...createRes },
      }),
    },
    '/change-requests/{id}': {
      patch: op('Change Requests', 'Update change request', {
        parameters: [pathId()],
        requestBody: body(ref('ChangeRequest')),
        responses: { ...r200('Change request updated'), ...updateRes },
      }),
      delete: op('Change Requests', 'Delete change request', {
        parameters: [pathId()],
        responses: { ...r200('Change request deleted'), ...fullRes },
      }),
    },

    // ======================== PROJECT VIEWS ========================
    '/organizations/{orgId}/project-views': {
      get: op('Project Views', 'List saved project views', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Project views', arrOf('ProjectView')), ...idRes },
      }),
      post: op('Project Views', 'Create project view', {
        parameters: [pathId('orgId')],
        requestBody: body(ref('ProjectView')),
        responses: { ...r201('View created'), ...createRes },
      }),
    },
    '/project-views/{id}': {
      patch: op('Project Views', 'Update project view', {
        parameters: [pathId()],
        requestBody: body(ref('ProjectView')),
        responses: { ...r200('View updated'), ...updateRes },
      }),
      delete: op('Project Views', 'Delete project view', {
        parameters: [pathId()],
        responses: { ...r200('View deleted'), ...fullRes },
      }),
    },
    '/project-views/{id}/set-default': {
      post: op('Project Views', 'Set project view as default', {
        parameters: [pathId()],
        responses: { ...r200('Default view set'), ...fullRes },
      }),
    },
    '/organizations/{orgId}/system-project-views': {
      get: op('Project Views', 'List system project views', {
        parameters: [pathId('orgId')],
        responses: { ...r200('System views'), ...idRes },
      }),
      post: op('Project Views', 'Create system project view', {
        parameters: [pathId('orgId')],
        requestBody: body({ type: 'object' }),
        responses: { ...r201('System view created'), ...createRes },
      }),
    },
    '/organizations/{orgId}/system-project-views/all': {
      get: op('Project Views', 'List all system project views including hidden', {
        parameters: [pathId('orgId')],
        responses: { ...r200('All system views'), ...idRes },
      }),
    },
    '/system-project-views/{id}': {
      patch: op('Project Views', 'Update system project view', {
        parameters: [pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('System view updated'), ...updateRes },
      }),
      delete: op('Project Views', 'Delete system project view', {
        parameters: [pathId()],
        responses: { ...r200('System view deleted'), ...fullRes },
      }),
    },

    // ======================== NOTIFICATIONS ========================
    '/notifications': {
      get: op('Notifications', 'List notifications for current user', {
        parameters: [qInt('limit'), qInt('offset')],
        responses: { ...r200('Notifications', arrOf('Notification')), ...authRes },
      }),
    },
    '/notifications/unread-count': {
      get: op('Notifications', 'Get unread notification count', {
        responses: { ...r200('Unread count', { type: 'object', properties: { count: { type: 'integer' } } }), ...authRes },
      }),
    },
    '/notifications/{id}/read': {
      patch: op('Notifications', 'Mark notification as read', {
        parameters: [pathId()],
        responses: { ...r200('Marked as read'), ...idRes },
      }),
    },
    '/notifications/read-all': {
      patch: op('Notifications', 'Mark all notifications as read', {
        responses: { ...r200('All marked as read'), ...authRes },
      }),
    },
    '/organizations/{orgId}/notifications/check': {
      post: op('Notifications', 'Trigger notification check for organization', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Check complete'), ...fullRes },
      }),
    },

    // ======================== PROJECT INTAKES ========================
    '/project-intakes': {
      get: op('Project Intakes', 'List project intakes', {
        parameters: [qInt('orgId', true), qStr('status')],
        responses: { ...r200('Intakes list', arrOf('ProjectIntake')), ...authRes },
      }),
      post: op('Project Intakes', 'Create a new intake', {
        requestBody: body(ref('ProjectIntake')),
        responses: { ...r201('Intake created', ref('ProjectIntake')), ...inputRes },
      }),
    },
    '/project-intakes/{id}': {
      get: op('Project Intakes', 'Get intake by ID', {
        parameters: [pathId()],
        responses: { ...r200('Intake details', ref('ProjectIntake')), ...idRes },
      }),
      put: op('Project Intakes', 'Update intake', {
        parameters: [pathId()],
        requestBody: body(ref('ProjectIntake')),
        responses: { ...r200('Intake updated'), ...updateRes },
      }),
      delete: op('Project Intakes', 'Delete intake', {
        parameters: [pathId()],
        responses: { ...r200('Intake deleted'), ...fullRes },
      }),
    },
    '/organizations/{orgId}/can-approve-intakes': {
      get: op('Project Intakes', 'Check if user can approve intakes', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Approval permission', { type: 'object', properties: { canApprove: { type: 'boolean' } } }), ...idRes },
      }),
    },
    '/project-intakes/{id}/approve': {
      post: op('Project Intakes', 'Approve intake and convert to project', {
        parameters: [pathId()],
        responses: { ...r200('Intake approved, project created'), ...fullRes, ...e400 },
      }),
    },
    '/project-intakes/{id}/reject': {
      post: op('Project Intakes', 'Reject an intake', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { reason: { type: 'string' } } }, false),
        responses: { ...r200('Intake rejected'), ...fullRes },
      }),
    },

    // ======================== INTAKE WORKFLOW ========================
    '/organizations/{orgId}/intake-workflow': {
      get: op('Intake Workflow', 'Get intake workflow configuration', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Workflow config'), ...idRes },
      }),
      put: op('Intake Workflow', 'Update intake workflow configuration', {
        parameters: [pathId('orgId')],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Workflow updated'), ...updateRes },
      }),
    },
    '/organizations/{orgId}/intake-workflow/reset': {
      post: op('Intake Workflow', 'Reset intake workflow to defaults', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Workflow reset'), ...fullRes },
      }),
    },

    // ======================== MPP IMPORTS ========================
    '/mpp-imports': {
      get: op('MPP Imports', 'List MS Project imports', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Import list', arrOf('MppImport')), ...authRes },
      }),
    },
    '/mpp-imports/{id}/tasks': {
      get: op('MPP Imports', 'Get parsed tasks from import', {
        parameters: [pathId()],
        responses: { ...r200('Parsed tasks'), ...idRes },
      }),
    },
    '/mpp-imports/upload': {
      post: op('MPP Imports', 'Upload MPP/XML/CSV file for import', {
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, projectId: { type: 'integer' }, organizationId: { type: 'integer' } } } } } },
        responses: { ...r201('Import created', ref('MppImport')), ...inputRes },
      }),
    },
    '/mpp-imports/{id}/convert': {
      post: op('MPP Imports', 'Convert imported tasks to project tasks', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { projectId: { type: 'integer' } } }, false),
        responses: { ...r200('Tasks converted'), ...createRes },
      }),
    },
    '/mpp-imports/{id}/sync': {
      post: op('MPP Imports', 'Sync imported tasks with existing project', {
        parameters: [pathId()],
        responses: { ...r200('Tasks synced'), ...createRes },
      }),
    },
    '/mpp-imports/{id}': {
      delete: op('MPP Imports', 'Delete an import', {
        parameters: [pathId()],
        responses: { ...r200('Import deleted'), ...fullRes },
      }),
    },

    // ======================== ANALYTICS ========================
    '/analytics/projects': {
      get: op('Analytics', 'Get projects data for Power BI', {
        security: [{ basicAuth: [] }],
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Projects analytics data', arrOf('Project')), ...e401 },
      }),
    },
    '/analytics/portfolios': {
      get: op('Analytics', 'Get portfolios data for Power BI', {
        security: [{ basicAuth: [] }],
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Portfolios analytics data', arrOf('Portfolio')), ...e401 },
      }),
    },
    '/analytics/risks': {
      get: op('Analytics', 'Get risks data for Power BI', {
        security: [{ basicAuth: [] }],
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Risks analytics data', arrOf('Risk')), ...e401 },
      }),
    },
    '/analytics/issues': {
      get: op('Analytics', 'Get issues data for Power BI', {
        security: [{ basicAuth: [] }],
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Issues analytics data', arrOf('Issue')), ...e401 },
      }),
    },
    '/analytics/milestones': {
      get: op('Analytics', 'Get milestones data for Power BI', {
        security: [{ basicAuth: [] }],
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Milestones analytics data', arrOf('Milestone')), ...e401 },
      }),
    },
    '/analytics/intakes': {
      get: op('Analytics', 'Get intakes data for Power BI', {
        security: [{ basicAuth: [] }],
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Intakes analytics data', arrOf('ProjectIntake')), ...e401 },
      }),
    },
    '/analytics/summary': {
      get: op('Analytics', 'Get summary analytics for Power BI', {
        security: [{ basicAuth: [] }],
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Summary analytics'), ...e401 },
      }),
    },

    // ======================== AI ========================
    '/ai/generate-project': {
      post: op('AI', 'Generate project structure from description', {
        requestBody: body({ type: 'object', properties: { description: { type: 'string' }, organizationId: { type: 'integer' } } }),
        responses: { ...r201('Project generated'), ...inputRes },
      }),
    },
    '/ai/smart-create': {
      post: op('AI', 'Smart create with AI', {
        requestBody: body({ type: 'object', properties: { prompt: { type: 'string' }, organizationId: { type: 'integer' } } }),
        responses: { ...r200('Smart create result'), ...inputRes },
      }),
    },
    '/ai/smart-create/preview': {
      post: op('AI', 'Preview AI smart create result', {
        requestBody: body({ type: 'object', properties: { prompt: { type: 'string' }, organizationId: { type: 'integer' } } }),
        responses: { ...r200('Preview data'), ...inputRes },
      }),
    },
    '/ai/smart-create/execute': {
      post: op('AI', 'Execute AI smart create', {
        requestBody: body({ type: 'object', properties: { plan: { type: 'object' }, organizationId: { type: 'integer' } } }),
        responses: { ...r201('Entities created'), ...inputRes },
      }),
    },
    '/ai/voice-usage': {
      post: op('AI', 'Log AI voice usage', {
        requestBody: body({ type: 'object', properties: { durationSeconds: { type: 'number' } } }),
        responses: { ...r200('Usage logged'), ...inputRes },
      }),
    },

    // ======================== BILLING ========================
    '/billing/plans': {
      get: op('Billing', 'List available billing plans', {
        responses: { ...r200('Plans list', arrOf('Plan')), ...authRes },
      }),
    },
    '/billing/subscription': {
      get: op('Billing', 'Get current subscription', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Subscription details'), ...authRes },
      }),
      post: op('Billing', 'Create new subscription', {
        requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, planId: { type: 'integer' }, billingCycle: { type: 'string' } } }),
        responses: { ...r201('Subscription created'), ...inputRes },
      }),
    },
    '/billing/subscription/{id}/plan': {
      put: op('Billing', 'Change subscription plan', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { planId: { type: 'integer' } } }),
        responses: { ...r200('Plan changed'), ...updateRes },
      }),
    },
    '/billing/usage': {
      get: op('Billing', 'Get current usage metrics', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Usage data'), ...authRes },
      }),
    },
    '/billing/history': {
      get: op('Billing', 'Get billing history', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Billing history'), ...authRes },
      }),
    },
    '/billing/cycle-history': {
      get: op('Billing', 'Get billing cycle history', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Cycle history'), ...authRes },
      }),
    },
    '/billing/credit-ledger': {
      get: op('Billing', 'Get credit ledger', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Credit ledger'), ...authRes },
      }),
    },
    '/billing/ai-costs': {
      get: op('Billing', 'Get AI feature costs', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('AI costs'), ...authRes },
      }),
    },
    '/billing/enterprise-inquiry': {
      post: op('Billing', 'Submit enterprise plan inquiry', {
        requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, message: { type: 'string' } } }),
        responses: { ...r201('Inquiry submitted'), ...inputRes },
      }),
    },
    '/billing/payment-method': {
      get: op('Billing', 'Get payment method on file', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Payment method'), ...authRes },
      }),
    },
    '/billing/subscription/paypal': {
      post: op('Billing', 'Create PayPal subscription', {
        requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, planId: { type: 'integer' }, subscriptionId: { type: 'string' } } }),
        responses: { ...r201('Subscription created'), ...inputRes },
      }),
    },
    '/paypal/setup': {
      post: op('Billing', 'Setup PayPal payment', {
        requestBody: body({ type: 'object' }),
        responses: { ...r200('PayPal setup data'), ...inputRes },
      }),
    },
    '/paypal/order': {
      post: op('Billing', 'Create PayPal order', {
        requestBody: body({ type: 'object', properties: { amount: { type: 'number' } } }),
        responses: { ...r200('PayPal order created'), ...inputRes },
      }),
    },
    '/paypal/order/{orderID}/capture': {
      post: op('Billing', 'Capture PayPal order', {
        parameters: [pathStr('orderID')],
        responses: { ...r200('Order captured'), ...fullRes },
      }),
    },
    '/webhooks/paypal': {
      post: op('Billing', 'PayPal webhook handler', {
        security: [],
        responses: { ...r200('Webhook processed') },
      }),
    },

    // ======================== DASHBOARDS ========================
    '/custom-dashboards': {
      get: op('Dashboards', 'List custom dashboards', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Dashboards list', arrOf('CustomDashboard')), ...authRes },
      }),
      post: op('Dashboards', 'Create custom dashboard', {
        requestBody: body(ref('CustomDashboard')),
        responses: { ...r201('Dashboard created', ref('CustomDashboard')), ...inputRes },
      }),
    },
    '/custom-dashboards/generate': {
      post: op('Dashboards', 'Generate dashboard with AI', {
        requestBody: body({ type: 'object', properties: { prompt: { type: 'string' }, organizationId: { type: 'integer' } } }),
        responses: { ...r201('Dashboard generated'), ...inputRes },
      }),
    },
    '/custom-dashboards/{id}': {
      get: op('Dashboards', 'Get custom dashboard by ID', {
        parameters: [pathId()],
        responses: { ...r200('Dashboard details', ref('CustomDashboard')), ...idRes },
      }),
      patch: op('Dashboards', 'Update custom dashboard', {
        parameters: [pathId()],
        requestBody: body(ref('CustomDashboard')),
        responses: { ...r200('Dashboard updated'), ...updateRes },
      }),
      delete: op('Dashboards', 'Delete custom dashboard', {
        parameters: [pathId()],
        responses: { ...r200('Dashboard deleted'), ...fullRes },
      }),
    },
    '/dashboard/{type}/export': {
      post: op('Dashboards', 'Export dashboard as PDF/image', {
        parameters: [pathStr('type')],
        requestBody: body({ type: 'object', properties: { format: { type: 'string' }, filters: { type: 'object' } } }),
        responses: { ...r200('Export data'), ...createRes },
      }),
    },
    '/dashboard/{type}/share': {
      post: op('Dashboards', 'Share dashboard via email', {
        parameters: [pathStr('type')],
        requestBody: body({ type: 'object', properties: { recipients: { type: 'array', items: { type: 'string' } }, message: { type: 'string' } } }),
        responses: { ...r200('Dashboard shared'), ...createRes },
      }),
    },

    // ======================== CONSENTS ========================
    '/consents/status': {
      get: op('Consents', 'Get current user consent status', {
        responses: { ...r200('Consent status'), ...authRes },
      }),
    },
    '/consents': {
      get: op('Consents', 'Get user consents', {
        responses: { ...r200('Consents list'), ...authRes },
      }),
      post: op('Consents', 'Record user consent', {
        requestBody: body({ type: 'object', properties: { termsVersion: { type: 'string' }, privacyVersion: { type: 'string' } } }),
        responses: { ...r201('Consent recorded'), ...inputRes },
      }),
    },
    '/consents/accept-all': {
      post: op('Consents', 'Accept all current terms and privacy', {
        responses: { ...r200('All accepted'), ...authRes },
      }),
    },

    // ======================== CUSTOM FIELDS ========================
    '/organizations/{organizationId}/custom-fields': {
      get: op('Custom Fields', 'List custom field definitions', {
        parameters: [pathId('organizationId')],
        responses: { ...r200('Custom fields', arrOf('CustomField')), ...idRes },
      }),
      post: op('Custom Fields', 'Create custom field definition', {
        parameters: [pathId('organizationId')],
        requestBody: body(ref('CustomField')),
        responses: { ...r201('Field created'), ...createRes },
      }),
    },
    '/custom-fields/{id}': {
      put: op('Custom Fields', 'Update custom field definition', {
        parameters: [pathId()],
        requestBody: body(ref('CustomField')),
        responses: { ...r200('Field updated'), ...updateRes },
      }),
      delete: op('Custom Fields', 'Delete custom field definition', {
        parameters: [pathId()],
        responses: { ...r200('Field deleted'), ...fullRes },
      }),
    },
    '/projects/{projectId}/custom-field-values': {
      get: op('Custom Fields', 'Get custom field values for project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Field values'), ...idRes },
      }),
      put: op('Custom Fields', 'Batch update custom field values', {
        parameters: [pathId('projectId')],
        requestBody: body({ type: 'object', properties: { values: { type: 'array', items: { type: 'object', properties: { fieldDefinitionId: { type: 'integer' }, value: { type: 'string' } } } } } }),
        responses: { ...r200('Values updated'), ...updateRes },
      }),
    },
    '/projects/{projectId}/custom-field-values/{fieldDefinitionId}': {
      put: op('Custom Fields', 'Set custom field value for project', {
        parameters: [pathId('projectId'), pathId('fieldDefinitionId')],
        requestBody: body({ type: 'object', properties: { value: { type: 'string' } } }),
        responses: { ...r200('Value set'), ...updateRes },
      }),
      delete: op('Custom Fields', 'Delete custom field value', {
        parameters: [pathId('projectId'), pathId('fieldDefinitionId')],
        responses: { ...r200('Value deleted'), ...fullRes },
      }),
    },

    // ======================== CUSTOM TABS ========================
    '/organizations/{organizationId}/custom-tabs': {
      get: op('Custom Tabs', 'List custom tabs for organization', {
        parameters: [pathId('organizationId')],
        responses: { ...r200('Custom tabs', arrOf('CustomTab')), ...idRes },
      }),
      post: op('Custom Tabs', 'Create custom tab', {
        parameters: [pathId('organizationId')],
        requestBody: body(ref('CustomTab')),
        responses: { ...r201('Tab created'), ...createRes },
      }),
    },
    '/custom-tabs/{id}': {
      put: op('Custom Tabs', 'Update custom tab', {
        parameters: [pathId()],
        requestBody: body(ref('CustomTab')),
        responses: { ...r200('Tab updated'), ...updateRes },
      }),
      delete: op('Custom Tabs', 'Delete custom tab', {
        parameters: [pathId()],
        responses: { ...r200('Tab deleted'), ...fullRes },
      }),
    },
    '/custom-tabs/{id}/full': {
      get: op('Custom Tabs', 'Get custom tab with all sections and fields', {
        parameters: [pathId()],
        responses: { ...r200('Full tab data'), ...idRes },
      }),
    },
    '/custom-tabs/{tabId}/sections': {
      get: op('Custom Tabs', 'List sections in a custom tab', {
        parameters: [pathId('tabId')],
        responses: { ...r200('Tab sections'), ...idRes },
      }),
      post: op('Custom Tabs', 'Create section in custom tab', {
        parameters: [pathId('tabId')],
        requestBody: body({ type: 'object', properties: { name: { type: 'string' }, sortOrder: { type: 'integer' } } }),
        responses: { ...r201('Section created'), ...createRes },
      }),
    },
    '/custom-tab-sections/{id}': {
      put: op('Custom Tabs', 'Update custom tab section', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { name: { type: 'string' }, sortOrder: { type: 'integer' } } }),
        responses: { ...r200('Section updated'), ...updateRes },
      }),
      delete: op('Custom Tabs', 'Delete custom tab section', {
        parameters: [pathId()],
        responses: { ...r200('Section deleted'), ...fullRes },
      }),
    },
    '/custom-tab-sections/{sectionId}/fields': {
      get: op('Custom Tabs', 'List fields in a section', {
        parameters: [pathId('sectionId')],
        responses: { ...r200('Section fields'), ...idRes },
      }),
      post: op('Custom Tabs', 'Create field in section', {
        parameters: [pathId('sectionId')],
        requestBody: body({ type: 'object', properties: { name: { type: 'string' }, fieldType: { type: 'string' }, sortOrder: { type: 'integer' } } }),
        responses: { ...r201('Field created'), ...createRes },
      }),
    },
    '/custom-tab-fields/{id}': {
      put: op('Custom Tabs', 'Update custom tab field', {
        parameters: [pathId()],
        requestBody: body({ type: 'object', properties: { name: { type: 'string' }, fieldType: { type: 'string' } } }),
        responses: { ...r200('Field updated'), ...updateRes },
      }),
      delete: op('Custom Tabs', 'Delete custom tab field', {
        parameters: [pathId()],
        responses: { ...r200('Field deleted'), ...fullRes },
      }),
    },
    '/project-field-definitions': {
      get: op('Custom Tabs', 'Get all project field definitions', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Field definitions'), ...authRes },
      }),
    },

    // ======================== SCORING & BENEFITS ========================
    '/organizations/{organizationId}/scoring-criteria': {
      get: op('Scoring & Benefits', 'List scoring criteria for organization', {
        parameters: [pathId('organizationId')],
        responses: { ...r200('Scoring criteria', arrOf('ScoringCriterion')), ...idRes },
      }),
      post: op('Scoring & Benefits', 'Create scoring criterion', {
        parameters: [pathId('organizationId')],
        requestBody: body(ref('ScoringCriterion')),
        responses: { ...r201('Criterion created'), ...createRes },
      }),
    },
    '/scoring-criteria/{id}': {
      put: op('Scoring & Benefits', 'Update scoring criterion', {
        parameters: [pathId()],
        requestBody: body(ref('ScoringCriterion')),
        responses: { ...r200('Criterion updated'), ...updateRes },
      }),
      delete: op('Scoring & Benefits', 'Delete scoring criterion', {
        parameters: [pathId()],
        responses: { ...r200('Criterion deleted'), ...fullRes },
      }),
    },
    '/projects/{projectId}/scores': {
      get: op('Scoring & Benefits', 'Get project scores', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Project scores'), ...idRes },
      }),
      post: op('Scoring & Benefits', 'Add project score', {
        parameters: [pathId('projectId')],
        requestBody: body({ type: 'object', properties: { criterionId: { type: 'integer' }, score: { type: 'number' } } }),
        responses: { ...r201('Score added'), ...createRes },
      }),
    },
    '/project-scores/{id}': {
      delete: op('Scoring & Benefits', 'Delete project score', {
        parameters: [pathId()],
        responses: { ...r200('Score deleted'), ...fullRes },
      }),
    },
    '/projects/{projectId}/benefits': {
      get: op('Scoring & Benefits', 'List project benefits', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Benefits list'), ...idRes },
      }),
      post: op('Scoring & Benefits', 'Add project benefit', {
        parameters: [pathId('projectId')],
        requestBody: body({ type: 'object', properties: { description: { type: 'string' }, value: { type: 'number' } } }),
        responses: { ...r201('Benefit added'), ...createRes },
      }),
    },
    '/project-benefits/{id}': {
      put: op('Scoring & Benefits', 'Update project benefit', {
        parameters: [pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Benefit updated'), ...updateRes },
      }),
      delete: op('Scoring & Benefits', 'Delete project benefit', {
        parameters: [pathId()],
        responses: { ...r200('Benefit deleted'), ...fullRes },
      }),
    },
    '/projects/{projectId}/decisions': {
      get: op('Scoring & Benefits', 'List project decisions', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Decisions list'), ...idRes },
      }),
      post: op('Scoring & Benefits', 'Add project decision', {
        parameters: [pathId('projectId')],
        requestBody: body({ type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } } }),
        responses: { ...r201('Decision added'), ...createRes },
      }),
    },
    '/project-decisions/{id}': {
      put: op('Scoring & Benefits', 'Update project decision', {
        parameters: [pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Decision updated'), ...updateRes },
      }),
      delete: op('Scoring & Benefits', 'Delete project decision', {
        parameters: [pathId()],
        responses: { ...r200('Decision deleted'), ...fullRes },
      }),
    },
    '/projects/{projectId}/lessons-learned': {
      get: op('Scoring & Benefits', 'List lessons learned for project', {
        parameters: [pathId('projectId')],
        responses: { ...r200('Lessons learned'), ...idRes },
      }),
      post: op('Scoring & Benefits', 'Add lesson learned', {
        parameters: [pathId('projectId')],
        requestBody: body({ type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' } } }),
        responses: { ...r201('Lesson added'), ...createRes },
      }),
    },
    '/organizations/{organizationId}/lessons-learned': {
      get: op('Scoring & Benefits', 'List all lessons learned for organization', {
        parameters: [pathId('organizationId')],
        responses: { ...r200('All lessons learned'), ...idRes },
      }),
    },
    '/lessons-learned/{id}': {
      put: op('Scoring & Benefits', 'Update lesson learned', {
        parameters: [pathId()],
        requestBody: body({ type: 'object' }),
        responses: { ...r200('Lesson updated'), ...updateRes },
      }),
      delete: op('Scoring & Benefits', 'Delete lesson learned', {
        parameters: [pathId()],
        responses: { ...r200('Lesson deleted'), ...fullRes },
      }),
    },

    // ======================== DEMO DATA ========================
    '/demo-data/industries': {
      get: op('Demo Data', 'List available demo data industries', {
        responses: { ...r200('Industries list'), ...authRes },
      }),
    },
    '/demo-data/generate': {
      post: op('Demo Data', 'Generate demo data for organization', {
        requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, industry: { type: 'string' } } }),
        responses: { ...r201('Demo data generated'), ...inputRes },
      }),
    },
    '/demo-data/{organizationId}': {
      delete: op('Demo Data', 'Delete demo data for organization', {
        parameters: [pathId('organizationId')],
        responses: { ...r200('Demo data deleted'), ...fullRes },
      }),
    },

    // ======================== ONBOARDING ========================
    '/onboarding/status': {
      get: op('Onboarding', 'Get onboarding status', {
        responses: { ...r200('Onboarding status'), ...authRes },
      }),
    },
    '/onboarding/complete': {
      post: op('Onboarding', 'Mark onboarding as complete', {
        responses: { ...r200('Onboarding completed'), ...authRes },
      }),
    },
    '/onboarding/skip': {
      post: op('Onboarding', 'Skip onboarding', {
        responses: { ...r200('Onboarding skipped'), ...authRes },
      }),
    },
    '/onboarding/generate-sample-data': {
      post: op('Onboarding', 'Generate sample data during onboarding', {
        requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' } } }),
        responses: { ...r200('Sample data generated'), ...inputRes },
      }),
    },

    // ======================== REPORT SUBSCRIPTIONS ========================
    '/report-subscriptions/dashboards': {
      get: op('Report Subscriptions', 'List available dashboards for subscriptions', {
        responses: { ...r200('Available dashboards'), ...authRes },
      }),
    },
    '/organizations/{orgId}/report-subscriptions': {
      get: op('Report Subscriptions', 'List report subscriptions', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Subscriptions', arrOf('ReportSubscription')), ...idRes },
      }),
      post: op('Report Subscriptions', 'Create report subscription', {
        parameters: [pathId('orgId')],
        requestBody: body(ref('ReportSubscription')),
        responses: { ...r201('Subscription created'), ...createRes },
      }),
    },
    '/organizations/{orgId}/report-subscriptions/{id}': {
      put: op('Report Subscriptions', 'Update report subscription', {
        parameters: [pathId('orgId'), pathId()],
        requestBody: body(ref('ReportSubscription')),
        responses: { ...r200('Subscription updated'), ...updateRes },
      }),
      delete: op('Report Subscriptions', 'Delete report subscription', {
        parameters: [pathId('orgId'), pathId()],
        responses: { ...r200('Subscription deleted'), ...fullRes },
      }),
    },
    '/organizations/{orgId}/report-subscriptions/{id}/send-now': {
      post: op('Report Subscriptions', 'Send report immediately', {
        parameters: [pathId('orgId'), pathId()],
        responses: { ...r200('Report sent'), ...fullRes },
      }),
    },

    // ======================== HELP TICKETS ========================
    '/help-tickets': {
      post: op('Help Tickets', 'Submit a help ticket', {
        requestBody: body(ref('HelpTicket')),
        responses: { ...r201('Ticket submitted', ref('HelpTicket')), ...inputRes },
      }),
    },

    // ======================== OTHER ========================
    '/xkcd/random': {
      get: op('Other', 'Get random XKCD comic', {
        security: [],
        responses: { ...r200('XKCD comic data') },
      }),
    },
    '/home/recent-activity': {
      get: op('Other', 'Get recent activity feed', {
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Recent activity'), ...authRes },
      }),
    },
    '/organizations/{orgId}/act-as': {
      post: op('Other', 'Act as another user (admin impersonation)', {
        parameters: [pathId('orgId')],
        requestBody: body({ type: 'object', properties: { userId: { type: 'string' } } }),
        responses: { ...r200('Now acting as user'), ...fullRes },
      }),
      delete: op('Other', 'Stop acting as another user', {
        parameters: [pathId('orgId')],
        responses: { ...r200('Stopped impersonation'), ...fullRes },
      }),
    },
  },
};

export function setupSwagger(app: Express): void {
  app.get('/api-docs.json', (_req, res) => {
    res.json(spec);
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'FridayReport.AI API Documentation',
  }));
}
