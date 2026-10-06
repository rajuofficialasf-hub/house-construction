import { randomUUID } from 'node:crypto';
import cors, { type CorsOptions } from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { sessionCookie } from './auth/cookie.js';
import { sessionMiddleware } from './auth/middleware.js';
import type { Sql } from './db.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { originCheck } from './http/origin.js';
import { buildOpenApiDocument } from './openapi.js';
import { activityRouter } from './routes/v1/activity.js';
import { authRouter } from './routes/v1/auth.js';
import { healthRouter } from './routes/v1/health.js';
import { BULK_PATH, housingAdminRouter, type WriteRateLimit } from './routes/v1/housing-admin.js';
import { housingReadRouter, type ReadRateLimit } from './routes/v1/housing.js';
import { openapiRouter } from './routes/v1/openapi.js';
import { photosRouter } from './routes/v1/photos.js';
import { projectsReadRouter } from './routes/v1/projects.js';
import { recordsAdminRouter } from './routes/v1/records-admin.js';
import { recordsReadRouter } from './routes/v1/records.js';
import { createPhotoReceiver, type PhotoReceiverOptions } from './photos/process.js';
import type { StorageDriver } from './storage/index.js';

export interface AppDeps {
  sql: Sql;
  logger: Logger;
  /** Number of proxies in front of the API, so req.ip is the real client (NE-SEC-10). */
  trustProxy: number;
  /** Browser origins that may call the API with the session cookie (NE-SEC-02). */
  allowedOrigins: readonly string[];
  /** Other apps' origins that may make uncredentialed GETs to the public reads; never the cookie or a write. */
  publicReadOrigins?: readonly string[];
  /** False only for plain-http local development (NE-SEC-05). */
  cookieSecure: boolean;
  /** The clock for session timeouts; tests pass their own. */
  now?: () => Date;
  /** Per-IP cap on the public housing reads; tests pass a small one. */
  readRateLimit?: ReadRateLimit;
  /** Where photo files live (STORAGE_DRIVER); built by storage/index.ts createStorage. */
  storage: StorageDriver;
  /** The API's public base URL (PUBLIC_API_URL), for the photo URLs stored on records. */
  publicApiUrl: string;
  /** Per-IP cap on the public photo route; tests pass a small one. */
  photoRateLimit?: ReadRateLimit;
  /** Per-admin cap on housing writes; tests pass a small one. */
  writeRateLimit?: WriteRateLimit;
  /** Upload limits; tests pass small ones. */
  photoUpload?: Omit<PhotoReceiverOptions, 'storage'>;
}

const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Public GET routes other apps may read, listed one by one so a route added later is not public
 * by accident: never the activity log, private values or anything admin-only. Express matches
 * case-insensitively and ignores a trailing slash, so the patterns do too.
 */
const PUBLIC_READ_ROUTES = [
  /^\/api\/v1\/projects\/?$/i,
  /^\/api\/v1\/projects\/[^/]+\/?$/i,
  /^\/api\/v1\/projects\/[^/]+\/fields\/?$/i,
  /^\/api\/v1\/projects\/[^/]+\/records\/?$/i,
  /^\/api\/v1\/projects\/[^/]+\/records\/serial\/[^/]+\/?$/i,
  /^\/api\/v1\/projects\/[^/]+\/records\/serials\/?$/i,
  /^\/api\/v1\/projects\/[^/]+\/years\/?$/i,
  /^\/api\/v1\/projects\/[^/]+\/next-serial\/?$/i,
  // Anchored, so /records/:id/private never matches.
  /^\/api\/v1\/records\/[^/]+\/?$/i,
];

/** Paths other apps may read: the housing reads (not the admin-only activity log), the project registry, photos and the API description. */
const isPublicReadPath = (path: string) =>
  path === '/api/v1/openapi.json' ||
  path.startsWith('/api/v1/photos/') ||
  PUBLIC_READ_ROUTES.some((route) => route.test(path)) ||
  ((path === '/api/v1/housing' || path.startsWith('/api/v1/housing/')) &&
    // Express matches routes case-insensitively, so compare the same way.
    !path.toLowerCase().startsWith('/api/v1/housing/activity'));

/** A GET or HEAD, or the preflight of one. The cors package never checks the requested method itself. */
const isReadRequest = (req: Request) =>
  READ_METHODS.has(req.method) ||
  (req.method === 'OPTIONS' && READ_METHODS.has(String(req.headers['access-control-request-method']).toUpperCase()));

/**
 * Two exact-match origin lists (NE-SEC-02). The site's origins get credentialed CORS for everything;
 * public-read origins get credential-less CORS on public reads only. `origin: true` echoes the
 * Origin header, which is safe here only because it has already matched a list exactly.
 */
function corsFor(allowedOrigins: readonly string[], publicReadOrigins: readonly string[]) {
  const credentialed = new Set(allowedOrigins);
  const publicRead = new Set(publicReadOrigins);
  const site: CorsOptions = { origin: true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] };
  const reader: CorsOptions = { origin: true, credentials: false, methods: ['GET', 'HEAD'] };
  return cors<Request>((req, callback) => {
    const origin = req.headers.origin;
    if (origin && credentialed.has(origin)) callback(null, site);
    else if (origin && publicRead.has(origin) && isPublicReadPath(req.path) && isReadRequest(req)) callback(null, reader);
    else callback(null, { origin: false });
  });
}

/** Builds the Express app without listening, so tests run the real middleware chain. */
// A project's bulk import path, anchored, with the project key's characters only.
const PROJECT_BULK_PATH = /^\/api\/v1\/projects\/[a-z][a-z0-9_]*\/records\/bulk\/?$/;

/** The bulk writes, which skip the 100kb parser; any other path or method keeps it. */
function isBulkWrite(req: Request): boolean {
  return req.path === BULK_PATH || ((req.method === 'POST' || req.method === 'PUT') && PROJECT_BULK_PATH.test(req.path));
}

export function createApp({
  sql,
  logger,
  trustProxy,
  allowedOrigins,
  publicReadOrigins = [],
  cookieSecure,
  now = () => new Date(),
  readRateLimit,
  storage,
  publicApiUrl,
  photoUpload,
  photoRateLimit,
  writeRateLimit,
}: AppDeps): Express {
  const cookie = sessionCookie(cookieSecure);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  // Every answer depends on Origin, including the ones that grant nothing, so a shared cache
  // can't hand one origin's answer to another. cors adds no Vary when it grants nothing.
  app.use((_req, res, next) => {
    res.vary('Origin');
    next();
  });
  // Preflights end here.
  app.use(corsFor(allowedOrigins, publicReadOrigins));
  // Before body parsing, so a refused request costs nothing more.
  app.use(originCheck(allowedOrigins));
  // 100kb for every body (NE-REQ-02) except the bulk imports, which parse their own larger body
  // after the admin check (routes/v1/housing-admin.ts, routes/v1/records-admin.ts).
  const json = express.json({ limit: '100kb' });
  app.use((req, res, next) => (isBulkWrite(req) ? next() : json(req, res, next)));
  app.use('/api/v1', sessionMiddleware({ sql, now }, cookie.name));

  app.use('/api/v1', healthRouter(sql));
  app.use('/api/v1', openapiRouter(buildOpenApiDocument()));
  app.use('/api/v1/auth', authRouter({ sql, now }, cookie));
  // The admin router first: its literal paths (/activity, /bulk) must win over the reads' /:id.
  const receivePhoto = createPhotoReceiver({ ...photoUpload, storage });
  app.use('/api/v1/housing', housingAdminRouter({ sql, storage, publicApiUrl, receivePhoto, writeRateLimit }));
  app.use('/api/v1/housing', housingReadRouter(sql, readRateLimit));
  // Full paths at the root, before the projects router, whose router-wide limiter would otherwise
  // also count /projects/:key/records.
  app.use('/api/v1', recordsAdminRouter({ sql, storage, publicApiUrl, receivePhoto, writeRateLimit }));
  app.use('/api/v1', activityRouter({ sql, readRateLimit, writeRateLimit }));
  app.use('/api/v1', recordsReadRouter(sql, readRateLimit));
  app.use('/api/v1/projects', projectsReadRouter(sql, readRateLimit));
  app.use('/api/v1/photos', photosRouter(sql, storage, photoRateLimit));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
