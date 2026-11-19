import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { parse } from 'yaml';

/** The contract every endpoint follows. Three folders up from here, in src/ and dist/ alike. */
export const SPEC_PATH = resolve(import.meta.dirname, '../../../spec/swagger/formatx-api-spec.yml');

/**
 * Serves the spec as interactive docs at /docs (and raw at /docs-json, /docs-yaml), outside
 * production. The docs come from the hand-written spec file, not from decorators, so what you
 * read there is exactly what the types were generated from.
 */
export function setupSwaggerDocs(app: INestApplication) {
  const spec = parse(readFileSync(SPEC_PATH, 'utf8')) as OpenAPIObject;
  SwaggerModule.setup('docs', app, spec, {
    customSiteTitle: 'FormatX API',
    swaggerOptions: { persistAuthorization: true, displayOperationId: true },
  });
}
