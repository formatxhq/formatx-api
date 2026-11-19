import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { appRoutes, expectToMatchSpec, specOperations } from './support/openapi.js';
import { createTestApp } from './support/test-app.js';

/** The spec and the app describe the same API: nothing undocumented, nothing documented but missing. */
describe('API contract (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;

  beforeAll(async () => {
    ({ app, server } = await createTestApp());
  });
  afterAll(() => app.close());

  it('documents every route the app serves, and serves every route it documents', () => {
    expect(appRoutes(app).sort()).toEqual(specOperations().sort());
  });

  it('reports health as the spec describes', async () => {
    const res = await request(server).get('/health').expect(200);
    expectToMatchSpec(res, 'get', '/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the spec as interactive docs outside production', async () => {
    await request(server).get('/docs/').expect(200);
    const json = await request(server).get('/docs-json').expect(200);
    expect(json.body.info.title).toBe('FormatX API');
  });

  it('answers unknown routes in the ApiError shape', async () => {
    const res = await request(server).get('/v1/nope').expect(404);
    expect(res.body).toEqual({ statusCode: 404, code: 'not_found', message: 'Not found.' });
  });
});
