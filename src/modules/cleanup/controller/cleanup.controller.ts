import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { CleanupResult } from '@spec/formatx-api-spec';
import { InternalGuard } from '../guard/internal.guard.js';
import { CleanupService } from '../service/cleanup.service.js';

/** Routes Cloudflare calls, not browsers. Spec tag: `Internal`. */
@Controller('internal')
@UseGuards(InternalGuard)
@SkipThrottle()
export class CleanupController {
  constructor(private readonly cleanupService: CleanupService) {}

  /** runCleanup · POST /internal/cleanup */
  @Post('cleanup')
  @HttpCode(200)
  runCleanup(): Promise<CleanupResult> {
    return this.cleanupService.deleteExpiredFiles();
  }
}
