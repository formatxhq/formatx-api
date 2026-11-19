import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from '../../modules/config/schema/env.schema.js';
import { FILE_TOKEN_HEADER } from '../../modules/files/dto/files.dto.js';
import { ApiExceptionFilter } from '../filter/api-exception.filter.js';
import { setupSwaggerDocs } from './swagger.setup.js';

/** Everything main.ts sets on the app, shared with the end-to-end tests so they run the same app. */
export function configureApp(app: NestExpressApplication, env: Env) {
  // Validate every @Body() / @Param() that declares a Zod schema; others pass through untouched.
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  // Every error leaves the API in the spec's ApiError shape.
  app.useGlobalFilters(new ApiExceptionFilter());

  app.enableCors({
    origin: env.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', FILE_TOKEN_HEADER],
    exposedHeaders: ['ETag'],
    maxAge: 600,
  });

  // Don't advertise Express; behind Cloudflare, trust its headers for the client's address.
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  if (env.NODE_ENV !== 'production') setupSwaggerDocs(app);
}
