import type { StorageConfig } from '../config.js';
import { createNasDriver } from './drivers/nas.js';
import { createS3Driver } from './drivers/s3.js'; // TEMP: remove when the app is NAS-only (NS-35)
import type { StorageDriver } from './types.js';

export { StorageKeyError, StorageNotFoundError } from './errors.js';
export type { StorageDriver } from './types.js';

type DriverFactory<K extends StorageDriver['name']> = (config: Extract<StorageConfig, { STORAGE_DRIVER: K }>) => StorageDriver;

// The only place that knows which drivers exist (NS-32). Adding or removing one is a file in
// drivers/ plus its line here.
const drivers: { [K in StorageConfig['STORAGE_DRIVER']]: DriverFactory<K> } = {
  nas: createNasDriver,
  s3: createS3Driver, // TEMP: remove when the app is NAS-only (NS-35)
};

/** Builds the driver STORAGE_DRIVER names. The app gets it through createApp's deps, never by import. */
export function createStorage(config: StorageConfig): StorageDriver {
  return (drivers[config.STORAGE_DRIVER] as (c: StorageConfig) => StorageDriver)(config);
}
