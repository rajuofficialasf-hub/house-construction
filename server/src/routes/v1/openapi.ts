import { Router } from 'express';
import type { OpenApiDocument } from '../../openapi.js';

// Serves the prebuilt API description; public, like the reads it describes.
export function openapiRouter(document: OpenApiDocument): Router {
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  return router;
}
