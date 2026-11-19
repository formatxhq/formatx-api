import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthStatus } from '@spec/formatx-api-spec';
import { sql } from 'drizzle-orm';
import { type Database, InjectDb } from '../../database/provider/database.provider.js';

/** Spec tag: `Health`. Cloudflare and the Docker HEALTHCHECK call this. */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@InjectDb() private readonly db: Database) {}

  /** getHealth · GET /health */
  @Get()
  async getHealth(): Promise<HealthStatus> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ code: 'service_unavailable', message: 'The database is unreachable.' });
    }
    return { status: 'ok', database: 'up' };
  }
}
