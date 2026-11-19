import { Module } from '@nestjs/common';
import { HealthController } from './controller/health.controller.js';

/** GET /health: is the API up and can it reach its database? */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
