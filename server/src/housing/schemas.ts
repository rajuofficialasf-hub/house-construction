import { z } from 'zod';

// Request and response shapes of the public housing reads (docs/api/API_CONTRACT.md §3, §4).
// The routes parse with the request schemas, and the OpenAPI document is built from all of them,
// so the spec can't describe a shape the server doesn't use.

/** The largest value Postgres int4 holds. Bigger ids or serials would make the query fail with a 500. */
export const INT4_MAX = 2147483647;

export const PROJECT_TYPES = ['semi_pucca', 'tin'] as const;
export const SORT_FIELDS = ['serial_no', 'year', 'name', 'created_at'] as const;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_SERIALS = 100;
const MAX_TEXT = 100;

export const projectType = z.enum(PROJECT_TYPES);

// Decimal digits only. z.coerce.number would also accept "", "1e3", "0x10" and "1.0".
const digits = z.string().regex(/^[0-9]{1,10}$/, 'must be a whole number');

function intParam(min: number, max: number) {
  return digits.transform(Number).pipe(z.number().int().min(min).max(max));
}

// Trimmed and NFC-normalized, because stored text is NFC and filters compare exactly (contract §3.3).
// A blank value counts as absent, so a form's empty field doesn't filter everything out.
const textParam = z
  .string()
  .trim()
  .max(MAX_TEXT)
  .transform((value) => (value === '' ? undefined : value.normalize('NFC')))
  .optional();

export const listQuery = z.object({
  project_type: projectType.optional(),
  serial_no: intParam(1, INT4_MAX).optional(),
  // The table only holds 2000-2100, so a year outside it is a mistake, not an empty filter.
  year: intParam(2000, 2100).optional(),
  division: textParam,
  district: textParam,
  upazila: textParam,
  q: textParam,
  page: intParam(1, INT4_MAX).default(1),
  page_size: intParam(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.enum(SORT_FIELDS).default('serial_no'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListQuery = z.infer<typeof listQuery>;

export const idParams = z.object({ id: z.uuid() });

export const serialParams = z.object({
  project_type: projectType,
  serial_no: intParam(1, INT4_MAX),
});

export const serialsParams = z.object({ project_type: projectType });

// "1,2,3": one to 100 whole numbers. Returned deduped and ascending, the order the response uses.
export const serialsQuery = z.object({
  nos: z
    .string()
    .regex(new RegExp(`^[0-9]{1,10}(,[0-9]{1,10}){0,${MAX_SERIALS - 1}}$`), `must be 1-${MAX_SERIALS} comma-separated whole numbers`)
    .transform((value) => value.split(',').map(Number))
    .pipe(z.array(z.number().int().min(1).max(INT4_MAX)))
    .transform((nos) => [...new Set(nos)].sort((a, b) => a - b)),
});

export const projectTypeQuery = z.object({ project_type: projectType.optional() });
export const nextSerialQuery = z.object({ project_type: projectType });

// Responses. Strict objects, so a test that parses a response also proves no extra column leaks.

const timestamp = z.iso.datetime({ offset: true });

export const housingRecord = z.strictObject({
  id: z.uuid(),
  project_type: projectType,
  serial_no: z.number().int(),
  year: z.number().int(),
  name: z.string(),
  father_or_husband_name: z.string(),
  division: z.string(),
  district: z.string(),
  upazila: z.string(),
  address: z.string(),
  prev_photo_url: z.string().nullable(),
  prev_thumb_url: z.string().nullable(),
  current_photo_url: z.string().nullable(),
  current_thumb_url: z.string().nullable(),
  prev_photo_source: z.string().nullable(),
  current_photo_source: z.string().nullable(),
  photo_updated_at: timestamp.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const pageMeta = z.strictObject({
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  total_pages: z.number().int(),
});

const counts = z.record(z.string(), z.number().int());

export const housingStats = z.strictObject({
  total: z.number().int(),
  by_year: counts,
  by_division: counts,
  by_district: counts,
  by_upazila: counts,
  distinct: z.strictObject({ divisions: z.number().int(), districts: z.number().int(), upazilas: z.number().int() }),
  by_location: counts,
});

export const filterOptions = z.strictObject({
  years: z.array(z.number().int()),
  divisions: z.array(z.string()),
  districts: z.array(z.string()),
  upazilas: z.array(z.string()),
});

export const nextSerial = z.strictObject({ project_type: projectType, next_serial: z.number().int() });

export const errorBody = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.strictObject({ field: z.string().optional(), reason: z.string().optional() }).optional(),
  }),
});
