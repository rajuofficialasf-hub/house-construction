/** No stored file at this key. Callers map it to a 404; the key itself is never shown to clients. */
export class StorageNotFoundError extends Error {
  override name = 'StorageNotFoundError';
  constructor(readonly key: string) {
    super(`no stored file at ${key}`);
  }
}

/** A key that a driver refuses to touch, such as one that would leave the storage root (NE-SEC-07). */
export class StorageKeyError extends Error {
  override name = 'StorageKeyError';
}
