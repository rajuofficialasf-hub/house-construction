import type { Router } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { buildOpenApiDocument } from '../../src/openapi.js';
import { healthRouter } from '../../src/routes/v1/health.js';
import { housingReadRouter } from '../../src/routes/v1/housing.js';
import { openapiRouter } from '../../src/routes/v1/openapi.js';
import { appDb } from '../support/db.js';

// GET /api/v1/openapi.json, and a check that the document and the mounted routes never drift apart.

const sql = appDb();
afterAll(() => sql.end());
const app = createApp({ sql, logger: createLogger('silent'), trustProxy: 0, allowedOrigins: ['http://localhost:5173'], cookieSecure: false });
const document = buildOpenApiDocument();

/** `METHOD /path` for every route on a router, with Express `:param` written as OpenAPI `{param}`. */
function routesOf(prefix: string, router: Router): string[] {
  return router.stack.flatMap((layer) => {
    const route = layer.route as { path: string; methods: Record<string, boolean> } | undefined;
    if (!route) return [];
    const path = `${prefix}${route.path === '/' ? '' : route.path}`.replace(/:([a-z_]+)/g, '{$1}');
    return Object.keys(route.methods).map((method) => `${method.toUpperCase()} ${path}`);
  });
}

function documentedRoutes(): string[] {
  return Object.entries(document.paths).flatMap(([path, item]) => Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`));
}

/** Every `$ref` string anywhere in the document. */
function refsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refsIn);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => (key === '$ref' && typeof child === 'string' ? [child] : refsIn(child)));
  }
  return [];
}

describe('GET /api/v1/openapi.json', () => {
  it('serves the OpenAPI 3.1 document without a session', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(document)));
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.servers).toEqual([{ url: '/api/v1' }]);
  });

  it('documents exactly the public routes the app mounts', () => {
    const mounted = [
      ...routesOf('', healthRouter(sql)),
      ...routesOf('', openapiRouter(document)),
      ...routesOf('/housing', housingReadRouter(sql)),
    ];
    expect(documentedRoutes().sort()).toEqual(mounted.sort());
  });

  it('leaves the admin auth routes out', () => {
    expect(Object.keys(document.paths).filter((path) => path.startsWith('/auth'))).toEqual([]);
  });

  it('has no $schema keys and every $ref resolves inside the document', () => {
    const json = JSON.stringify(document);
    expect(json).not.toContain('"$schema"');
    for (const ref of refsIn(document)) {
      const name = ref.replace('#/components/schemas/', '');
      expect(ref).toMatch(/^#\/components\/schemas\//);
      expect(document.components.schemas).toHaveProperty(name);
    }
  });

  it('describes the list parameters with the patterns the server enforces', () => {
    const params = document.paths['/housing']?.get?.parameters ?? [];
    const pageSize = params.find((p) => p.name === 'page_size');
    expect(pageSize).toMatchObject({ in: 'query', required: false, schema: { type: 'string', pattern: '^[0-9]{1,10}$' } });
    expect(pageSize?.description).toMatch(/100/);
    const nos = document.paths['/housing/{project_type}/serials']?.get?.parameters?.find((p) => p.name === 'nos');
    expect(nos).toMatchObject({ in: 'query', required: true });
    expect(nos?.description).toMatch(/100/);
    const id = document.paths['/housing/{id}']?.get?.parameters?.find((p) => p.name === 'id');
    expect(id).toMatchObject({ in: 'path', required: true, schema: { format: 'uuid' } });
  });
});
