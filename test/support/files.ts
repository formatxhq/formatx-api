import type { CreateFileRequest, CreateFileResponse } from '@spec/formatx-api-spec';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { expectToMatchSpec } from './openapi.js';

/** The first bytes real files start with, padded past the 16 bytes type detection reads. */
export const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40, 1),
]);

/** POST /v1/files, checked against the spec. */
export async function createFile(server: App, body: CreateFileRequest): Promise<CreateFileResponse> {
  const res = await request(server).post('/v1/files').send(body).expect(201);
  expectToMatchSpec(res, 'post', '/v1/files');
  return res.body as CreateFileResponse;
}

/** Sends the bytes to the signed upload link, as the browser will (in tests the app serves it). */
export function uploadBytes(server: App, created: CreateFileResponse, bytes: Buffer) {
  const url = new URL(created.upload.url);
  return request(server)
    .put(url.pathname + url.search)
    .set(created.upload.headers)
    .send(bytes);
}

/** Create, upload and confirm: a file that is ready to use. */
export async function createReadyFile(server: App, name = 'Resume_2026.pdf', bytes = PDF_BYTES) {
  const created = await createFile(server, { name, contentType: 'application/pdf', size: bytes.length });
  await uploadBytes(server, created, bytes).expect(200);
  await request(server).post(`/v1/files/${created.file.id}/complete`).set('x-file-token', created.token).expect(200);
  return created;
}
