import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
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

export interface AppDeps {
  sql: Sql;
  logger: Logger;
  /** Number of proxies in front of the API, so req.ip is the real client (NE-SEC-10). */
  trustProxy: number;
  /** Browser origins that may call the API with the session cookie (NE-SEC-02). */
  allowedOrigins: readonly string[];
  /** False only for plain-http local development (NE-SEC-05). */
  cookieSecure: boolean;
  /** The clock for session timeouts; tests pass their own. */
  now?: () => Date;
}

/** Builds the Express app without listening, so tests run the real middleware chain. */
export function createApp({ sql, logger, trustProxy, allowedOrigins, cookieSecure, now = () => new Date() }: AppDeps): Express {
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
  // Exact-match allowlist; the request's Origin is never reflected. Preflights end here.
  app.use(cors({ origin: [...allowedOrigins], credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
  // Before body parsing, so a refused request costs nothing more.
  app.use(originCheck(allowedOrigins));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', sessionMiddleware({ sql, now }, cookie.name));

  app.use('/api/v1', healthRouter(sql));
  app.use('/api/v1/auth', authRouter({ sql, now }, cookie));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
