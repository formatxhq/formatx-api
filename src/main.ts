import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './common/setup/configure-app.js';
import { ENV } from './modules/config/config.module.js';
import type { Env } from './modules/config/schema/env.schema.js';

const production = process.env.NODE_ENV === 'production';

// Development reads .env when there is one; production gets its settings from Cloudflare.
if (!production) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env: every setting has a development default
  }
}

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  // JSON lines in production, for Cloudflare's log viewer. Requests themselves are never logged:
  // their URLs and headers carry file IDs and tokens, and file names are personal data.
  logger: new ConsoleLogger({ json: production, colors: !production }),
});

const env = app.get<Env>(ENV);
configureApp(app, env);
app.enableShutdownHooks();
await app.listen(env.PORT, '0.0.0.0');

new ConsoleLogger('Bootstrap').log(
  `FormatX API on http://localhost:${env.PORT} (storage: ${env.STORAGE_DRIVER})${production ? '' : ` · docs at /docs`}`,
);
