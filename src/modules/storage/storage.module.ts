import { Module } from '@nestjs/common';
import { StorageModule as NestStorageModule } from '@nestjs/storage';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/schema/env.schema.js';
import { createStorageOptions } from './config/storage.config.js';
import { SignedUrlController } from './controller/signed-url.controller.js';

/** File storage (R2, a local folder, or memory) and the routes that stand in for R2 locally. */
@Module({
  imports: [
    NestStorageModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => createStorageOptions(env),
    }),
  ],
  controllers: [SignedUrlController],
})
export class StorageModule {}
