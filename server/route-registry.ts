import { Express, RequestHandler } from 'express';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface OpenApiMeta {
  tag: string;
  summary: string;
  description?: string;
  parameters?: any[];
  requestBody?: any;
  responses: Record<string, any>;
  security?: any[];
  operationId?: string;
  deprecated?: boolean;
}

interface RegisteredRoute {
  method: HttpMethod;
  expressPath: string;
  meta: OpenApiMeta;
}

const registry: RegisteredRoute[] = [];

const metadataMap = new Map<string, any>();

export const p = (name: string, location: 'path' | 'query', schema: any, required = true, description?: string) => ({
  name, in: location, required, schema, ...(description ? { description } : {}),
});

export const pathId = (name = 'id') => p(name, 'path', { type: 'integer' }, true);
export const pathStr = (name: string) => p(name, 'path', { type: 'string' }, true);
export const qInt = (name: string, required = false, description?: string) => p(name, 'query', { type: 'integer' }, required, description);
export const qStr = (name: string, required = false, description?: string) => p(name, 'query', { type: 'string' }, required, description);
export const qBool = (name: string, required = false, description?: string) => p(name, 'query', { type: 'boolean' }, required, description);

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
export const arrOf = (name: string) => ({ type: 'array' as const, items: ref(name) });
export const json = (schema: any) => ({ 'application/json': { schema } });
export const body = (schema: any, required = true) => ({ required, content: json(schema) });

export const r200 = (desc: string, schema?: any) => ({
  '200': { description: desc, ...(schema ? { content: json(schema) } : {}) },
});
export const r201 = (desc: string, schema?: any) => ({
  '201': { description: desc, ...(schema ? { content: json(schema) } : {}) },
});
export const r204 = (desc: string) => ({ '204': { description: desc } });

const err = (code: string, msg: string) => ({
  [code]: { description: msg, content: json(ref('Error')) },
});
export const e400 = err('400', 'Bad request');
export const e401 = err('401', 'Authentication required');
export const e403 = err('403', 'Access denied');
export const e404 = err('404', 'Not found');

export const authRes = { ...e401 };
export const stdRes = { ...e401, ...e403 };
export const idRes = { ...e401, ...e404 };
export const fullRes = { ...e401, ...e403, ...e404 };
export const inputRes = { ...e400, ...e401 };
export const createRes = { ...e400, ...e401, ...e403 };
export const updateRes = { ...e400, ...e401, ...e403, ...e404 };

const toOperationId = (summary: string): string => {
  return summary
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
};

export function apiRoute(
  app: Express,
  method: HttpMethod,
  path: string,
  meta: OpenApiMeta,
  ...handlers: RequestHandler[]
): void {
  (app as any)[method](path, ...handlers);
  registry.push({ method, expressPath: path, meta });
}

export function registerMetadata(paths: Record<string, Record<string, any>>): void {
  for (const [openApiPath, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        const key = `${method.toUpperCase()} ${openApiPath}`;
        metadataMap.set(key, operation);
      }
    }
  }
}

function toOpenApiPath(expressPath: string): string {
  return expressPath
    .replace(/^\/api/, '')
    .replace(/:(\w+)/g, '{$1}');
}

function extractExpressRoutes(app: Express): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  const seen = new Set<string>();

  function walkStack(stack: any[], prefix = '') {
    if (!stack) return;
    for (const layer of stack) {
      if (layer.route) {
        const routePath = prefix + layer.route.path;
        if (typeof routePath !== 'string') continue;
        if (!routePath.startsWith('/api/')) continue;
        for (const method of Object.keys(layer.route.methods)) {
          if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
          const key = `${method} ${routePath}`;
          if (!seen.has(key)) {
            seen.add(key);
            routes.push({ method, path: routePath });
          }
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        const routerPrefix = layer.keys?.length ? '' : (layer.regexp?.source === '^\\/?$' ? '' : extractPrefix(layer));
        walkStack(layer.handle.stack, prefix + routerPrefix);
      } else if (layer.handle && layer.handle.stack) {
        walkStack(layer.handle.stack, prefix);
      }
    }
  }

  function extractPrefix(layer: any): string {
    if (layer.path) return layer.path;
    return '';
  }

  const router = (app as any)._router;
  if (router && router.stack) {
    walkStack(router.stack);
  }

  return routes;
}

const _usedOperationIds = new Set<string>();

function makeUniqueOperationId(base: string): string {
  let id = base;
  if (_usedOperationIds.has(id)) {
    let n = 2;
    while (_usedOperationIds.has(`${id}${n}`)) n++;
    id = `${id}${n}`;
  }
  _usedOperationIds.add(id);
  return id;
}

export function buildPathsFromExpress(app: Express): {
  paths: Record<string, any>;
  stats: { documented: number; undocumented: number; total: number; phantomMetadata: string[] };
} {
  const paths: Record<string, any> = {};
  let documented = 0;
  let undocumented = 0;
  const metadataKeysUsed = new Set<string>();

  for (const route of registry) {
    const openApiPath = toOpenApiPath(route.expressPath);
    if (!paths[openApiPath]) paths[openApiPath] = {};

    const id = makeUniqueOperationId(route.meta.operationId || toOperationId(route.meta.summary));
    const operation: any = {
      operationId: id,
      tags: [route.meta.tag],
      summary: route.meta.summary,
    };
    if (route.meta.description) operation.description = route.meta.description;
    if (route.meta.parameters) operation.parameters = route.meta.parameters;
    if (route.meta.requestBody) operation.requestBody = route.meta.requestBody;
    if (route.meta.responses) operation.responses = route.meta.responses;
    if (route.meta.security !== undefined) operation.security = route.meta.security;
    if (route.meta.deprecated) operation.deprecated = true;

    paths[openApiPath][route.method] = operation;
    documented++;
    metadataKeysUsed.add(`${route.method.toUpperCase()} ${openApiPath}`);
  }

  const expressRoutes = extractExpressRoutes(app);

  for (const route of expressRoutes) {
    const openApiPath = toOpenApiPath(route.path);
    const key = `${route.method.toUpperCase()} ${openApiPath}`;

    if (metadataKeysUsed.has(key)) continue;

    const metadata = metadataMap.get(key);
    if (metadata) {
      if (!paths[openApiPath]) paths[openApiPath] = {};
      const existingId = metadata.operationId;
      if (existingId && !_usedOperationIds.has(existingId)) {
        _usedOperationIds.add(existingId);
      } else if (existingId) {
        metadata.operationId = makeUniqueOperationId(existingId);
      }
      paths[openApiPath][route.method] = metadata;
      documented++;
      metadataKeysUsed.add(key);
    } else {
      if (!paths[openApiPath]) paths[openApiPath] = {};
      const summary = `${route.method.toUpperCase()} ${openApiPath}`;
      paths[openApiPath][route.method] = {
        operationId: makeUniqueOperationId(toOperationId(summary)),
        tags: ['Other'],
        summary,
        responses: {
          '200': { description: 'Success' },
          ...authRes,
        },
      };
      undocumented++;
      metadataKeysUsed.add(key);
    }
  }

  const phantomMetadata: string[] = [];
  for (const key of metadataMap.keys()) {
    if (!metadataKeysUsed.has(key)) {
      phantomMetadata.push(key);
    }
  }

  return {
    paths,
    stats: {
      documented,
      undocumented,
      total: documented + undocumented,
      phantomMetadata,
    },
  };
}

export function getRegistryStats(): { total: number; byTag: Record<string, number> } {
  const byTag: Record<string, number> = {};
  for (const route of registry) {
    byTag[route.meta.tag] = (byTag[route.meta.tag] || 0) + 1;
  }
  return { total: registry.length, byTag };
}
