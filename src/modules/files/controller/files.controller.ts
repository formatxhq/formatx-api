import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CreateFileRequest, CreateFileResponse, DownloadLink, FileView } from '@spec/formatx-api-spec';
import { createFileRequestSchema, FILE_TOKEN_HEADER, fileIdParamSchema } from '../dto/files.dto.js';
import { FilesService } from '../service/files.service.js';

/**
 * Anonymous files. Every route here is described in spec/swagger/formatx-api-spec.yml under the
 * `Files` tag; the operationId is in each method's comment. The controller only reads the request
 * and hands it to FilesService.
 */
@Controller('v1/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /** createFile · POST /v1/files */
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createFile(@Body({ schema: createFileRequestSchema }) body: CreateFileRequest): Promise<CreateFileResponse> {
    return this.filesService.create(body);
  }

  /** completeFile · POST /v1/files/{id}/complete */
  @Post(':id/complete')
  @HttpCode(200)
  completeFile(
    @Param('id', { schema: fileIdParamSchema }) id: string,
    @Headers(FILE_TOKEN_HEADER) token?: string,
  ): Promise<FileView> {
    return this.filesService.complete(id, token);
  }

  /** getFile · GET /v1/files/{id} */
  @Get(':id')
  getFile(
    @Param('id', { schema: fileIdParamSchema }) id: string,
    @Headers(FILE_TOKEN_HEADER) token?: string,
  ): Promise<FileView> {
    return this.filesService.get(id, token);
  }

  /** getDownloadLink · GET /v1/files/{id}/download */
  @Get(':id/download')
  getDownloadLink(
    @Param('id', { schema: fileIdParamSchema }) id: string,
    @Headers(FILE_TOKEN_HEADER) token?: string,
  ): Promise<DownloadLink> {
    return this.filesService.download(id, token);
  }

  /** deleteFile · DELETE /v1/files/{id} */
  @Delete(':id')
  @HttpCode(204)
  deleteFile(
    @Param('id', { schema: fileIdParamSchema }) id: string,
    @Headers(FILE_TOKEN_HEADER) token?: string,
  ): Promise<void> {
    return this.filesService.remove(id, token);
  }
}
