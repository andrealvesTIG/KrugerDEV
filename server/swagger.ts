import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { getRegisteredPaths } from './route-registry';
import { generateOpenApiSchemas } from './openapi-schemas';

export function setupSwagger(app: Express): void {
  const registry = new OpenAPIRegistry();
  const generator = new OpenApiGeneratorV3(registry.definitions);

  const doc = generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'FridayReport.AI API',
      version: '1.0.0',
      description:
        'Enterprise Project Portfolio Management API. Manage portfolios, projects, tasks, risks, issues, resources, timesheets, billing, and more. Supports session-based auth (browser), Basic auth (email + API key for Power BI/analytics), and Bearer token auth (organization-scoped). Base path: /api.',
    },
    servers: [{ url: '/api', description: 'API Server' }],
    security: [{ sessionAuth: [] }, { bearerAuth: [] }],
  });

  doc.paths = getRegisteredPaths();
  doc.components = {
    ...doc.components,
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
      ...(doc.components?.schemas || {}),
      ...generateOpenApiSchemas(),
    },
  };

  const paths = getRegisteredPaths();
  const count = Object.values(paths).reduce(
    (n, methods) => n + Object.keys(methods).length,
    0,
  );
  console.log(`[swagger] OpenAPI spec: ${count} documented endpoints`);

  app.get('/api-docs.json', (_req, res) => res.json(doc));

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(doc, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'FridayReport.AI API Documentation',
      swaggerOptions: { docExpansion: 'none' },
    }),
  );
}
