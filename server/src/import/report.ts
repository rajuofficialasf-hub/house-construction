// The import's report: what the operator must look at, by id only. It never holds names,
// addresses, emails, hashes or other column values, so it can be read on a shared screen.
import { readFile, writeFile } from 'node:fs/promises';
import type { DisabledReason } from './admins.js';
import type { UrlColumn } from './source.js';

export interface PhotoSlotRef {
  record_id: string;
  project_type: string;
  serial_no: number;
  slot: UrlColumn;
}

export interface ImportReport {
  created_at: string;
  source: string;
  target: string;
  /** A photo the source points at that couldn't be copied: its slot stays empty. */
  photo_gaps: (PhotoSlotRef & { reason: 'not_found' | 'outside_base' })[];
  /** A thumb the source lacked, made from its photo. */
  generated_thumbs: PhotoSlotRef[];
  admins_disabled: { id: string; reasons: DisabledReason[] }[];
}

/** Writes the report readable by its owner only, refusing to overwrite an earlier one. */
export async function writeReport(path: string, report: ImportReport): Promise<void> {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

export async function readReport(path: string): Promise<ImportReport> {
  return JSON.parse(await readFile(path, 'utf8')) as ImportReport;
}
