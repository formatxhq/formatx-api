import { resolve } from 'node:path';
import { InMemoryDisk, LocalDisk, S3Disk, type StorageModuleOptions } from '@nestjs/storage';
import type { Env } from '../../config/schema/env.schema.js';

/** Route that serves app-signed URLs for the local and memory drivers. */
export const SIGNED_URL_ROUTE = 'v1/storage';

/**
 * One disk, named `files`:
 * - production (`s3`): Cloudflare R2. It signs upload and download URLs itself, so file bytes go
 *   browser ↔ R2 and never through the API.
 * - development (`local`): a folder on disk.
 * - tests (`memory`): nothing written anywhere.
 * The last two can't sign URLs on their own, so the API signs them with STORAGE_SIGNING_KEY
 * and serves them from SIGNED_URL_ROUTE (see SignedUrlController).
 */
export function createStorageOptions(env: Env): StorageModuleOptions {
  if (env.STORAGE_DRIVER === 's3') {
    return { default: 'files', disks: { files: createR2Disk(env) } };
  }

  const signedUrls = { baseUrl: `${env.PUBLIC_API_URL}/${SIGNED_URL_ROUTE}`, keys: [env.STORAGE_SIGNING_KEY] };
  const disk =
    env.STORAGE_DRIVER === 'memory'
      ? new InMemoryDisk({ signedUrls })
      : new LocalDisk({ root: resolve(env.STORAGE_LOCAL_ROOT), signedUrls });
  return { default: 'files', disks: { files: disk } };
}

function createR2Disk(env: Env): S3Disk {
  const credentials =
    env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
      : undefined;
  return new S3Disk({
    bucket: env.S3_BUCKET!,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials,
    timeout: '30s',
  });
}
