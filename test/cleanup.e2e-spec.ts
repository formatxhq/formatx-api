import type { NestExpressApplication } from '@nestjs/platform-express';
import { StorageDisk } from '@nestjs/storage';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { CleanupService } from '../src/modules/cleanup/service/cleanup.service.js';
import { type Database, DB } from '../src/modules/database/provider/database.provider.js';
import { deletionLog, files } from '../src/modules/database/schema/database.schema.js';
import { createFile, createReadyFile } from './support/files.js';
import { expectToMatchSpec } from './support/openapi.js';
import { createTestApp } from './support/test-app.js';

const SECRET = 'internal-secret-for-tests-0123456789abcdef';
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

describe('Cleanup (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let db: Database;

  beforeAll(async () => {
    ({ app, server } = await createTestApp({ INTERNAL_SECRET: SECRET }));
    db = app.get<Database>(DB);
  });
  afterAll(() => app.close());

  it('deletes files once their hour is up, from storage and from the database', async () => {
    const ready = await createReadyFile(server, 'Transcript.pdf');
    const neverUploaded = await createFile(server, { name: 'never.pdf', contentType: 'application/pdf', size: 10 });
    const [row] = await db.select().from(files).where(eq(files.id, ready.file.id));
    const disk = app.get(StorageDisk);
    expect(await disk.exists(row.storageKey)).toBe(true);

    const cleanup = app.get(CleanupService);
    expect(await cleanup.deleteExpiredFiles(minutesFromNow(30))).toEqual({ deleted: 0 });
    expect((await cleanup.deleteExpiredFiles(minutesFromNow(61))).deleted).toBeGreaterThanOrEqual(2);

    expect(await disk.exists(row.storageKey)).toBe(false);
    await request(server).get(`/v1/files/${ready.file.id}`).set('x-file-token', ready.token).expect(404);
    for (const id of [ready.file.id, neverUploaded.file.id]) {
      const log = await db.select().from(deletionLog).where(eq(deletionLog.fileId, id));
      expect(log.map((entry) => entry.reason)).toEqual(['expired']);
    }
  });

  it('runs from the internal endpoint only with the right secret', async () => {
    const missing = await request(server).post('/internal/cleanup').expect(401);
    expectToMatchSpec(missing, 'post', '/internal/cleanup');
    await request(server).post('/internal/cleanup').set('authorization', 'Bearer wrong').expect(401);

    const ran = await request(server).post('/internal/cleanup').set('authorization', `Bearer ${SECRET}`).expect(200);
    expectToMatchSpec(ran, 'post', '/internal/cleanup');
  });

  it('hides the internal endpoint entirely when no secret is configured', async () => {
    const { app: bare, server: bareServer } = await createTestApp();

    const res = await request(bareServer)
      .post('/internal/cleanup')
      .set('authorization', `Bearer ${SECRET}`)
      .expect(404);
    expectToMatchSpec(res, 'post', '/internal/cleanup');
    await bare.close();
  });
});
