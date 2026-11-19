/**
 * `npm run db:migrate`: applies pending migrations to the Postgres database in DATABASE_URL, then exits.
 * Run it as a release step before new API instances start, so several instances booting at once
 * never race to migrate.
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { MIGRATIONS_FOLDER } from '../provider/database.provider.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
