const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Throws unless the URL points at a database on this machine, so dev and test tools can't touch shared data (TS-03).
 * `extraHosts` admits more names; only the seed passes one (`db`, the compose database, when HOUSING_DEV_COMPOSE=1).
 */
export function assertLocalDatabaseUrl(name: string, url: string | undefined, extraHosts: readonly string[] = []): string {
  if (!url) throw new Error(`${name} is not set`);
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname) && !extraHosts.includes(hostname)) {
    throw new Error(`${name} must point at a local database, got host "${hostname}"`);
  }
  return url;
}
