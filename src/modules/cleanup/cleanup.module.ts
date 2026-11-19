import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { CleanupController } from './controller/cleanup.controller.js';
import { InternalGuard } from './guard/internal.guard.js';
import { CleanupService } from './service/cleanup.service.js';

/** Deletes expired files: on a timer in development, through /internal/cleanup in production. */
@Module({
  imports: [FilesModule],
  controllers: [CleanupController],
  providers: [CleanupService, InternalGuard],
  exports: [CleanupService],
})
export class CleanupModule {}
