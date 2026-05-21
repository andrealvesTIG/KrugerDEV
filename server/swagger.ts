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

  // Dev-only coverage check: walk the Express router stack and warn loudly
  // about any /api route that isn't represented in the OpenAPI registry.
  // This catches new app.get/post/... calls that bypass apiRoute() and the
  // integration-docs backfill.
  if (process.env.NODE_ENV !== "production") {
    const undocumented: Array<{ method: string; path: string }> = [];
    const stack: any[] = ((app as any)._router?.stack ?? []);
    for (const layer of stack) {
      const route = layer?.route;
      if (!route || typeof route.path !== "string") continue;
      if (!route.path.startsWith("/api/") && route.path !== "/api") continue;
      const oa = route.path.replace(/^\/api/, "").replace(/:(\w+)/g, "{$1}");
      const methods = Object.keys(route.methods || {});
      for (const m of methods) {
        if (m === "_all") continue;
        if (!paths[oa] || !paths[oa][m]) {
          undocumented.push({ method: m, path: route.path });
        }
      }
    }
    if (undocumented.length > 0) {
      const header = `[swagger] ${undocumented.length} undocumented API route(s) detected (use apiRoute() or registerOpenApi()):`;
      const strict = process.env.OPENAPI_STRICT === "1" || process.env.OPENAPI_STRICT === "true";
      const log = strict ? console.error : console.warn;
      log(header);
      for (const u of undocumented.slice(0, 50)) {
        log(`  - ${u.method.toUpperCase()} ${u.path}`);
      }
      if (undocumented.length > 50) {
        log(`  ...and ${undocumented.length - 50} more`);
      }
      // Hard fail when OPENAPI_STRICT=1 (used by CI / pre-merge). Keeps local
      // dev unblocked but prevents new undocumented routes from shipping.
      if (strict) {
        throw new Error(
          `[swagger] OPENAPI_STRICT: refusing to start with ${undocumented.length} undocumented API route(s). ` +
          `Register each one via apiRoute() or server/routes/integrationRouteDocs.ts.`,
        );
      }
    }
  }

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
