import type { ProjectType } from './schemas.js';

// The record row and paging helpers the project routes build on (src/records/reads.ts,
// src/housing/activity.ts).

export interface HousingRecord {
  id: string;
  project_type: ProjectType;
  serial_no: number;
  year: number;
  name: string;
  father_or_husband_name: string;
  division: string;
  district: string;
  upazila: string;
  address: string;
  prev_photo_url: string | null;
  prev_thumb_url: string | null;
  current_photo_url: string | null;
  current_thumb_url: string | null;
  prev_photo_source: string | null;
  current_photo_source: string | null;
  photo_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Exactly the record fields of docs/api/PROJECTS_API_CONTRACT.md §3.4. Named, never `*`, so a column added later stays private
// until someone decides to publish it (DB-Q-05).
export const RECORD_COLUMNS = [
  'id', 'project_type', 'serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila',
  'address', 'prev_photo_url', 'prev_thumb_url', 'current_photo_url', 'current_thumb_url', 'prev_photo_source',
  'current_photo_source', 'photo_updated_at', 'created_at', 'updated_at',
] as const satisfies readonly (keyof HousingRecord)[];

export interface Page<T> {
  data: T[];
  meta: { page: number; page_size: number; total: number; total_pages: number };
}

/** A page of rows with the contract's meta; total_pages is at least 1, so an empty result still has a page. */
export function toPage<T>(data: T[], query: { page: number; page_size: number }, total: number): Page<T> {
  return {
    data,
    meta: { page: query.page, page_size: query.page_size, total, total_pages: Math.max(1, Math.ceil(total / query.page_size)) },
  };
}

/** Escapes LIKE wildcards so `%`, `_` and `\` in a search match themselves. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
