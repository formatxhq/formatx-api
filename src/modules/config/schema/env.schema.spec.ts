import { loadEnv } from './env.schema.js';

describe('loadEnv', () => {
  it('runs with no settings at all in development', () => {
    const env = loadEnv({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.ANON_FILE_TTL_SECONDS).toBe(3600);
    expect(env.STORAGE_SIGNING_KEY.length).toBeGreaterThanOrEqual(32);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200']);
  });

  it('refuses to start production without a database, R2 and an internal secret', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(
      /DATABASE_URL: required in production[\s\S]*INTERNAL_SECRET[\s\S]*STORAGE_DRIVER: must be s3/,
    );
  });

  it('accepts a complete production config', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@db:5432/formatx',
      INTERNAL_SECRET: 'x'.repeat(40),
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
      S3_BUCKET: 'formatx-files',
      CORS_ORIGINS: 'https://formatx.app, https://www.formatx.app',
    });

    expect(env.CORS_ORIGINS).toEqual(['https://formatx.app', 'https://www.formatx.app']);
  });

  it('rejects a weak internal secret', () => {
    expect(() => loadEnv({ INTERNAL_SECRET: 'short' })).toThrow(/INTERNAL_SECRET/);
  });
});
