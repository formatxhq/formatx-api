import { Injectable } from '@nestjs/common';
import { InjectDisk, StorageDisk } from '@nestjs/storage';
import { inArray } from 'drizzle-orm';
import { type Database, InjectDb } from '../../database/provider/database.provider.js';
import { type DeletionReason, deletionLog, files } from '../../database/schema/database.schema.js';

/** The fields deletion needs from a file. */
export interface DeletableFile {
  id: string;
  storageKey: string;
}

/**
 * The one place files get deleted. Everything that removes a file (the user, cleanup, a rejected
 * upload) goes through `deleteFiles`, so storage, the `files` table and the deletion log never
 * disagree.
 */
@Injectable()
export class FileDeleterService {
  constructor(
    @InjectDb() private readonly db: Database,
    @InjectDisk() private readonly disk: StorageDisk,
  ) {}

  /**
   * Deletes the files' bytes, then marks their rows deleted and logs why. Returns how many.
   *
   * Storage goes first on purpose. If storage fails, the rows stay live and the next attempt
   * retries. If the database fails afterwards, the next attempt finds nothing left in storage and
   * just finishes the rows. Either way it ends up consistent.
   */
  async deleteFiles(filesToDelete: readonly DeletableFile[], reason: DeletionReason, now = new Date()) {
    if (filesToDelete.length === 0) return 0;

    // 1. Remove the bytes.
    await this.disk.delete(filesToDelete.map((file) => file.storageKey));

    // 2. Tombstone the rows (wiping the name and token) and record each deletion, together.
    const ids = filesToDelete.map((file) => file.id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(files)
        .set({ status: 'deleted', deletedAt: now, name: '', tokenHash: '' })
        .where(inArray(files.id, ids));
      await tx.insert(deletionLog).values(ids.map((fileId) => ({ fileId, reason, deletedAt: now })));
    });

    return filesToDelete.length;
  }
}
