import { Controller, Get, NotFoundException, Put, Req, Res } from '@nestjs/common';
import { InjectDisk, receiveSignedUpload, serveSignedUrl, StorageDisk } from '@nestjs/storage';
import type { Request, Response } from 'express';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/schema/env.schema.js';
import { SIGNED_URL_ROUTE } from '../config/storage.config.js';

/**
 * Plays R2's part when files are stored locally: receives uploads to, and serves downloads from,
 * URLs the API signed. Clients never build these URLs; they use the ones the Files endpoints return.
 * With R2 (`s3`) these routes are 404: the browser talks to R2 directly.
 *
 * Spec: `receiveSignedUpload`, `serveSignedDownload` in spec/swagger/formatx-api-spec.yml.
 */
@Controller(SIGNED_URL_ROUTE)
export class SignedUrlController {
  constructor(
    @InjectDisk() private readonly disk: StorageDisk,
    @InjectEnv() private readonly env: Env,
  ) {}

  /** PUT {signed upload url}: checks signature, expiry, Content-Type and length, then stores the body. */
  @Put()
  async receiveUpload(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertLocalStorage();
    await receiveSignedUpload(this.disk, { req, res });
    res.status(200);
  }

  /** GET {signed download url}: checks signature and expiry, then streams the file as an attachment. */
  @Get()
  async serveDownload(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertLocalStorage();
    return serveSignedUrl(this.disk, { req, res });
  }

  private assertLocalStorage() {
    if (this.env.STORAGE_DRIVER === 's3') throw new NotFoundException();
  }
}
