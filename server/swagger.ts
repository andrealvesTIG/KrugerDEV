import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { generateOpenApiSchemas } from './openapi-schemas';
import { registerMetadata, buildPathsFromExpress } from './route-registry';

const spec = {
  openapi: '3.0.0',
  info: {
    title: 'FridayReport.AI API',
    version: '1.0.0',
    description: 'Enterprise Project Portfolio Management API. Manage portfolios, projects, tasks, risks, issues, resources, timesheets, billing, and more. Supports session-based auth (browser), Basic auth (email + API key for Power BI/analytics), and Bearer token auth (organization-scoped). Base path: /api.',
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
    { name: 'Portfolio Key Dates', description: 'Portfolio-level key dates CRUD (new portfolio_key_dates table)' },
    { name: 'Milestones', description: 'Task milestones (legacy, reads from tasks table with isMilestone=true)' },
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
    { name: 'Analytics', description: 'Power BI analytics endpoints (basicAuth or bearerAuth)' },
    { name: 'API Tokens', description: 'Bearer token management for Analytics API' },
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
    { name: 'Scoring & Benefits', description: 'Project scoring criteria, project scores (with portfolio rollup aggregation), benefits tracking, decisions, and lessons learned' },
    { name: 'Recycle Bin', description: 'Soft-deleted item management' },
    { name: 'Search', description: 'Global search' },
    { name: 'Training', description: 'Training modules, lessons, quizzes, and progress' },
    { name: 'Approval Delegations', description: 'Approval delegation management' },
    { name: 'Rejection Templates', description: 'Timesheet rejection templates' },
    { name: 'Timesheet Compliance', description: 'Timesheet compliance and SLA metrics' },
    { name: 'Project Templates', description: 'Reusable project templates from files or existing projects' },
    { name: 'Referrals', description: 'Referral code management, tracking, and payouts' },
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
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Bearer token auth for Analytics API. Token is scoped to a specific organization.',
      },
    },
    schemas: {
      ...generateOpenApiSchemas(),
    },
  },
  security: [{ sessionAuth: [] }, { bearerAuth: [] }],
  paths: {} as Record<string, any>,
};

registerMetadata({});

export function setupSwagger(app: Express): void {
  const { paths, stats } = buildPathsFromExpress(app);
  spec.paths = paths;

  if (stats.phantomMetadata.length > 0) {
    console.log(`[swagger] ${stats.phantomMetadata.length} metadata entries have no matching Express route (removed from spec):`);
    stats.phantomMetadata.forEach(p => console.log(`  phantom: ${p}`));
  }
  if (stats.undocumented > 0) {
    console.log(`[swagger] ${stats.undocumented} Express routes have no OpenAPI metadata (auto-stubbed)`);
  }
  console.log(`[swagger] OpenAPI spec: ${stats.total} endpoints (${stats.documented} documented, ${stats.undocumented} undocumented)`);

  app.get('/api-docs.json', (_req, res) => {
    res.json(spec);
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'FridayReport.AI API Documentation',
    swaggerOptions: {
      docExpansion: 'none',
    },
  }));
}
