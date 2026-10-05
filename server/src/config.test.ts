import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const valid = {
  NODE_ENV: 'production',
  PORT: '8080',
  LOG_LEVEL: 'warn',
  TRUST_PROXY: '2',
  DATABASE_URL: 'postgres://housing_app:pw@127.0.0.1:5432/housing',
  ALLOWED_ORIGINS: 'https://housing.example.org,http://localhost:5173',
  COOKIE_SECURE: 'false',
};

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    expect(loadConfig(valid)).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'warn',
      TRUST_PROXY: 2,
      DATABASE_URL: 'postgres://housing_app:pw@127.0.0.1:5432/housing',
      ALLOWED_ORIGINS: ['https://housing.example.org', 'http://localhost:5173'],
      PUBLIC_READ_ORIGINS: [],
      COOKIE_SECURE: false,
    });
  });

  it('applies defaults for optional settings', () => {
    const config = loadConfig({ DATABASE_URL: valid.DATABASE_URL, ALLOWED_ORIGINS: 'http://localhost:5173' });
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

  it('defaults COOKIE_SECURE to true, so a forgotten setting is the safe one', () => {
    const { COOKIE_SECURE: _omit, ...env } = valid;
    expect(loadConfig(env).COOKIE_SECURE).toBe(true);
    expect(loadConfig({ ...valid, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
  });

  it('rejects a COOKIE_SECURE that is not true or false', () => {
    expect(() => loadConfig({ ...valid, COOKIE_SECURE: 'yes' })).toThrow(/COOKIE_SECURE/);
  });

  it('requires ALLOWED_ORIGINS', () => {
    const { ALLOWED_ORIGINS: _omit, ...env } = valid;
    expect(() => loadConfig(env)).toThrow(/ALLOWED_ORIGINS/);
    expect(() => loadConfig({ ...valid, ALLOWED_ORIGINS: '' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it.each(['https://housing.example.org/', 'https://housing.example.org/app', '*', 'housing.example.org'])(
    'rejects %s as an allowed origin',
    (origin) => {
      expect(() => loadConfig({ ...valid, ALLOWED_ORIGINS: origin })).toThrow(/ALLOWED_ORIGINS/);
    },
  );

  it('trims spaces around allowed origins', () => {
    const config = loadConfig({ ...valid, ALLOWED_ORIGINS: ' https://a.example.org , https://b.example.org ' });
    expect(config.ALLOWED_ORIGINS).toEqual(['https://a.example.org', 'https://b.example.org']);
  });

  it('defaults PUBLIC_READ_ORIGINS to none', () => {
    expect(loadConfig(valid).PUBLIC_READ_ORIGINS).toEqual([]);
    expect(loadConfig({ ...valid, PUBLIC_READ_ORIGINS: '' }).PUBLIC_READ_ORIGINS).toEqual([]);
    expect(loadConfig({ ...valid, PUBLIC_READ_ORIGINS: ' ' }).PUBLIC_READ_ORIGINS).toEqual([]);
  });

  it('parses public-read origins', () => {
    const config = loadConfig({ ...valid, PUBLIC_READ_ORIGINS: 'https://a.example.org, https://b.example.org' });
    expect(config.PUBLIC_READ_ORIGINS).toEqual(['https://a.example.org', 'https://b.example.org']);
  });

  it.each(['*', 'https://a.example.org/', 'a.example.org'])('rejects %s as a public-read origin', (origin) => {
    expect(() => loadConfig({ ...valid, PUBLIC_READ_ORIGINS: origin })).toThrow(/PUBLIC_READ_ORIGINS/);
  });

  it('rejects an origin listed as both credentialed and public-read', () => {
    expect(() => loadConfig({ ...valid, PUBLIC_READ_ORIGINS: 'https://other.example.org,http://localhost:5173' })).toThrow(
      /PUBLIC_READ_ORIGINS: http:\/\/localhost:5173 is also in ALLOWED_ORIGINS/,
    );
  });
});
