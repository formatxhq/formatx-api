import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { detectContentType, InjectDisk, StorageDisk, StorageFileNotFoundError } from '@nestjs/storage';
import type { CreateFileRequest, CreateFileResponse, DownloadLink, FileView } from '@spec/formatx-api-spec';
import { and, eq, isNull } from 'drizzle-orm';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/schema/env.schema.js';
import { type Database, InjectDb } from '../../database/provider/database.provider.js';
import { type FileRow, files } from '../../database/schema/database.schema.js';
import { toFileView } from '../mapper/file-view.mapper.js';
import { sanitizeFileName } from '../util/file-name.util.js';
import { createFileToken, fileTokenMatches, hashFileToken } from '../util/file-token.util.js';
import { FileDeleterService } from './file-deleter.service.js';

/** How long the browser has to send the bytes after creating a file. */
const UPLOAD_LINK_LIFETIME = '15m';
/** How long a download link works. */
const DOWNLOAD_LINK_LIFETIME_MS = 5 * 60_000;
/** detectContentType() needs the first 16 bytes to recognize every type it knows. */
const BYTES_TO_SNIFF = 16;

/**
 * Anonymous files, step by step:
 *   create()   → reserve a row, hand back a one-time upload link and a token
 *   (browser)  → PUT the bytes straight to storage
 *   complete() → check what arrived; reject and delete anything that isn't what it claims to be
 *   download() → a short-lived link · get() → details · remove() → delete now
 * Everything after create() needs the token.
 */
@Injectable()
export class FilesService {
  constructor(
    @InjectDb() private readonly db: Database,
    @InjectDisk() private readonly disk: StorageDisk,
    @InjectEnv() private readonly env: Env,
    private readonly fileDeleter: FileDeleterService,
  ) {}

  // ---------------------------------------------------------------- create

  async create(request: CreateFileRequest): Promise<CreateFileResponse> {
    this.assertSizeAllowed(request.size);

    const id = randomUUID();
    const token = createFileToken();
    const [row] = await this.db
      .insert(files)
      .values({
        id,
        tokenHash: hashFileToken(token),
        storageKey: `anon/${id}`,
        name: sanitizeFileName(request.name),
        contentType: request.contentType,
        sizeBytes: request.size,
        expiresAt: new Date(Date.now() + this.env.ANON_FILE_TTL_SECONDS * 1000),
      })
      .returning();

    // The link only accepts exactly this type and this many bytes.
    const upload = await this.disk.signedUpload(row.storageKey, {
      contentType: request.contentType,
      contentLength: request.size,
      expiresIn: UPLOAD_LINK_LIFETIME,
    });

    return {
      file: toFileView(row),
      token,
      upload: { url: upload.url, method: 'PUT', headers: upload.headers, expiresAt: upload.expiresAt.toISOString() },
    };
  }

  // ---------------------------------------------------------------- complete

  /** Never trusts what the browser declared: checks the stored size and the file's first bytes. */
  async complete(id: string, token: string | undefined): Promise<FileView> {
    const row = await this.findOwnedFile(id, token);
    if (row.status === 'ready') return toFileView(row); // already confirmed: safe to call twice

    await this.assertUploadedWithDeclaredSize(row);
    await this.assertBytesMatchDeclaredType(row);

    const [ready] = await this.db.update(files).set({ status: 'ready' }).where(eq(files.id, row.id)).returning();
    return toFileView(ready);
  }

  // ---------------------------------------------------------------- read

  async get(id: string, token: string | undefined): Promise<FileView> {
    return toFileView(await this.findOwnedFile(id, token));
  }

  async download(id: string, token: string | undefined): Promise<DownloadLink> {
    const row = await this.findOwnedFile(id, token);
    if (row.status !== 'ready') {
      throw new ConflictException({ code: 'not_ready', message: 'This file hasn’t finished uploading.' });
    }

    const url = await this.disk.signedUrl(row.storageKey, { expiresIn: DOWNLOAD_LINK_LIFETIME_MS, filename: row.name });
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_LINK_LIFETIME_MS).toISOString() };
  }

  // ---------------------------------------------------------------- delete

  /** "Delete now": gone from storage immediately, not at the end of the hour. */
  async remove(id: string, token: string | undefined): Promise<void> {
    await this.fileDeleter.deleteFiles([await this.findOwnedFile(id, token)], 'user_request');
  }

  // ---------------------------------------------------------------- checks

  /**
   * The file, if it exists, isn't deleted, and the token is its own. A wrong token gets the same
   * 404 as a missing file, so nobody can probe which file IDs exist.
   */
  private async findOwnedFile(id: string, token: string | undefined): Promise<FileRow> {
    const [row] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);

    if (!row || !fileTokenMatches(token, row.tokenHash)) {
      throw new NotFoundException({ code: 'file_not_found', message: 'File not found, or it has been deleted.' });
    }
    return row;
  }

  private assertSizeAllowed(size: number) {
    if (size <= this.env.MAX_UPLOAD_BYTES) return;
    const limitMb = Math.floor(this.env.MAX_UPLOAD_BYTES / 1_000_000);
    throw new PayloadTooLargeException({ code: 'file_too_large', message: `Files can be up to ${limitMb} MB.` });
  }

  private async assertUploadedWithDeclaredSize(row: FileRow) {
    const stored = await this.disk.stat(row.storageKey).catch((error: unknown) => {
      if (error instanceof StorageFileNotFoundError) {
        throw new ConflictException({ code: 'upload_missing', message: 'Upload the file before confirming it.' });
      }
      throw error;
    });

    if (stored.size !== row.sizeBytes) {
      await this.fileDeleter.deleteFiles([row], 'rejected');
      throw new UnprocessableEntityException({
        code: 'size_mismatch',
        message: 'The upload was not the declared size.',
      });
    }
  }

  /** A file named .pdf can carry anything; its first bytes say what it really is. */
  private async assertBytesMatchDeclaredType(row: FileRow) {
    const detected = detectContentType(await this.readFirstBytes(row.storageKey));
    if (detected === row.contentType) return;

    await this.fileDeleter.deleteFiles([row], 'rejected');
    throw new UnprocessableEntityException({
      code: 'content_mismatch',
      message: 'The file’s contents don’t match its type. Only real PDFs and images are accepted.',
    });
  }

  private async readFirstBytes(storageKey: string): Promise<Uint8Array> {
    const { body } = await this.disk.get(storageKey, { range: { start: 0, end: BYTES_TO_SNIFF - 1 } });
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }
}
