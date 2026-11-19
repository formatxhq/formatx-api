import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { type Database, DB } from '../src/modules/database/provider/database.provider.js';
import { deletionLog, files } from '../src/modules/database/schema/database.schema.js';
import { createFile, createReadyFile, PDF_BYTES, PNG_BYTES, uploadBytes } from './support/files.js';
import { expectToMatchSpec } from './support/openapi.js';
import { createTestApp } from './support/test-app.js';

describe('Files (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let db: Database;

  beforeAll(async () => {
    ({ app, server } = await createTestApp());
    db = app.get<Database>(DB);
  });
  afterAll(() => app.close());

  const deletionReasons = async (fileId: string) =>
    (await db.select().from(deletionLog).where(eq(deletionLog.fileId, fileId))).map((entry) => entry.reason);

  it('runs the whole life of an anonymous file: upload, confirm, download, delete', async () => {
    // 1. Reserve the file: it expires in an hour.
    const created = await createFile(server, {
      name: 'Resume_2026.pdf',
      contentType: 'application/pdf',
      size: PDF_BYTES.length,
    });
    expect(created.file.status).toBe('pending');
    const lifetime = Date.parse(created.file.expiresAt!) - Date.now();
    expect(lifetime).toBeGreaterThan(59 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(60 * 60_000);

    // 2. Upload the bytes to the signed link.
    await uploadBytes(server, created, PDF_BYTES).expect(200);

    // 3. Confirm it.
    const auth = { 'x-file-token': created.token };
    const completed = await request(server).post(`/v1/files/${created.file.id}/complete`).set(auth).expect(200);
    expectToMatchSpec(completed, 'post', '/v1/files/{id}/complete');
    expect(completed.body.status).toBe('ready');

    const details = await request(server).get(`/v1/files/${created.file.id}`).set(auth).expect(200);
    expectToMatchSpec(details, 'get', '/v1/files/{id}');
    expect(details.body).toMatchObject({ name: 'Resume_2026.pdf', size: PDF_BYTES.length });

    // 4. Download it.
    const link = await request(server).get(`/v1/files/${created.file.id}/download`).set(auth).expect(200);
    expectToMatchSpec(link, 'get', '/v1/files/{id}/download');
    const url = new URL(link.body.url);
    const downloaded = await request(server)
      .get(url.pathname + url.search)
      .buffer(true)
      .expect(200);
    expect(Buffer.from(downloaded.body as Buffer).equals(PDF_BYTES)).toBe(true);
    expect(downloaded.headers['content-disposition']).toContain('Resume_2026.pdf');

    // 5. Delete it: gone, the row wiped, the deletion recorded.
    const deleted = await request(server).delete(`/v1/files/${created.file.id}`).set(auth).expect(204);
    expectToMatchSpec(deleted, 'delete', '/v1/files/{id}');
    await request(server).get(`/v1/files/${created.file.id}`).set(auth).expect(404);

    const [row] = await db.select().from(files).where(eq(files.id, created.file.id));
    expect(row).toMatchObject({ status: 'deleted', name: '', tokenHash: '' });
    expect(await deletionReasons(created.file.id)).toEqual(['user_request']);
  });

  it('answers 404 for a wrong or missing token, the same as for a file that does not exist', async () => {
    const created = await createReadyFile(server);
    const id = created.file.id;

    for (const token of ['wrong-token', '']) {
      await request(server).get(`/v1/files/${id}`).set('x-file-token', token).expect(404);
      await request(server).delete(`/v1/files/${id}`).set('x-file-token', token).expect(404);
    }
    await request(server).get(`/v1/files/${id}/download`).expect(404);

    const missing = await request(server)
      .get(`/v1/files/${crypto.randomUUID()}`)
      .set('x-file-token', created.token)
      .expect(404);
    expectToMatchSpec(missing, 'get', '/v1/files/{id}');
    expect(missing.body.code).toBe('file_not_found');

    // Still there for its real owner.
    await request(server).get(`/v1/files/${id}`).set('x-file-token', created.token).expect(200);
  });

  it('deletes an upload whose bytes are not its declared type', async () => {
    const created = await createFile(server, {
      name: 'not-really.pdf',
      contentType: 'application/pdf',
      size: PNG_BYTES.length,
    });
    await uploadBytes(server, created, PNG_BYTES).expect(200);

    const res = await request(server)
      .post(`/v1/files/${created.file.id}/complete`)
      .set('x-file-token', created.token)
      .expect(422);
    expectToMatchSpec(res, 'post', '/v1/files/{id}/complete');
    expect(res.body.code).toBe('content_mismatch');

    await request(server).get(`/v1/files/${created.file.id}`).set('x-file-token', created.token).expect(404);
    expect(await deletionReasons(created.file.id)).toEqual(['rejected']);
  });

  it('refuses to confirm before anything was uploaded', async () => {
    const created = await createFile(server, { name: 'a.pdf', contentType: 'application/pdf', size: PDF_BYTES.length });

    const res = await request(server)
      .post(`/v1/files/${created.file.id}/complete`)
      .set('x-file-token', created.token)
      .expect(409);
    expectToMatchSpec(res, 'post', '/v1/files/{id}/complete');
    expect(res.body.code).toBe('upload_missing');
  });

  it('refuses a download before the upload is confirmed', async () => {
    const created = await createFile(server, { name: 'a.pdf', contentType: 'application/pdf', size: PDF_BYTES.length });

    const res = await request(server)
      .get(`/v1/files/${created.file.id}/download`)
      .set('x-file-token', created.token)
      .expect(409);
    expectToMatchSpec(res, 'get', '/v1/files/{id}/download');
    expect(res.body.code).toBe('not_ready');
  });

  it('refuses an upload of a different size than was signed', async () => {
    const created = await createFile(server, { name: 'a.pdf', contentType: 'application/pdf', size: PDF_BYTES.length });

    const res = await uploadBytes(server, created, Buffer.concat([PDF_BYTES, PDF_BYTES]));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('validates requests before touching storage', async () => {
    const tooBig = await request(server)
      .post('/v1/files')
      .send({ name: 'big.pdf', contentType: 'application/pdf', size: 50_000_001 })
      .expect(413);
    expectToMatchSpec(tooBig, 'post', '/v1/files');
    expect(tooBig.body.code).toBe('file_too_large');

    const wrongType = await request(server)
      .post('/v1/files')
      .send({ name: 'page.html', contentType: 'text/html', size: 10 })
      .expect(400);
    expectToMatchSpec(wrongType, 'post', '/v1/files');
    expect(wrongType.body).toMatchObject({
      code: 'validation_failed',
      details: [expect.stringContaining('contentType')],
    });

    const extraField = await request(server)
      .post('/v1/files')
      .send({ name: 'a.pdf', contentType: 'application/pdf', size: 10, owner: 'someone' })
      .expect(400);
    expectToMatchSpec(extraField, 'post', '/v1/files');

    const badId = await request(server).get('/v1/files/not-a-uuid').set('x-file-token', 'x').expect(400);
    expectToMatchSpec(badId, 'get', '/v1/files/{id}');
  });

  it('cleans up file names before storing them', async () => {
    const created = await createFile(server, {
      name: 'C:\\Users\\me\\Transcript<1>.pdf',
      contentType: 'application/pdf',
      size: 10,
    });

    expect(created.file.name).toBe('Transcript1.pdf');
  });
});
