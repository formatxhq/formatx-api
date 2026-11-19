import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { CleanupResult } from '@spec/formatx-api-spec';
import { and, isNull, lte } from 'drizzle-orm';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/schema/env.schema.js';
import { type Database, InjectDb } from '../../database/provider/database.provider.js';
import { files } from '../../database/schema/database.schema.js';
import { FileDeleterService } from '../../files/service/file-deleter.service.js';

/** Files deleted per round. Big enough to keep up, small enough to keep each round short. */
const BATCH_SIZE = 500;

/**
 * Deletes every file whose time is up. This is what makes "deleted within an hour" true.
 *
 * Who runs it:
 * - production: a Cloudflare cron Worker calls POST /internal/cleanup every 5 minutes (a container
 *   that has scaled to zero can't run its own timer);
 * - development: set CLEANUP_INTERVAL_SECONDS and it runs on a timer inside the API.
 */
@Injectable()
export class CleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Cleanup');
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectDb() private readonly db: Database,
    @InjectEnv() private readonly env: Env,
    private readonly fileDeleter: FileDeleterService,
  ) {}

  /** Deletes expired files, a batch at a time, until none are left. `now` is a parameter for tests. */
  async deleteExpiredFiles(now = new Date()): Promise<CleanupResult> {
    let deleted = 0;
    for (;;) {
      const expired = await this.findExpiredFiles(now);
      deleted += await this.fileDeleter.deleteFiles(expired, 'expired', now);
      if (expired.length < BATCH_SIZE) break;
    }
    if (deleted > 0) this.logger.log(`Deleted ${deleted} expired file(s)`);
    return { deleted };
  }

  private findExpiredFiles(now: Date) {
    return this.db
      .select({ id: files.id, storageKey: files.storageKey })
      .from(files)
      .where(and(isNull(files.deletedAt), lte(files.expiresAt, now)))
      .limit(BATCH_SIZE);
  }

  // ---- development timer ----

  onApplicationBootstrap() {
    const seconds = this.env.CLEANUP_INTERVAL_SECONDS;
    if (!seconds) return;
    this.timer = setInterval(() => {
      this.deleteExpiredFiles().catch((error: unknown) => this.logger.error('Cleanup failed', error as Error));
    }, seconds * 1000);
    this.timer.unref(); // don't keep the process alive just for this
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }
}
