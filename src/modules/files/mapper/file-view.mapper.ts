import type { AcceptedContentType, FileView } from '@spec/formatx-api-spec';
import type { FileRow } from '../../database/schema/database.schema.js';

/**
 * A database row → what the API returns (spec: FileView). Only the fields the spec lists leave the
 * API: the token hash and storage key never do.
 */
export function toFileView(row: FileRow): FileView {
  return {
    id: row.id,
    name: row.name,
    // Rows are only ever created with an accepted type (see createFileRequestSchema).
    contentType: row.contentType as AcceptedContentType,
    size: row.sizeBytes,
    status: row.status === 'ready' ? 'ready' : 'pending',
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}
