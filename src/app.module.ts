import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from './common/guard/client-ip-throttler.guard.js';
import { CleanupModule } from './modules/cleanup/cleanup.module.js';
import { ConfigModule } from './modules/config/config.module.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { StorageModule } from './modules/storage/storage.module.js';

/**
 * The whole API. Each feature lives in src/modules/<name>/ with its own controller, service, dto,
 * guard and so on; src/common/ holds what every module shares.
 */
@Module({
  imports: [
    // infrastructure
    ConfigModule,
    DatabaseModule,
    StorageModule,
    // a per-IP ceiling for every route; busier routes set tighter limits with @Throttle()
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    // features
    FilesModule,
    CleanupModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
export class AppModule {}
