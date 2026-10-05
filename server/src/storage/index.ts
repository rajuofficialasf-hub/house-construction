import type { StorageConfig } from '../config.js';
import { createNasDriver } from './drivers/nas.js';
import type { StorageDriver } from './types.js';

export { StorageKeyError, StorageNotFoundError } from './errors.js';
export type { StorageDriver } from './types.js';

type DriverFactory<K extends StorageDriver['name']> = (config: Extract<StorageConfig, { STORAGE_DRIVER: K }>) => StorageDriver;

// The only place that knows which drivers exist (NS-32). Adding or removing one is a file in
// drivers/ plus its line here.
const drivers: { [K in StorageConfig['STORAGE_DRIVER']]?: DriverFactory<K> } = {
  nas: createNasDriver,
};

/** Builds the driver STORAGE_DRIVER names. The app gets it through createApp's deps, never by import. */
export function createStorage(config: StorageConfig): StorageDriver {
  const factory = drivers[config.STORAGE_DRIVER] as ((c: StorageConfig) => StorageDriver) | undefined;
  if (!factory) throw new Error(`storage driver ${config.STORAGE_DRIVER} is not available`);
  return factory(config);
}
