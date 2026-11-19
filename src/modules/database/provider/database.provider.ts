import { resolve } from 'node:path';
import { Inject, type Provider } from '@nestjs/common';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/schema/env.schema.js';
import * as schema from '../schema/database.schema.js';

/** The Drizzle database, whichever driver is underneath. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Injection token for the database. Use `@InjectDb() private readonly db: Database`. */
export const DB = Symbol('DB');
export const InjectDb = () => Inject(DB);

/** SQL migrations live at the repo root in `drizzle/` (four folders up from here, in src/ and dist/ alike). */
export const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '../../../../drizzle');

/** An open connection plus how to close it on shutdown. */
export class DatabaseConnection {
  constructor(
    readonly db: Database,
    readonly driver: 'postgres' | 'pglite',
    readonly close: () => Promise<void>,
  ) {}
}

/**
 * Real Postgres when DATABASE_URL is set (production, CI). Otherwise PGlite: Postgres compiled to
 * WebAssembly and running inside this process, so development and tests need no database server.
 * Same tables, same queries.
 */
export async function openDatabase(env: Env): Promise<DatabaseConnection> {
  return env.DATABASE_URL
    ? openPostgres(env.DATABASE_URL, env.DB_MIGRATE_ON_START ?? false)
    : openPglite(env.PGLITE_DIR);
}

async function openPostgres(url: string, migrateOnStart: boolean): Promise<DatabaseConnection> {
  const { default: pg } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });

  if (migrateOnStart) {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  return new DatabaseConnection(db, 'postgres', () => pool.end());
}

async function openPglite(dataDir: string | undefined): Promise<DatabaseConnection> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });

  // Single process, so migrating at startup is always safe here.
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return new DatabaseConnection(db, 'pglite', () => client.close());
}

/** The providers DatabaseModule registers: the connection, and the `DB` token pointing at it. */
export const databaseProviders: Provider[] = [
  { provide: DatabaseConnection, inject: [ENV], useFactory: openDatabase },
  { provide: DB, inject: [DatabaseConnection], useFactory: (connection: DatabaseConnection) => connection.db },
];
