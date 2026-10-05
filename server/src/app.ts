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
import { authRouter } from './routes/v1/auth.js';
import { healthRouter } from './routes/v1/health.js';
import { housingReadRouter, type ReadRateLimit } from './routes/v1/housing.js';

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
}

/** Builds the Express app without listening, so tests run the real middleware chain. */
const READ_METHODS = new Set(['GET', 'HEAD']);

/** Paths other apps may read: the housing reads and the API description. */
const isPublicReadPath = (path: string) =>
  path === '/api/v1/housing' || path.startsWith('/api/v1/housing/') || path === '/api/v1/openapi.json';

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
  const site: CorsOptions = { origin: true, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE'] };
  const reader: CorsOptions = { origin: true, credentials: false, methods: ['GET', 'HEAD'] };
  return cors<Request>((req, callback) => {
    const origin = req.headers.origin;
    if (origin && credentialed.has(origin)) callback(null, site);
    else if (origin && publicRead.has(origin) && isPublicReadPath(req.path) && isReadRequest(req)) callback(null, reader);
    else callback(null, { origin: false });
  });
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
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', sessionMiddleware({ sql, now }, cookie.name));

  app.use('/api/v1', healthRouter(sql));
  app.use('/api/v1/auth', authRouter({ sql, now }, cookie));
  app.use('/api/v1/housing', housingReadRouter(sql, readRateLimit));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
