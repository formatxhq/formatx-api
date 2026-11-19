import { Global, Inject, Module } from '@nestjs/common';
import { loadEnv } from './schema/env.schema.js';

/** Injection token for the validated settings. Tests replace it with `.overrideProvider(ENV)`. */
export const ENV = Symbol('ENV');

/** Use in a constructor: `@InjectEnv() private readonly env: Env`. */
export const InjectEnv = () => Inject(ENV);

/** Reads and validates `process.env` once, and makes the result available everywhere. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
