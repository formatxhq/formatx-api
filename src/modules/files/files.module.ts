import { Module } from '@nestjs/common';
import { FilesController } from './controller/files.controller.js';
import { FileDeleterService } from './service/file-deleter.service.js';
import { FilesService } from './service/files.service.js';

/** Anonymous file upload, verification, download and deletion. */
@Module({
  controllers: [FilesController],
  providers: [FilesService, FileDeleterService],
  exports: [FileDeleterService],
})
export class FilesModule {}
