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

const paths: Record<string, any> = {};
const usedIds = new Set<string>();

function toId(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('');
}

function uniqueId(base: string): string {
  let id = base;
  if (usedIds.has(id)) {
    let n = 2;
    while (usedIds.has(`${id}${n}`)) n++;
    id = `${id}${n}`;
  }
  usedIds.add(id);
  return id;
}

export function apiRoute(
  app: Express,
  method: HttpMethod,
  path: string,
  meta: OpenApiMeta,
  ...handlers: RequestHandler[]
): void {
  (app as any)[method](path, ...handlers);

  const oaPath = path.replace(/^\/api/, '').replace(/:(\w+)/g, '{$1}');
  if (!paths[oaPath]) paths[oaPath] = {};

  paths[oaPath][method] = {
    operationId: uniqueId(meta.operationId || toId(meta.summary)),
    tags: [meta.tag],
    summary: meta.summary,
    ...(meta.description && { description: meta.description }),
    ...(meta.parameters && { parameters: meta.parameters }),
    ...(meta.requestBody && { requestBody: meta.requestBody }),
    responses: meta.responses,
    ...(meta.security !== undefined && { security: meta.security }),
    ...(meta.deprecated && { deprecated: true }),
  };
}

export function getRegisteredPaths(): Record<string, any> {
  return paths;
}

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
