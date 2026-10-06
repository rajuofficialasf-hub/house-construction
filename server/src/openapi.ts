import { z } from 'zod';
import {
  activityBody,
  activityEntry,
  activityQuery,
  bulkInsertBody,
  bulkInsertResult,
  bulkUpdateBody,
  bulkUpdateResult,
  changeSerialBody,
  createBody,
  deletePhotoQuery,
  errorBody,
  filterOptions,
  housingRecord,
  DEFAULT_PAGE_SIZE,
  housingStats,
  idParams,
  INT4_MAX,
  listQuery,
  MAX_BULK_ROWS,
  MAX_PAGE_SIZE,
  MAX_SERIALS,
  nextSerial,
  nextSerialQuery,
  pageMeta,
  projectTypeQuery,
  serialParams,
  serialsParams,
  serialsQuery,
  updateBody,
  YEAR_MAX,
  YEAR_MIN,
} from './housing/schemas.js';

// The OpenAPI 3.1 description of the /api/v1 housing routes, served at /api/v1/openapi.json for
// other apps (docs/api/API_CONTRACT.md §1). Parameter and body schemas come from the same zod
// schemas the routes parse with; test/http/openapi.test.ts fails if a route and its entry drift
// apart. The housing writes are listed as admin-only; the login routes (/auth/*) are left out on
// purpose, because only this site uses them.

type JsonSchema = Record<string, unknown>;

interface Parameter {
  name: string;
  in: 'query' | 'path';
  required: boolean;
  description?: string;
  schema: JsonSchema;
}

interface Operation {
  summary: string;
  tags: string[];
  parameters?: Parameter[];
  requestBody?: { required: true; content: Record<string, { schema: JsonSchema }> };
  security?: Record<string, string[]>[];
  responses: Record<string, { description: string; content?: Record<string, { schema: JsonSchema }> }>;
}

type Method = 'get' | 'post' | 'put' | 'delete';

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, Partial<Record<Method, Operation>>>;
  components: { schemas: Record<string, JsonSchema>; securitySchemes: Record<string, JsonSchema> };
}

/** Request schemas describe what the client sends (strings with patterns); responses what it gets back. */
function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io }) as JsonSchema;
  return rest;
}

function parameters(schema: z.ZodObject, location: 'query' | 'path', docs: Record<string, string> = {}): Parameter[] {
  const json = jsonSchema(schema, 'input') as { properties?: Record<string, JsonSchema>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, propertySchema]) => ({
    name,
    in: location,
    required: location === 'path' || (json.required ?? []).includes(name),
    ...(docs[name] && { description: docs[name] }),
    schema: propertySchema,
  }));
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema: JsonSchema) => ({ 'application/json': { schema } });

function ok(description: string, data: JsonSchema, meta?: JsonSchema) {
  return {
    description,
    content: jsonContent({
      type: 'object',
      required: meta ? ['data', 'meta'] : ['data'],
      properties: { data, ...(meta && { meta }) },
    }),
  };
}

const ERROR_DESCRIPTIONS = {
  400: 'Invalid parameter or body (VALIDATION_ERROR); details.field names it, and details.row_index the row of a bulk body',
  401: 'No admin session (UNAUTHENTICATED)',
  403: 'The Origin header is missing or not allowed (FORBIDDEN)',
  404: 'No such record or photo (NOT_FOUND)',
  409: 'The serial is already in use in that project (CONFLICT)',
  413: 'The body, a photo or the number of rows is too large (PAYLOAD_TOO_LARGE)',
  429: 'Too many requests (RATE_LIMITED): per IP on reads, photos and login, per admin on writes',
  500: 'Server or database failure (INTERNAL_ERROR)',
  503: 'Database unavailable',
} as const;

function errors(...statuses: (keyof typeof ERROR_DESCRIPTIONS)[]) {
  return Object.fromEntries(statuses.map((status) => [status, { description: ERROR_DESCRIPTIONS[status], content: jsonContent(ref('Error')) }]));
}

const PROJECT_TYPE_DOC = 'semi_pucca or tin; both when left out';

const LIST_DOCS: Record<string, string> = {
  project_type: PROJECT_TYPE_DOC,
  serial_no: `Exact serial, 1-${INT4_MAX}`,
  year: `Exact year, ${YEAR_MIN}-${YEAR_MAX}`,
  division: 'Exact match after trimming and NFC; blank means no filter',
  district: 'Exact match after trimming and NFC; blank means no filter',
  upazila: 'Exact match after trimming and NFC; blank means no filter',
  q: 'Case-insensitive substring of name, father_or_husband_name or address; %, _ and \\ match literally',
  page: 'Page number from 1; default 1',
  page_size: `Rows per page, 1-${MAX_PAGE_SIZE}; default ${DEFAULT_PAGE_SIZE}`,
  sort: 'Sort field; default serial_no. Ties always break by serial_no, project_type, id',
  order: 'asc or desc; default asc',
};

/** Builds the document. Call once at startup; it never changes while the process runs. */
export function buildOpenApiDocument(): OpenApiDocument {
  const reads = (summary: string, operation: Omit<Operation, 'summary' | 'tags'>): { get: Operation } => ({
    get: { summary, tags: ['housing'], ...operation },
  });
  const projectFilter = parameters(projectTypeQuery, 'query', { project_type: PROJECT_TYPE_DOC });
  // Admin-only: the site's session cookie and an allowed Origin, so other apps can't call these.
  const admin = (summary: string, operation: Omit<Operation, 'summary' | 'tags' | 'security'>): Operation => ({
    summary,
    tags: ['housing-admin'],
    security: [{ adminSession: [] }],
    ...operation,
  });
  const body = (schema: z.ZodType) => ({ required: true as const, content: jsonContent(jsonSchema(schema, 'input')) });
  const idParam = parameters(idParams, 'path');

  return {
    openapi: '3.1.0',
    info: {
      title: 'Housing project API',
      version: '0.13',
      description:
        'Public, read-only access to the housing project records: no login is needed, and browser apps must be listed in PUBLIC_READ_ORIGINS and call without credentials. The housing-admin operations are for this site\'s admins only.',
    },
    servers: [{ url: '/api/v1' }],
    paths: {
      '/healthz': {
        get: { summary: 'The process is up', tags: ['health'], responses: { 200: ok('Up', { type: 'object' }) } },
      },
      '/readyz': {
        get: {
          summary: 'The database answers',
          tags: ['health'],
          responses: { 200: ok('Ready', { type: 'object' }), ...errors(503) },
        },
      },
      '/openapi.json': {
        get: { summary: 'This document', tags: ['meta'], responses: { 200: { description: 'OpenAPI 3.1 document', content: jsonContent({ type: 'object' }) } } },
      },
      '/housing': {
        ...reads('List records with filters, search, sort and paging', {
          parameters: parameters(listQuery, 'query', LIST_DOCS),
          responses: { 200: ok('One page and its totals', { type: 'array', items: ref('HousingRecord') }, ref('PageMeta')), ...errors(400, 429, 500) },
        }),
        post: admin('Create a record; without serial_no the next serial is assigned', {
          requestBody: body(createBody),
          responses: { 201: ok('The new record', ref('HousingRecord')), ...errors(400, 401, 403, 409, 429, 500) },
        }),
      },
      '/housing/stats': reads('Counts by year and place', {
        parameters: projectFilter,
        responses: { 200: ok('Counts', ref('HousingStats')), ...errors(400, 429, 500) },
      }),
      '/housing/years': reads('Years that have records, newest first', {
        parameters: projectFilter,
        responses: { 200: ok('Years', { type: 'array', items: { type: 'integer' } }), ...errors(400, 429, 500) },
      }),
      '/housing/filter-options': reads('Years, divisions, districts and upazilas present, for filter lists', {
        parameters: projectFilter,
        responses: { 200: ok('Options in Bengali alphabetical order; years newest first', ref('FilterOptions')), ...errors(400, 429, 500) },
      }),
      '/housing/next-serial': reads('The serial the next new record of a project will probably get', {
        parameters: parameters(nextSerialQuery, 'query', { project_type: 'semi_pucca or tin' }),
        responses: { 200: ok('Prediction only; the real serial is assigned on create', ref('NextSerial')), ...errors(400, 429, 500) },
      }),
      '/housing/{project_type}/serial/{serial_no}': reads('One record by project and serial', {
        parameters: parameters(serialParams, 'path'),
        responses: { 200: ok('The record', ref('HousingRecord')), ...errors(400, 404, 429, 500) },
      }),
      '/housing/{project_type}/serials': reads('Several records of one project by serial', {
        parameters: [
          ...parameters(serialsParams, 'path'),
          ...parameters(serialsQuery, 'query', { nos: `1-${MAX_SERIALS} comma-separated serials, e.g. 1,2,3; duplicates are ignored` }),
        ],
        responses: { 200: ok('The records found, in serial order; missing serials are left out', { type: 'array', items: ref('HousingRecord') }), ...errors(400, 429, 500) },
      }),
      '/housing/{id}': {
        ...reads('One record by id', {
          parameters: idParam,
          responses: { 200: ok('The record', ref('HousingRecord')), ...errors(400, 404, 429, 500) },
        }),
        put: admin('Change some fields of a record; serial_no and project_type cannot change here', {
          parameters: idParam,
          requestBody: body(updateBody),
          responses: { 200: ok('The updated record', ref('HousingRecord')), ...errors(400, 401, 403, 404, 429, 500) },
        }),
        delete: admin('Delete a record; its serial is never reused', {
          parameters: idParam,
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404, 429, 500) },
        }),
      },
      '/housing/activity': {
        get: admin('The activity log, newest first', {
          parameters: parameters(activityQuery, 'query', {
            action: 'Exact action, e.g. update or import_run',
            project_type: 'semi_pucca or tin',
            record_id: 'Entries about one record',
            actor_email: 'Case-insensitive part of the acting admin\'s email; %, _ and \\ match literally',
            from: 'Entries at or after this time (ISO 8601 with an offset)',
            to: 'Entries at or before this time (ISO 8601 with an offset)',
            page: 'Page number from 1; default 1',
            page_size: `Rows per page, 1-${MAX_PAGE_SIZE}; default ${DEFAULT_PAGE_SIZE}`,
          }),
          responses: { 200: ok('One page of entries and its totals', { type: 'array', items: ref('ActivityEntry') }, ref('PageMeta')), ...errors(400, 401, 500) },
        }),
        post: admin('Record a client event such as import_run; actions the server logs itself are refused', {
          requestBody: body(activityBody),
          responses: {
            201: ok('The new entry\'s id', { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } }),
            ...errors(400, 401, 403, 500),
          },
        }),
      },
      '/housing/bulk': {
        post: admin(`Import 1-${MAX_BULK_ROWS} rows in one transaction: all or nothing`, {
          requestBody: body(bulkInsertBody),
          responses: { 200: ok('How many rows were inserted', ref('BulkInsertResult')), ...errors(400, 401, 403, 409, 413, 429, 500) },
        }),
        put: admin(`Update 1-${MAX_BULK_ROWS} rows by serial; absent, null or blank fields stay as they are`, {
          requestBody: body(bulkUpdateBody),
          responses: { 200: ok('How many rows changed, and the serials not found', ref('BulkUpdateResult')), ...errors(400, 401, 403, 413, 429, 500) },
        }),
      },
      '/housing/{id}/photo': {
        post: admin('Upload or replace the record\'s before (prev) or after (current) photo; the server re-encodes it as WebP and makes the thumbnail', {
          parameters: idParam,
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['kind', 'photo'],
                  properties: {
                    kind: { type: 'string', enum: ['prev', 'current'] },
                    photo: { type: 'string', format: 'binary', description: 'A JPEG, PNG or WebP image, at most 5 MB' },
                    thumb: { type: 'string', format: 'binary', description: 'Optional, at most 500 KB; ignored, the server makes its own' },
                  },
                },
              },
            },
          },
          responses: { 200: ok('The record with its new photo URLs and photo_updated_at', ref('HousingRecord')), ...errors(400, 401, 403, 404, 413, 429, 500) },
        }),
        delete: admin('Remove the record\'s photo and thumbnail of one kind; succeeds when there is none', {
          parameters: [...idParam, ...parameters(deletePhotoQuery, 'query', { kind: 'prev or current' })],
          responses: { 200: ok('The record', ref('HousingRecord')), ...errors(400, 401, 403, 404, 429, 500) },
        }),
      },
      '/photos/{id}': {
        get: {
          summary: 'A photo or thumbnail, by the id in a record\'s *_photo_url or *_thumb_url; cacheable for a year',
          tags: ['photos'],
          parameters: idParam,
          responses: {
            200: { description: 'The image', content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } } },
            ...errors(400, 404, 429, 500),
          },
        },
      },
      '/housing/{id}/serial': {
        post: admin('Move a record to another serial; the old serial is never reused', {
          parameters: idParam,
          requestBody: body(changeSerialBody),
          responses: { 200: ok('The record with its new serial', ref('HousingRecord')), ...errors(400, 401, 403, 404, 409, 429, 500) },
        }),
      },
    },
    components: {
      schemas: {
        HousingRecord: jsonSchema(housingRecord, 'output'),
        PageMeta: jsonSchema(pageMeta, 'output'),
        HousingStats: jsonSchema(housingStats, 'output'),
        FilterOptions: jsonSchema(filterOptions, 'output'),
        NextSerial: jsonSchema(nextSerial, 'output'),
        ActivityEntry: jsonSchema(activityEntry, 'output'),
        BulkInsertResult: jsonSchema(bulkInsertResult, 'output'),
        BulkUpdateResult: jsonSchema(bulkUpdateResult, 'output'),
        Error: jsonSchema(errorBody, 'output'),
      },
      securitySchemes: {
        adminSession: {
          type: 'apiKey',
          in: 'cookie',
          name: '__Host-housing_session',
          description: 'The admin session cookie set by the site login. Plain-http local development (COOKIE_SECURE=false) names it housing_session.',
        },
      },
    },
  };
}
