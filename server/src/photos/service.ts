import type { Logger } from 'pino';
import { withActor, type Actor, type Sql, type Tx } from '../db.js';
import { AppError } from '../errors.js';
import type { HousingRecord } from '../housing/reads.js';
import type { StorageDriver } from '../storage/index.js';
import { removeTombstoned, type TombstonedFile } from './files.js';
import type { PhotoKind, PhotoUpload } from './process.js';

// Attaching and clearing a record's photos (docs/api/API_CONTRACT.md §4.10, §4.11) and a project's
// cover (docs/api/PROJECTS_API_CONTRACT.md §4.1.8). Files are
// written before the transaction and removed after it commits, never inside it (DB-TX-02, NS-06).
// The record's *_url columns get the public photo URL; changing them is what makes the activity
// trigger (0005_activity_log.sql) log a photo_update for the admin in withActor().

export interface PhotoDeps {
  sql: Sql;
  storage: StorageDriver;
  /** The API's public base URL (config PUBLIC_API_URL); stored URLs are built from it. */
  publicApiUrl: string;
}

const COLUMNS = {
  prev: { photo: 'prev_photo_url', thumb: 'prev_thumb_url' },
  current: { photo: 'current_photo_url', thumb: 'current_thumb_url' },
} as const satisfies Record<PhotoKind, Record<'photo' | 'thumb', keyof HousingRecord>>;

const notFound = () => new AppError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি');

/** The URL a stored file is served from: GET /api/v1/photos/:id. */
export const photoUrl = (publicApiUrl: string, fileId: string) => `${publicApiUrl}/api/v1/photos/${fileId}`;

/** Locks the record for this transaction, so two photo writes to it run one after the other. */
async function lockRecord(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx`select id from public.housing_beneficiaries where id = ${id} for update`;
  return rows.length > 0;
}

/** Marks the slot's live files for removal; they leave storage after commit. */
function tombstoneKind(tx: Tx, recordId: string, kind: PhotoKind) {
  return tx<TombstonedFile[]>`
    update public.housing_files set deleted_at = now()
    where record_id = ${recordId} and kind = ${kind} and deleted_at is null
    returning id, storage_key`;
}

/**
 * Attaches an upload's two stored files to the record's slot, replacing what was there, and
 * returns the updated record with the caller's columns (each route has its own record shape). An
 * unknown record is a 404, and the new files are removed whenever the transaction fails, so a
 * failed upload changes nothing.
 */
export async function savePhoto<R extends object>(
  deps: PhotoDeps,
  actor: Actor,
  recordId: string,
  upload: PhotoUpload,
  log: Logger,
  returning: readonly string[],
): Promise<R> {
  const { sql, storage, publicApiUrl } = deps;
  const { kind } = upload;
  if (kind === 'cover') throw new Error('a cover is saved with saveCover');
  const columns = COLUMNS[kind];
  let replaced: TombstonedFile[] = [];
  let record: R;
  try {
    record = await withActor(sql, actor, async (tx) => {
      if (!(await lockRecord(tx, recordId))) throw notFound();
      replaced = await tombstoneKind(tx, recordId, kind);
      const rows = upload.files.map((file) => ({
        record_id: recordId,
        kind,
        variant: file.variant,
        storage_key: file.key,
        storage_driver: storage.name,
        content_type: file.contentType,
        size_bytes: file.sizeBytes,
        original_name: file.originalName,
        created_by: actor.id,
      }));
      const inserted = await tx<{ id: string; variant: 'photo' | 'thumb' }[]>`
        insert into public.housing_files ${tx(rows)} returning id, variant`;
      const urls: Record<string, string> = {};
      for (const file of inserted) urls[columns[file.variant]] = photoUrl(publicApiUrl, file.id);
      const [row] = await tx<R[]>`
        update public.housing_beneficiaries set ${tx(urls)}, photo_updated_at = now()
        where id = ${recordId} returning ${tx(returning as string[])}`;
      if (!row) throw new Error('locked record vanished');
      return row;
    });
  } catch (err) {
    await Promise.allSettled(upload.files.map((file) => storage.remove(file.key)));
    throw err;
  }
  await removeTombstoned(sql, storage, replaced, log);
  return record;
}

/**
 * Clears the record's photo and thumb of one kind. With nothing to clear the record comes back
 * unchanged, so a repeated delete is a 200 and logs nothing (contract §4.11). Null for an unknown record.
 */
export async function deletePhoto<R extends object>(
  deps: Omit<PhotoDeps, 'publicApiUrl'>,
  actor: Actor,
  recordId: string,
  kind: PhotoKind,
  log: Logger,
  returning: readonly string[],
): Promise<R | null> {
  const { sql, storage } = deps;
  const columns = COLUMNS[kind];
  let removed: TombstonedFile[] = [];
  const record = await withActor(sql, actor, async (tx) => {
    if (!(await lockRecord(tx, recordId))) return null;
    removed = await tombstoneKind(tx, recordId, kind);
    const [cleared] = await tx<R[]>`
      update public.housing_beneficiaries
      set ${tx({ [columns.photo]: null, [columns.thumb]: null })}, photo_updated_at = now()
      where id = ${recordId} and (${tx(columns.photo)} is not null or ${tx(columns.thumb)} is not null)
      returning ${tx(returning as string[])}`;
    if (cleared) return cleared;
    const [unchanged] = await tx<R[]>`
      select ${tx(returning as string[])} from public.housing_beneficiaries where id = ${recordId}`;
    return unchanged ?? null;
  });
  await removeTombstoned(sql, storage, removed, log);
  return record;
}

const projectNotFound = () => new AppError('NOT_FOUND', 'প্রকল্প পাওয়া যায়নি');

/** Locks the project for this transaction, so two cover writes to it run one after the other. */
async function lockProject(tx: Tx, key: string): Promise<boolean> {
  const rows = await tx`select key from public.housing_projects where key = ${key} for update`;
  return rows.length > 0;
}

/** Marks the project's live cover files for removal; they leave storage after commit. */
export function tombstoneCover(tx: Tx, projectKey: string) {
  return tx<TombstonedFile[]>`
    update public.housing_files set deleted_at = now()
    where project_key = ${projectKey} and kind = 'cover' and deleted_at is null
    returning id, storage_key`;
}

/**
 * Makes an upload the project's cover, replacing the old one: cover_path gets the photo's URL, and
 * the change is logged as a project_update by the config log trigger. An unknown project is a 404,
 * and the new files are removed whenever the transaction fails.
 */
export async function saveCover(deps: PhotoDeps, actor: Actor, projectKey: string, upload: PhotoUpload, log: Logger): Promise<void> {
  const { sql, storage, publicApiUrl } = deps;
  if (upload.kind !== 'cover') throw new Error('not a cover upload');
  let replaced: TombstonedFile[] = [];
  try {
    await withActor(sql, actor, async (tx) => {
      if (!(await lockProject(tx, projectKey))) throw projectNotFound();
      replaced = await tombstoneCover(tx, projectKey);
      const rows = upload.files.map((file) => ({
        project_key: projectKey,
        kind: 'cover',
        variant: file.variant,
        storage_key: file.key,
        storage_driver: storage.name,
        content_type: file.contentType,
        size_bytes: file.sizeBytes,
        original_name: file.originalName,
        created_by: actor.id,
      }));
      const inserted = await tx<{ id: string; variant: 'photo' | 'thumb' }[]>`
        insert into public.housing_files ${tx(rows)} returning id, variant`;
      const photo = inserted.find((file) => file.variant === 'photo');
      if (!photo) throw new Error('cover upload had no photo');
      await tx`update public.housing_projects set cover_path = ${photoUrl(publicApiUrl, photo.id)} where key = ${projectKey}`;
    });
  } catch (err) {
    await Promise.allSettled(upload.files.map((file) => storage.remove(file.key)));
    throw err;
  }
  await removeTombstoned(sql, storage, replaced, log);
}

/**
 * Removes the project's cover. With no cover nothing changes and nothing is logged, so a repeated
 * delete succeeds. False for an unknown project.
 */
export async function deleteCover(deps: Omit<PhotoDeps, 'publicApiUrl'>, actor: Actor, projectKey: string, log: Logger): Promise<boolean> {
  const { sql, storage } = deps;
  let removed: TombstonedFile[] = [];
  const found = await withActor(sql, actor, async (tx) => {
    if (!(await lockProject(tx, projectKey))) return false;
    removed = await tombstoneCover(tx, projectKey);
    await tx`update public.housing_projects set cover_path = null where key = ${projectKey} and cover_path is not null`;
    return true;
  });
  await removeTombstoned(sql, storage, removed, log);
  return found;
}
