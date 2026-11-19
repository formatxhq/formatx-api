/**
 * The database tables. Edit this file, then run `npm run db:generate` to write the migration.
 */
import { sql } from 'drizzle-orm';
import { bigserial, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true });

// ---- enums ----
export const fileStatus = pgEnum('file_status', ['pending', 'ready', 'deleted']);
export const fileRole = pgEnum('file_role', ['input', 'output']);
export const jobStatus = pgEnum('job_status', ['queued', 'running', 'succeeded', 'failed']);
export const deletionReason = pgEnum('deletion_reason', ['expired', 'user_request', 'rejected']);

// ---- files ----
/**
 * Every stored file. Anonymous files have an `expires_at` and cleanup deletes them.
 * After deletion the row stays as a tombstone, with its name and token wiped.
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey(),
    /** SHA-256 of the file's token. The token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    /** Where the bytes live in storage, e.g. `anon/<id>`. */
    storageKey: text('storage_key').notNull().unique(),
    /** The user's file name. Personal data: never logged, wiped on deletion. */
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    role: fileRole('role').notNull().default('input'),
    status: fileStatus('status').notNull().default('pending'),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    /** When cleanup deletes it. Null = kept until the owner deletes it (account files, later). */
    expiresAt: timestampColumn('expires_at'),
    deletedAt: timestampColumn('deleted_at'),
  },
  (table) => [
    // Cleanup scans only files that still exist.
    index('files_live_expiry_idx')
      .on(table.expiresAt)
      .where(sql`${table.deletedAt} is null`),
  ],
);

// ---- jobs ----
/** A tool run (merge, split, …) over input files. The table exists now; jobs arrive in milestone 3. */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    tool: text('tool').notNull(),
    status: jobStatus('status').notNull().default('queued'),
    options: jsonb('options')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    inputFileIds: uuid('input_file_ids').array().notNull(),
    outputFileId: uuid('output_file_id').references(() => files.id),
    errorCode: text('error_code'),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    startedAt: timestampColumn('started_at'),
    finishedAt: timestampColumn('finished_at'),
    expiresAt: timestampColumn('expires_at'),
  },
  (table) => [index('jobs_expiry_idx').on(table.expiresAt)],
);

// ---- deletion_log ----
/** Proof that each deletion happened: which file, why, when. No names, no tokens. */
export const deletionLog = pgTable('deletion_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id),
  reason: deletionReason('reason').notNull(),
  deletedAt: timestampColumn('deleted_at').notNull().defaultNow(),
});

// ---- row types ----
export type FileRow = typeof files.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type DeletionReason = (typeof deletionReason.enumValues)[number];
