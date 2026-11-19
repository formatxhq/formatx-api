/**
 * Contract checks: the spec in spec/swagger/ is the promise, and these helpers hold the API to it.
 */
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsPlugin from 'ajv-formats';
import type { Response } from 'supertest';
import { parse } from 'yaml';
import { SPEC_PATH } from '../../src/common/setup/swagger.setup.js';

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
interface SpecResponse {
  $ref?: string;
  content?: Record<string, { schema?: unknown }>;
}
interface Spec {
  paths: Record<string, Partial<Record<HttpMethod, { responses: Record<string, SpecResponse> }>>>;
  components: { responses?: Record<string, SpecResponse> } & Record<string, unknown>;
}

const spec = parse(readFileSync(SPEC_PATH, 'utf8')) as Spec;

// The spec is OpenAPI 3.1, whose schemas are JSON Schema 2020-12, so Ajv validates them as they are.
const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormatsPlugin as unknown as (a: Ajv2020) => void)(ajv);
ajv.addSchema({ $id: 'spec', components: spec.components });
const validators = new Map<string, ValidateFunction>();

/**
 * Fails unless the spec documents this status for `method path`, and the body matches the schema
 * documented for it. `path` is written as in the spec: `/v1/files/{id}`.
 */
export function expectToMatchSpec(res: Response, method: HttpMethod, path: string) {
  const operation = spec.paths[path]?.[method];
  if (!operation) throw new Error(`The spec has no ${method.toUpperCase()} ${path}`);

  let documented = operation.responses[String(res.status)];
  if (!documented) {
    throw new Error(
      `The spec doesn't document ${res.status} for ${method.toUpperCase()} ${path}. Body: ${JSON.stringify(res.body)}`,
    );
  }
  if (documented.$ref) documented = spec.components.responses![documented.$ref.split('/').pop()!];

  const schema = documented.content?.['application/json']?.schema;
  if (!schema) return; // no JSON body documented (e.g. 204)

  const key = `${method} ${path} ${res.status}`;
  let validate = validators.get(key);
  if (!validate) {
    // Point the spec's internal references (#/components/…) at the copy registered above.
    const rebased = JSON.parse(JSON.stringify(schema).replaceAll('"#/components/', '"spec#/components/'));
    validate = ajv.compile(rebased);
    validators.set(key, validate);
  }
  if (!validate(res.body)) {
    throw new Error(
      `${method.toUpperCase()} ${path} → ${res.status} doesn't match the spec: ${ajv.errorsText(validate.errors)}\n` +
        `Body: ${JSON.stringify(res.body)}`,
    );
  }
}

/** Every operation the spec documents, as "METHOD /path". */
export function specOperations(): string[] {
  return Object.entries(spec.paths).flatMap(([path, operations]) =>
    Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
  );
}

/** Every route the running app serves, as "METHOD /path", with `:id` written `{id}` like the spec. */
export function appRoutes(app: INestApplication): string[] {
  const scanner = new MetadataScanner();
  return app
    .get(DiscoveryService)
    .getControllers()
    .flatMap(({ metatype, instance }) => {
      if (!metatype || !instance) return [];
      const base = String(Reflect.getMetadata('path', metatype) ?? '');
      const prototype = Object.getPrototypeOf(instance) as Record<string, object>;
      return scanner.getAllMethodNames(prototype).flatMap((name) => {
        const handler = prototype[name];
        const method = Reflect.getMetadata('method', handler) as RequestMethod | undefined;
        if (method === undefined) return [];
        const sub = String(Reflect.getMetadata('path', handler) ?? '');
        const path = `/${[base, sub]
          .map((part) => part.replace(/^\/|\/$/g, ''))
          .filter(Boolean)
          .join('/')}`;
        return [`${RequestMethod[method]} ${path.replace(/:(\w+)/g, '{$1}')}`];
      });
    });
}
