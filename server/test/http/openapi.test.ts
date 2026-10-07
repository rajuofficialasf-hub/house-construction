import { readFileSync } from 'node:fs';
import type { RequestHandler, Router } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { requireMainAdmin, requireMainAdminForCovers, requireMainAdminForPhotos } from '../../src/auth/middleware.js';
import { createLogger } from '../../src/logger.js';
import { buildOpenApiDocument } from '../../src/openapi.js';
import { healthRouter } from '../../src/routes/v1/health.js';
import { openapiRouter } from '../../src/routes/v1/openapi.js';
import { photosRouter } from '../../src/routes/v1/photos.js';
import { projectsAdminRouter } from '../../src/routes/v1/projects-admin.js';
import { projectsReadRouter } from '../../src/routes/v1/projects.js';
import { activityRouter } from '../../src/routes/v1/activity.js';
import { recordsAdminRouter } from '../../src/routes/v1/records-admin.js';
import { recordsReadRouter } from '../../src/routes/v1/records.js';
import { appDb } from '../support/db.js';
import { testPhotoDeps } from '../support/storage.js';

// GET /api/v1/openapi.json, and a check that the document and the mounted routes never drift apart.

const sql = appDb();
afterAll(() => sql.end());
const app = createApp({ ...testPhotoDeps(), sql, logger: createLogger('silent'), trustProxy: 0, allowedOrigins: ['http://localhost:5173'], cookieSecure: false });
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

const MAIN_ADMIN_GUARDS = new Set<RequestHandler>([requireMainAdmin, requireMainAdminForPhotos, requireMainAdminForCovers]);

/** `METHOD /path` of each route whose handler chain includes a main-admin guard. */
function mainAdminRoutesOf(prefix: string, router: Router): string[] {
  return router.stack.flatMap((layer) => {
    const route = layer.route as { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } | undefined;
    if (!route?.stack.some((l) => MAIN_ADMIN_GUARDS.has(l.handle))) return [];
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

  it('documents exactly the routes the app mounts, apart from /auth', () => {
    const mounted = [
      ...routesOf('', healthRouter(sql)),
      ...routesOf('', openapiRouter(document)),
      ...routesOf('/projects', projectsReadRouter(sql)),
      ...routesOf('', recordsReadRouter(sql)),
      ...routesOf('', recordsAdminRouter({ sql, ...testPhotoDeps(), receivePhoto: () => Promise.reject(new Error('unused')) })),
      ...routesOf('/photos', photosRouter(sql, testPhotoDeps().storage)),
      ...routesOf('', activityRouter({ sql })),
      ...routesOf('', projectsAdminRouter({ sql, ...testPhotoDeps(), receivePhoto: () => Promise.reject(new Error('unused')) })),
    ];
    expect(documentedRoutes().sort()).toEqual(mounted.sort());
  });

  it('describes the custom values of the record bodies, which zod can\'t', () => {
    type Body = { requestBody: { content: { 'application/json': { schema: { properties: { extra: unknown } } } } } };
    const extraOf = (operation: unknown) => (operation as Body).requestBody.content['application/json'].schema.properties.extra;
    const expected = { type: 'object', propertyNames: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,39}$' }, additionalProperties: { type: ['string', 'number', 'null'] } };
    expect(extraOf(document.paths['/projects/{key}/records']?.post)).toMatchObject(expected);
    expect(extraOf(document.paths['/records/{id}']?.patch)).toMatchObject(expected);
  });

  it('marks every housing write admin-only with the session cookie scheme', () => {
    const operations = Object.values(document.paths).flatMap((item) => Object.entries(item));
    for (const [method, operation] of operations) {
      if (method === 'get') continue;
      expect(operation.security, operation.summary).toEqual([{ adminSession: [] }]);
      expect(operation.responses).toHaveProperty('401');
    }
    expect(document.components.securitySchemes.adminSession).toMatchObject({ type: 'apiKey', in: 'cookie' });
  });

  it('gives every operation a success response that describes its body, or a 204', () => {
    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        const success = Object.entries(operation.responses).filter(([status]) => status.startsWith('2'));
        expect(success.length, `${method} ${path}`).toBeGreaterThan(0);
        for (const [status, response] of success) {
          if (status === '204') continue;
          expect((response as { content?: unknown }).content, `${method} ${path} ${status}`).toBeDefined();
        }
      }
    }
  });

  it('says which operations only the main admin may use, and lists their 403', () => {
    const deps = { sql, ...testPhotoDeps(), receivePhoto: () => Promise.reject(new Error('unused')) };
    const guarded = [
      ...mainAdminRoutesOf('', recordsAdminRouter(deps)),
      ...mainAdminRoutesOf('', projectsAdminRouter(deps)),
    ];
    expect(guarded.sort()).toEqual([
      'DELETE /fields/{id}',
      'DELETE /projects/{key}',
      'DELETE /projects/{key}/cover',
      'DELETE /records/{id}',
      'DELETE /records/{id}/photos/{slot}',
    ]);
    for (const route of guarded) {
      const [method, path] = route.split(' ') as [string, string];
      const operation = document.paths[path]?.[method.toLowerCase() as 'delete'];
      expect(operation?.summary, route).toMatch(/main admin only/i);
      expect(operation?.responses, route).toHaveProperty('403');
    }
  });

  it('documents If-Match on a project update, with its 409', () => {
    const patch = document.paths['/projects/{key}']?.patch;
    expect(patch?.parameters?.find((p) => p.name === 'If-Match')).toMatchObject({ in: 'header', required: false });
    expect(patch?.responses).toHaveProperty('409');
    expect(document.paths['/projects']?.post?.responses).toHaveProperty('409');
    expect(document.paths['/projects/{key}/fields']?.post?.responses).toHaveProperty('409');
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
    const params = document.paths['/projects/{key}/records']?.get?.parameters ?? [];
    const pageSize = params.find((p) => p.name === 'page_size');
    expect(pageSize).toMatchObject({ in: 'query', required: false, schema: { type: 'string', pattern: '^[0-9]{1,10}$' } });
    expect(pageSize?.description).toMatch(/100/);
    const nos = document.paths['/projects/{key}/records/serials']?.get?.parameters?.find((p) => p.name === 'nos');
    expect(nos).toMatchObject({ in: 'query', required: true });
    expect(nos?.description).toMatch(/100/);
    const id = document.paths['/records/{id}']?.get?.parameters?.find((p) => p.name === 'id');
    expect(id).toMatchObject({ in: 'path', required: true, schema: { format: 'uuid' } });
  });
});

describe('the old single-project routes', () => {
  it('are gone: no /housing path is documented', () => {
    expect(Object.keys(document.paths).filter((path) => path.startsWith('/housing'))).toEqual([]);
  });

  it('answer 404', async () => {
    expect((await request(app).get('/api/v1/housing')).status).toBe(404);
    expect((await request(app).post('/api/v1/housing/bulk').set('Origin', 'http://localhost:5173').send({ rows: [] })).status).toBe(404);
  });
});

describe('the API contract', () => {
  // The contract names each route the way this document does (`/projects/{key}/stats`), so a route
  // added without its contract section fails here (docs/architecture/migration-notes.md, "Working rules").
  const contract = readFileSync(new URL('../../../docs/api/PROJECTS_API_CONTRACT.md', import.meta.url), 'utf8');

  it('names every documented path', () => {
    expect(Object.keys(document.paths).filter((path) => !contract.includes(path))).toEqual([]);
  });
});

