// The import's report: what the operator must look at, by id only. It never holds names,
// addresses, emails, hashes or other column values, so it can be read on a shared screen.
import { open, readFile, rm } from 'node:fs/promises';
import type { DisabledAdmin } from './admins.js';
import type { UrlColumn } from './source.js';

export interface PhotoSlotRef {
  record_id: string;
  project_type: string;
  serial_no: number;
  slot: UrlColumn;
}

/** A photo the source points at that couldn't be copied: its slot stays empty. */
export type PhotoGap = PhotoSlotRef & { reason: 'not_found' | 'outside_base' };

export interface ImportReport {
  created_at: string;
  source: string;
  target: string;
  photo_gaps: PhotoGap[];
  /** A thumb the source lacked, made from its photo. */
  generated_thumbs: PhotoSlotRef[];
  admins_disabled: DisabledAdmin[];
}

export interface ReportFile {
  write(report: ImportReport): Promise<void>;
  /** Removes the still-empty file after an import that changed nothing. */
  discard(): Promise<void>;
}

/**
 * Creates the report file, readable by its owner only, before the import starts: an existing file or
 * a path that can't be written stops the run before anything is copied, never after it committed.
 */
export async function createReportFile(path: string): Promise<ReportFile> {
  const handle = await open(path, 'wx', 0o600);
  return {
    async write(report) {
      try {
        await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`);
      } finally {
        await handle.close();
      }
    },
    async discard() {
      await handle.close();
      await rm(path, { force: true });
    },
  };
}

/** Writes a report file in one step (tests, and verify runs that build their own). */
export async function writeReport(path: string, report: ImportReport): Promise<void> {
  await (await createReportFile(path)).write(report);
}

export async function readReport(path: string): Promise<ImportReport> {
  return JSON.parse(await readFile(path, 'utf8')) as ImportReport;
}
