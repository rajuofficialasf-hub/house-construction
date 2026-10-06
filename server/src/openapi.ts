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
  CLIENT_EVENT_ACTIONS,
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
  MAX_ACTIVITY_PAGE,
  MAX_BULK_ROWS,
  MAX_PAGE_SIZE,
  MAX_SERIALS,
  nextSerial,
  nextSerialQuery,
  pageMeta,
  projectActivityBody,
  projectActivityQuery,
  projectTypeQuery,
  serialParams,
  serialsParams,
  serialsQuery,
  updateBody,
  YEAR_MAX,
  YEAR_MIN,
} from './housing/schemas.js';
import {
  project,
  fieldCreateBody,
  fieldIdParams,
  fieldKeyParams,
  fieldOrderBody,
  fieldPatchBody,
  projectCreateBody,
  projectField,
  projectKeyParams,
  projectListQuery,
  overviewQuery,
  projectOrderBody,
  projectOverview,
  projectPatchBody,
  projectStats,
  renameValueBody,
  statsQuery,
} from './projects/schemas.js';
import {
  bulkCreateBody,
  bulkUpdateBody as recordsBulkUpdateBody,
  customValueKeys,
  FIELD_KEY,
  photoParams,
  privateBody,
  privateManyBody,
  privateValues,
  projectRecord,
  projectRecordsParams,
  projectSerialParams,
  recordCreateBody,
  recordListQuery,
  recordPatchBody,
  serialBody,
} from './records/schemas.js';

// The OpenAPI 3.1 description of the /api/v1 housing routes, served at /api/v1/openapi.json for
// other apps (docs/api/API_CONTRACT.md §1). Parameter and body schemas come from the same zod
// schemas the routes parse with; test/http/openapi.test.ts fails if a route and its entry drift
// apart. The housing writes are listed as admin-only; the login routes (/auth/*) are left out on
// purpose, because only this site uses them.

type JsonSchema = Record<string, unknown>;

interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header';
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

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, Partial<Record<Method, Operation>>>;
  components: { schemas: Record<string, JsonSchema>; securitySchemes: Record<string, JsonSchema> };
}

// What customValueKeys accepts: an object of field keys to a text, a number or null.
const CUSTOM_VALUES_SCHEMA = {
  type: 'object',
  propertyNames: { type: 'string', pattern: FIELD_KEY.source },
  additionalProperties: { type: ['string', 'number', 'null'] },
};

/** Request schemas describe what the client sends (strings with patterns); responses what it gets back. */
function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, {
    io,
    // customValueKeys is a custom check, which JSON Schema can't express on its own, so it is
    // described by hand; the openapi test checks the record bodies carry that description.
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema: out }) => {
      if ((zodSchema as unknown) === customValueKeys) Object.assign(out, CUSTOM_VALUES_SCHEMA);
    },
  }) as JsonSchema;
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
  403: 'The Origin header is missing or not allowed, or a delete comes from an admin who is not the main admin (FORBIDDEN)',
  404: 'No such record, photo or project, or a draft project asked for without an admin session (NOT_FOUND)',
  409: 'The serial, project key, slug, file prefix or field key is already in use, or If-Match no longer matches (CONFLICT); details.field names the field',
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
const RECORD_LIST_DOCS: Record<string, string> = {
  union_name: 'Exact match after trim and NFC',
  q: 'Partial, case-insensitive match over name, father_or_husband_name, address and the searchable public fields',
  sort: 'serial_no, year, name, created_at, union_name, or extra.<key> for a public field (otherwise serial_no); ties by serial_no',
};

export function buildOpenApiDocument(): OpenApiDocument {
  const reads = (summary: string, operation: Omit<Operation, 'summary' | 'tags'>): { get: Operation } => ({
    get: { summary, tags: ['housing'], ...operation },
  });
  const projectFilter = parameters(projectTypeQuery, 'query', { project_type: PROJECT_TYPE_DOC });
  // Admin-only: the site's session cookie and an allowed Origin, so other apps can't call these.
  const admin = (summary: string, operation: Omit<Operation, 'summary' | 'tags' | 'security'>, tag = 'housing-admin'): Operation => ({
    summary,
    tags: [tag],
    security: [{ adminSession: [] }],
    ...operation,
  });
  const body = (schema: z.ZodType) => ({ required: true as const, content: jsonContent(jsonSchema(schema, 'input')) });
  const idParam = parameters(idParams, 'path');

  return {
    openapi: '3.1.0',
    info: {
      title: 'Housing project API',
      version: '0.15',
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
        delete: admin('Delete a record; its serial is never reused. Main admin only', {
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
        delete: admin('Remove the record\'s photo and thumbnail of one kind; succeeds when there is none. Main admin only', {
          parameters: [...idParam, ...parameters(deletePhotoQuery, 'query', { kind: 'prev or current' })],
          responses: { 200: ok('The record', ref('HousingRecord')), ...errors(400, 401, 403, 404, 429, 500) },
        }),
      },
      '/projects': {
        get: {
          summary: 'List the projects by sort_order then key; drafts and private fields only for an admin session',
          tags: ['projects'],
          parameters: parameters(projectListQuery, 'query', {
            include: 'fields: embed each project\'s fields in sort_order, archived ones included',
            drafts: '1: include draft projects; ignored without an admin session',
          }),
          responses: { 200: ok('The projects', { type: 'array', items: ref('Project') }), ...errors(400, 429, 500) },
        },
        post: admin('Create a project and its fields in one transaction, always as a draft (is_published is ignored); a leaf gets its serial counter', {
          requestBody: body(projectCreateBody),
          responses: { 201: ok('The new project with its fields', ref('Project')), ...errors(400, 401, 403, 409, 429, 500) },
        }, 'projects-admin'),
      },
      '/projects/overview': {
        get: {
          summary: 'Every project the caller may see, in display order, with light stats, its newest record with a photo and totals over the published projects. Drafts and photo-less counts only for an admin session with drafts=1',
          tags: ['projects'],
          parameters: parameters(overviewQuery, 'query', { drafts: '1: include drafts and without_photo counts; ignored without an admin session' }),
          responses: { 200: ok('The overview', ref('ProjectOverview')), ...errors(400, 429, 500) },
        },
      },
      '/projects/order': {
        put: admin('Set sort_order 10, 20, ... in the given order; unknown keys are ignored and nothing is logged', {
          requestBody: body(projectOrderBody),
          responses: { 204: { description: 'Reordered' }, ...errors(400, 401, 403, 429, 500) },
        }, 'projects-admin'),
      },
      '/projects/{key}': {
        get: {
          summary: 'One project with its fields; a draft only for an admin session',
          tags: ['projects'],
          parameters: parameters(projectKeyParams, 'path'),
          responses: { 200: ok('The project', ref('Project')), ...errors(400, 404, 429, 500) },
        },
        patch: admin('Change some of a project\'s settings; publish or unpublish with is_published. A published project keeps its slug and parent', {
          parameters: [
            ...parameters(projectKeyParams, 'path'),
            {
              name: 'If-Match',
              in: 'header',
              required: false,
              description: 'The project\'s updated_at as last read, compared to the millisecond; 409 when someone changed it since',
              schema: { type: 'string' },
            },
          ],
          requestBody: body(projectPatchBody),
          responses: { 200: ok('The project with its fields', ref('Project')), ...errors(400, 401, 403, 404, 409, 429, 500) },
        }, 'projects-admin'),
        delete: admin('Delete a project that never held a record, with its fields; a group must have no children. Main admin only', {
          parameters: parameters(projectKeyParams, 'path'),
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404, 429, 500) },
        }, 'projects-admin'),
      },
      '/projects/{key}/fields': {
        get: {
          summary: 'A project\'s fields in sort_order; private fields only for an admin session',
          tags: ['projects'],
          parameters: parameters(projectKeyParams, 'path'),
          responses: { 200: ok('The fields', { type: 'array', items: ref('ProjectField') }), ...errors(400, 404, 429, 500) },
        },
        post: admin('Add a field to a project, after its last field unless sort_order is given; groups hold no fields, and a project at most 40', {
          parameters: parameters(projectKeyParams, 'path'),
          requestBody: body(fieldCreateBody),
          responses: { 201: ok('The new field', ref('ProjectField')), ...errors(400, 401, 403, 404, 409, 429, 500) },
        }, 'projects-admin'),
      },
      '/projects/{key}/fields/order': {
        put: admin("Set the project's field sort_order 10, 20, ... in the given order; other projects' ids are ignored and nothing is logged", {
          parameters: parameters(projectKeyParams, 'path'),
          requestBody: body(fieldOrderBody),
          responses: { 204: { description: 'Reordered' }, ...errors(400, 401, 403, 404, 429, 500) },
        }, 'projects-admin'),
      },
      '/projects/{key}/fields/{field_key}/usage': {
        get: admin('How many records hold a value for the field, with a public field\'s 100 most common values (none for a private field); never cached', {
          parameters: parameters(fieldKeyParams, 'path'),
          responses: {
            200: ok('The usage', {
              type: 'object',
              required: ['count', 'values'],
              properties: {
                count: { type: 'integer' },
                values: { type: 'array', items: { type: 'object', required: ['value', 'n'], properties: { value: { type: 'string' }, n: { type: 'integer' } } } },
              },
            }),
            ...errors(400, 401, 404, 429, 500),
          },
        }, 'projects-admin'),
      },
      '/projects/{key}/fields/{field_key}/rename-value': {
        post: admin('Merge one spelling of a public category value into another across the project; exact matches of from change, and each record is logged as an update', {
          parameters: parameters(fieldKeyParams, 'path'),
          requestBody: body(renameValueBody),
          responses: {
            200: ok('How many records changed', { type: 'object', required: ['updated'], properties: { updated: { type: 'integer' } } }),
            ...errors(400, 401, 403, 404, 429, 500),
          },
        }, 'projects-admin'),
      },
      '/fields/{id}': {
        patch: admin('Change some of a field\'s settings; archive with is_active false, restore with true. Once a record holds a value, key, type and visibility stay', {
          parameters: parameters(fieldIdParams, 'path'),
          requestBody: body(fieldPatchBody),
          responses: { 200: ok('The field', ref('ProjectField')), ...errors(400, 401, 403, 404, 409, 429, 500) },
        }, 'projects-admin'),
        delete: admin('Delete a field no record holds a value for; archive it otherwise. Main admin only', {
          parameters: parameters(fieldIdParams, 'path'),
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404, 429, 500) },
        }, 'projects-admin'),
      },
      '/projects/{key}/records': {
        get: {
          summary:
            "A project's records with filters, search, sort and paging; f.<key>=<value> filters by a public, active, filterable custom field (other keys are ignored, at most 10); a draft only for an admin session",
          tags: ['records'],
          parameters: [...parameters(projectRecordsParams, 'path'), ...parameters(recordListQuery, 'query', RECORD_LIST_DOCS)],
          responses: { 200: ok('One page and its totals', { type: 'array', items: ref('ProjectRecord') }, ref('PageMeta')), ...errors(400, 404, 429, 500) },
        },
        post: admin('Create a record in a project (a draft too); without serial_no the next serial is assigned. Groups hold no records', {
          parameters: parameters(projectRecordsParams, 'path'),
          requestBody: body(recordCreateBody),
          responses: { 201: ok('The new record', ref('ProjectRecord')), ...errors(400, 401, 403, 404, 409, 429, 500) },
        }, 'records-admin'),
      },
      '/activity': {
        get: admin('The activity log, newest first. Private-value changes list only the field names (masked); never cached', {
          parameters: parameters(projectActivityQuery, 'query', {
            action: 'Exact action, e.g. update, private_update or import_run',
            project_type: 'A project key',
            record_id: 'Entries about one record',
            actor_email: 'Case-insensitive part of the acting admin\'s email; %, _ and \\ match literally',
            from: 'Entries at or after this time (ISO 8601 with an offset)',
            to: 'Entries at or before this time (ISO 8601 with an offset)',
            page: `Page number, 1-${MAX_ACTIVITY_PAGE}; default 1`,
            page_size: `Rows per page, 1-${MAX_PAGE_SIZE}; default ${DEFAULT_PAGE_SIZE}`,
          }),
          responses: { 200: ok('One page of entries and its totals', { type: 'array', items: ref('ActivityEntry') }, ref('PageMeta')), ...errors(400, 401, 429, 500) },
        }, 'activity'),
        post: admin(`Record a client event: one of ${CLIENT_EVENT_ACTIONS.join(', ')}. The actor is the session's admin`, {
          requestBody: body(projectActivityBody),
          responses: {
            201: ok('The new entry', { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } }),
            ...errors(400, 401, 403, 429, 500),
          },
        }, 'activity'),
      },
      '/projects/{key}/stats': {
        get: {
          summary: "Counts by year, place, union and child project, with sums of the public money and number fields and category breakdowns; a group's cover its children (only published ones without an admin session). A draft only for an admin session",
          tags: ['records'],
          parameters: [
            ...parameters(projectKeyParams, 'path'),
            ...parameters(statsQuery, 'query', { light: '1 or true: by_union is empty and categories carry no by_value (the home-page cards)' }),
          ],
          responses: { 200: ok('The stats', ref('ProjectStats')), ...errors(400, 404, 429, 500) },
        },
      },
      '/projects/{key}/years': {
        get: {
          summary: "Years that have records, newest first; a group's cover its children. A draft only for an admin session",
          tags: ['records'],
          parameters: parameters(projectRecordsParams, 'path'),
          responses: { 200: ok('Years', { type: 'array', items: { type: 'integer' } }), ...errors(400, 404, 429, 500) },
        },
      },
      '/projects/{key}/next-serial': {
        get: {
          summary: 'The serial the next new record will probably get; null for a group, an unknown key, or a draft without an admin session',
          tags: ['records'],
          parameters: parameters(projectRecordsParams, 'path'),
          responses: {
            200: ok('Prediction only; the real serial is assigned on create', {
              type: 'object',
              required: ['project_type', 'next_serial'],
              properties: { project_type: { type: 'string' }, next_serial: { type: ['integer', 'null'] } },
            }),
            ...errors(400, 429, 500),
          },
        },
      },
      '/records/{id}/serial': {
        post: admin('Move a record to another serial; the old serial is never reused, and the same serial changes nothing', {
          parameters: idParam,
          requestBody: body(serialBody),
          responses: { 200: ok('The record with its new serial', ref('ProjectRecord')), ...errors(400, 401, 403, 404, 409, 429, 500) },
        }, 'records-admin'),
      },
      '/projects/{key}/records/bulk': {
        post: admin(`Import 1-${MAX_BULK_ROWS} rows into a project (a draft too) in one transaction: all or nothing. Keys of private fields in extra are stored as private values. A refused row is named by details.row_index`, {
          parameters: parameters(projectRecordsParams, 'path'),
          requestBody: body(bulkCreateBody),
          responses: { 200: ok('How many rows were inserted', ref('BulkInsertResult')), ...errors(400, 401, 403, 404, 409, 413, 429, 500) },
        }, 'records-admin'),
        put: admin(`Update 1-${MAX_BULK_ROWS} rows by serial: absent, null or empty values stay as they are, extra merges, _clear empties the listed optional fields, and keys of private fields in extra merge into the private values`, {
          parameters: parameters(projectRecordsParams, 'path'),
          requestBody: body(recordsBulkUpdateBody),
          responses: { 200: ok('How many rows changed, and the serials not found', ref('BulkUpdateResult')), ...errors(400, 401, 403, 404, 413, 429, 500) },
        }, 'records-admin'),
      },
      '/projects/{key}/records/serial/{n}': {
        get: {
          summary: 'One record by project and serial',
          tags: ['records'],
          parameters: parameters(projectSerialParams, 'path'),
          responses: { 200: ok('The record', ref('ProjectRecord')), ...errors(400, 404, 429, 500) },
        },
      },
      '/projects/{key}/records/serials': {
        get: {
          summary: 'Records by serial, in serial order; missing serials are left out',
          tags: ['records'],
          parameters: [...parameters(projectRecordsParams, 'path'), ...parameters(serialsQuery, 'query', { nos: '1-100 comma-separated serials' })],
          responses: { 200: ok('The records found', { type: 'array', items: ref('ProjectRecord') }), ...errors(400, 404, 429, 500) },
        },
      },
      '/records/{id}/private': {
        get: admin("A record's private values, {} when it has none; never cached", {
          parameters: idParam,
          responses: { 200: ok('The private values', ref('PrivateValues')), ...errors(400, 401, 404, 429, 500) },
        }, 'records-admin'),
        put: admin("Replace a record's private values; omitted keys are removed, empty values aren't stored. Only the project's private, active fields (an unchanged archived value is kept)", {
          parameters: idParam,
          requestBody: body(privateBody),
          responses: { 200: ok('The values as stored', ref('PrivateValues')), ...errors(400, 401, 403, 404, 429, 500) },
        }, 'records-admin'),
      },
      '/projects/{key}/records/private': {
        post: admin('Private values of up to 100 records of this project, by id; others and records with none are left out', {
          parameters: parameters(projectRecordsParams, 'path'),
          requestBody: body(privateManyBody),
          responses: {
            200: ok('Values by record id', { type: 'object', additionalProperties: ref('PrivateValues') }),
            ...errors(400, 401, 403, 404, 429, 500),
          },
        }, 'records-admin'),
      },
      '/records/{id}': {
        patch: admin('Change a record; a sent extra replaces the whole extra. Photo columns, project_type and serial_no are refused', {
          parameters: idParam,
          requestBody: body(recordPatchBody),
          responses: { 200: ok('The record', ref('ProjectRecord')), ...errors(400, 401, 403, 404, 429, 500) },
        }, 'records-admin'),
        delete: admin('Delete a record with its photos and private values; main admin only', {
          parameters: idParam,
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404, 429, 500) },
        }, 'records-admin'),
        get: {
          summary: "One record; a draft project's only for an admin session. A visitor's extra holds only public fields",
          tags: ['records'],
          parameters: idParam,
          responses: { 200: ok('The record', ref('ProjectRecord')), ...errors(400, 404, 429, 500) },
        },
      },
      '/projects/{key}/cover': {
        put: admin("Upload or replace the project's cover as multipart photo (a group or a draft too); the server re-encodes it as WebP without metadata, and cover_path becomes its URL", {
          parameters: parameters(projectKeyParams, 'path'),
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['photo'],
                  properties: {
                    photo: { type: 'string', format: 'binary', description: 'JPEG, PNG or WebP, at most 5 MB' },
                    thumb: { type: 'string', format: 'binary', description: 'Optional, at most 500 KB; ignored, the server makes its own' },
                  },
                },
              },
            },
          },
          responses: { 200: ok('The project with its new cover_path', ref('Project')), ...errors(400, 401, 403, 404, 413, 429, 500) },
        }, 'projects-admin'),
        delete: admin('Remove the project\'s cover; main admin only, and a 200 when there is none', {
          parameters: parameters(projectKeyParams, 'path'),
          responses: { 200: ok('The project', ref('Project')), ...errors(400, 401, 403, 404, 429, 500) },
        }, 'projects-admin'),
      },
      '/records/{id}/photos/{slot}': {
        put: admin("Upload or replace the record's before (prev) or after (current) photo as multipart photo (and an optional thumb); the project's photo mode is checked before anything is stored, and the server re-encodes it as WebP and makes the thumbnail", {
          parameters: parameters(photoParams, 'path'),
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['photo'],
                  properties: {
                    photo: { type: 'string', format: 'binary', description: 'JPEG, PNG or WebP, at most 5 MB' },
                    thumb: { type: 'string', format: 'binary', description: 'Optional, at most 500 KB; ignored, the server makes its own' },
                  },
                },
              },
            },
          },
          responses: { 200: ok('The record with its new photo URLs', ref('ProjectRecord')), ...errors(400, 401, 403, 404, 413, 429, 500) },
        }, 'records-admin'),
        delete: admin("Remove the slot's photo and thumbnail; main admin only, and a 200 when there is none", {
          parameters: parameters(photoParams, 'path'),
          responses: { 200: ok('The record', ref('ProjectRecord')), ...errors(400, 401, 403, 404, 429, 500) },
        }, 'records-admin'),
      },
      '/photos/{id}': {
        get: {
          summary: "A photo or thumbnail, by the id in a record's *_photo_url or *_thumb_url; a draft project's only for an admin session. Visitors may cache it for a day",
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
        ProjectRecord: jsonSchema(projectRecord, 'output'),
        PrivateValues: jsonSchema(privateValues, 'output'),
        Project: jsonSchema(project, 'output'),
        ProjectField: jsonSchema(projectField, 'output'),
        PageMeta: jsonSchema(pageMeta, 'output'),
        HousingStats: jsonSchema(housingStats, 'output'),
        ProjectStats: jsonSchema(projectStats, 'output'),
        ProjectOverview: jsonSchema(projectOverview, 'output'),
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
