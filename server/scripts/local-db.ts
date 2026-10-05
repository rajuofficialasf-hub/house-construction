const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Throws unless the URL points at a database on this machine, so dev and test tools can't touch shared data (TS-03). */
export function assertLocalDatabaseUrl(name: string, url: string | undefined): string {
  if (!url) throw new Error(`${name} is not set`);
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(`${name} must point at a local database, got host "${hostname}"`);
  }
  return url;
}
