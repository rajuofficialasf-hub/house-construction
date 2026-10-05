import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Sql } from './db.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { healthRouter } from './routes/v1/health.js';

export interface AppDeps {
  sql: Sql;
  logger: Logger;
  /** Number of proxies in front of the API, so req.ip is the real client (NE-SEC-10). */
  trustProxy: number;
}

/** Builds the Express app without listening, so tests run the real middleware chain. */
export function createApp({ sql, logger, trustProxy }: AppDeps): Express {
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
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1', healthRouter(sql));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
