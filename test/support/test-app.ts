import { DiscoveryModule } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/common/setup/configure-app.js';
import { ENV } from '../../src/modules/config/config.module.js';
import { loadEnv } from '../../src/modules/config/schema/env.schema.js';

/**
 * The real app, wired exactly as main.ts wires it, with files kept in memory.
 * The database is PGlite, unless DATABASE_URL is set: that's how CI runs the same tests against a
 * real Postgres server.
 */
export async function createTestApp(settings: Record<string, string> = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  const env = loadEnv({
    NODE_ENV: 'test',
    STORAGE_DRIVER: 'memory',
    ...(databaseUrl ? { DATABASE_URL: databaseUrl, DB_MIGRATE_ON_START: 'true' } : {}),
    ...settings,
  });

  // DiscoveryModule lets the contract test list every route the app serves.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, env);
  await app.init();

  return { app, env, server: app.getHttpServer() as App };
}
