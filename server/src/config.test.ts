import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const valid = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  PORT: '8080',
  LOG_LEVEL: 'warn',
  TRUST_PROXY: '2',
  DATABASE_URL: 'postgres://housing_app:pw@127.0.0.1:5432/housing',
  ALLOWED_ORIGINS: 'https://housing.example.org,http://localhost:5173',
  COOKIE_SECURE: 'false',
  PUBLIC_API_URL: 'https://api.example.org',
  STORAGE_DRIVER: 'nas',
  STORAGE_ROOT: '/srv/housing/storage',
};

const s3 = {
  ...valid,
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'housing-photos',
  S3_REGION: 'auto',
};

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    expect(loadConfig(valid)).toEqual({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 8080,
      LOG_LEVEL: 'warn',
      TRUST_PROXY: 2,
      DATABASE_URL: 'postgres://housing_app:pw@127.0.0.1:5432/housing',
      ALLOWED_ORIGINS: ['https://housing.example.org', 'http://localhost:5173'],
      PUBLIC_READ_ORIGINS: [],
      COOKIE_SECURE: false,
      PUBLIC_API_URL: 'https://api.example.org',
      STORAGE_DRIVER: 'nas',
      STORAGE_ROOT: '/srv/housing/storage',
    });
  });

  it('applies defaults for optional settings', () => {
    const config = loadConfig({
      DATABASE_URL: valid.DATABASE_URL,
      ALLOWED_ORIGINS: 'http://localhost:5173',
      PUBLIC_API_URL: valid.PUBLIC_API_URL,
      STORAGE_DRIVER: 'nas',
      STORAGE_ROOT: valid.STORAGE_ROOT,
    });
    expect(config).toMatchObject({ NODE_ENV: 'development', HOST: '127.0.0.1', PORT: 3001, LOG_LEVEL: 'info', TRUST_PROXY: 0 });
  });

  it('names a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...env } = valid;
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it('names an empty HOST', () => {
    expect(() => loadConfig({ ...valid, HOST: ' ' })).toThrow(/HOST/);
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

  it('requires STORAGE_DRIVER, with no default', () => {
    const { STORAGE_DRIVER: _omit, ...env } = valid;
    expect(() => loadConfig(env)).toThrow(/STORAGE_DRIVER/);
  });

  it('rejects an unknown storage driver', () => {
    expect(() => loadConfig({ ...valid, STORAGE_DRIVER: 'ftp' })).toThrow(/STORAGE_DRIVER/);
  });

  it('requires STORAGE_ROOT for the nas driver', () => {
    const { STORAGE_ROOT: _omit, ...env } = valid;
    expect(() => loadConfig(env)).toThrow(/STORAGE_ROOT/);
    expect(() => loadConfig({ ...valid, STORAGE_ROOT: ' ' })).toThrow(/STORAGE_ROOT/);
  });

  it('parses an s3 configuration, path style off by default', () => {
    expect(loadConfig(s3)).toMatchObject({ STORAGE_DRIVER: 's3', S3_BUCKET: 'housing-photos', S3_REGION: 'auto', S3_FORCE_PATH_STYLE: false });
    expect(loadConfig({ ...s3, S3_ENDPOINT: 'http://127.0.0.1:9000', S3_FORCE_PATH_STYLE: 'true' })).toMatchObject({
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_FORCE_PATH_STYLE: true,
    });
  });

  it('names a missing S3_BUCKET or S3_REGION for the s3 driver', () => {
    const { S3_BUCKET: _bucket, ...noBucket } = s3;
    const { S3_REGION: _region, ...noRegion } = s3;
    expect(() => loadConfig(noBucket)).toThrow(/S3_BUCKET/);
    expect(() => loadConfig(noRegion)).toThrow(/S3_REGION/);
  });

  it('never echoes S3 credentials in the error', () => {
    expect(() => loadConfig({ ...s3, S3_BUCKET: '', AWS_SECRET_ACCESS_KEY: 'sekrit-key' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('sekrit-key') }),
    );
  });

  it('reports base and storage problems together', () => {
    const { STORAGE_ROOT: _omit, ...env } = valid;
    expect(() => loadConfig({ ...env, PORT: 'x' })).toThrow(/PORT[\s\S]*STORAGE_ROOT/);
  });

  it('requires PUBLIC_API_URL', () => {
    const { PUBLIC_API_URL: _omit, ...env } = valid;
    expect(() => loadConfig(env)).toThrow(/PUBLIC_API_URL/);
  });

  it('accepts a PUBLIC_API_URL with a path prefix', () => {
    expect(loadConfig({ ...valid, PUBLIC_API_URL: 'https://example.org/housing-api' }).PUBLIC_API_URL).toBe('https://example.org/housing-api');
  });

  it.each(['https://api.example.org/', 'api.example.org', 'ftp://api.example.org', 'https://api.example.org?x=1'])(
    'rejects %s as PUBLIC_API_URL',
    (value) => {
      expect(() => loadConfig({ ...valid, PUBLIC_API_URL: value })).toThrow(/PUBLIC_API_URL/);
    },
  );
});
