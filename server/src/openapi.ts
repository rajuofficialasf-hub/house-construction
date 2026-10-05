import { z } from 'zod';
import {
  errorBody,
  filterOptions,
  housingRecord,
  DEFAULT_PAGE_SIZE,
  housingStats,
  idParams,
  INT4_MAX,
  listQuery,
  MAX_PAGE_SIZE,
  MAX_SERIALS,
  nextSerial,
  nextSerialQuery,
  pageMeta,
  projectTypeQuery,
  serialParams,
  serialsParams,
  serialsQuery,
  YEAR_MAX,
  YEAR_MIN,
} from './housing/schemas.js';

// The OpenAPI 3.1 description of the public /api/v1 routes, served at /api/v1/openapi.json for
// other apps (docs/api/API_CONTRACT.md §1). Parameter and body schemas come from the same zod
// schemas the routes parse with; test/http/openapi.test.ts fails if a route and its entry drift
// apart. Admin routes are left out on purpose: only this site uses them.

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
  responses: Record<string, { description: string; content?: Record<string, { schema: JsonSchema }> }>;
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, { get?: Operation }>;
  components: { schemas: Record<string, JsonSchema> };
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
  400: 'Invalid parameter (VALIDATION_ERROR); details.field names it',
  404: 'No such record (NOT_FOUND)',
  429: 'Too many requests from this IP (RATE_LIMITED)',
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

  return {
    openapi: '3.1.0',
    info: {
      title: 'Housing project API',
      version: '0.11',
      description:
        'Public, read-only access to the housing project records. No login is needed. Browser apps must be listed in PUBLIC_READ_ORIGINS and call without credentials.',
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
      '/housing': reads('List records with filters, search, sort and paging', {
        parameters: parameters(listQuery, 'query', LIST_DOCS),
        responses: { 200: ok('One page and its totals', { type: 'array', items: ref('HousingRecord') }, ref('PageMeta')), ...errors(400, 429, 500) },
      }),
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
      '/housing/{id}': reads('One record by id', {
        parameters: parameters(idParams, 'path'),
        responses: { 200: ok('The record', ref('HousingRecord')), ...errors(400, 404, 429, 500) },
      }),
    },
    components: {
      schemas: {
        HousingRecord: jsonSchema(housingRecord, 'output'),
        PageMeta: jsonSchema(pageMeta, 'output'),
        HousingStats: jsonSchema(housingStats, 'output'),
        FilterOptions: jsonSchema(filterOptions, 'output'),
        NextSerial: jsonSchema(nextSerial, 'output'),
        Error: jsonSchema(errorBody, 'output'),
      },
    },
  };
}
