import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import { idParams } from '../../housing/schemas.js';
import { findLiveFile } from '../../photos/serve.js';
import { StorageNotFoundError, type StorageDriver } from '../../storage/index.js';
import { readRateLimiter, type ReadRateLimit } from './housing.js';

// GET /api/v1/photos/:id: every photo the site shows comes through here, whichever driver holds
// it, so the browser never sees a bucket URL or storage key (NS-10, NS-41; contract §5).

// A list page shows up to 50 thumbnails and the responses are cached for a year, so this sits well
// above the 300 a minute of the housing reads. In memory, exact while the API runs as one process.
export const DEFAULT_PHOTO_RATE_LIMIT: ReadRateLimit = { windowMs: 60_000, limit: 1200 };

const notFound = () => new AppError('NOT_FOUND', 'ছবি পাওয়া যায়নি');

export function photosRouter(sql: Sql, storage: StorageDriver, photoRateLimit: ReadRateLimit = DEFAULT_PHOTO_RATE_LIMIT): Router {
  const router = Router();

  router.use(readRateLimiter(photoRateLimit, 'photo reads rate-limited'));

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const file = await findLiveFile(sql, id);
    if (!file) throw notFound();
    let body;
    try {
      body = await storage.get(file.storage_key);
    } catch (err) {
      if (!(err instanceof StorageNotFoundError)) throw err;
      req.log.warn({ fileId: id }, 'photo file row has no stored object');
      throw notFound();
    }
    res.set({
      'Content-Type': file.content_type,
      'Content-Length': file.size_bytes,
      'Content-Disposition': 'inline',
      // A file id never changes content (a new photo gets a new id and URL), but a deleted photo
      // must leave browser and CDN caches within a day, so no year-long immutable caching.
      'Cache-Control': 'public, max-age=86400',
      // helmet's same-origin default would stop the site (another port or host) and other apps
      // from showing the image.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    if (req.method === 'HEAD') {
      body.destroy();
      res.end();
      return;
    }
    // A failure mid-stream destroys the response, so the client sees a cut-off body, not a hang.
    await pipeline(body, res).catch((err: unknown) => req.log.warn({ err, fileId: id }, 'photo stream failed'));
  });

  return router;
}
