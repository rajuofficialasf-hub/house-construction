import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const valid = {
  NODE_ENV: 'production',
  PORT: '8080',
  LOG_LEVEL: 'warn',
  TRUST_PROXY: '2',
  DATABASE_URL: 'postgres://housing_app:pw@127.0.0.1:5432/housing',
};

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    expect(loadConfig(valid)).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'warn',
      TRUST_PROXY: 2,
      DATABASE_URL: 'postgres://housing_app:pw@127.0.0.1:5432/housing',
    });
  });

  it('applies defaults for optional settings', () => {
    const config = loadConfig({ DATABASE_URL: valid.DATABASE_URL });
    expect(config).toMatchObject({ NODE_ENV: 'development', PORT: 3001, LOG_LEVEL: 'info', TRUST_PROXY: 0 });
  });

  it('names a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...env } = valid;
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it('names a non-numeric PORT', () => {
    expect(() => loadConfig({ ...valid, PORT: 'eighty' })).toThrow(/PORT/);
  });

  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'https://example.org/db' })).toThrow(/DATABASE_URL/);
  });

  it('never echoes the database password in the error', () => {
    expect(() => loadConfig({ ...valid, PORT: 'x', DATABASE_URL: 'postgres://u:hunter2@h/db' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
    );
  });
});
