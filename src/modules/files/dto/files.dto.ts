/**
 * Request validation for the Files endpoints. The TypeScript types come from the spec
 * (spec/gen, generated from spec/swagger/formatx-api-spec.yml); each Zod schema below must
 * `satisfies` its generated type, so the build breaks if the spec and the validation drift apart.
 */
import type { AcceptedContentType, CreateFileRequest } from '@spec/formatx-api-spec';
import { z } from 'zod';

/** The header that carries a file's token. Never put the token in a URL: URLs end up in logs. */
export const FILE_TOKEN_HEADER = 'x-file-token';

/** Every `AcceptedContentType` in the spec; the type check below fails if one is missing here. */
export const ACCEPTED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
] as const satisfies readonly AcceptedContentType[];

type MissingContentTypes = Exclude<AcceptedContentType, (typeof ACCEPTED_CONTENT_TYPES)[number]>;
const everyContentTypeListed: [MissingContentTypes] extends [never] ? true : MissingContentTypes = true;
void everyContentTypeListed;

/** Body of `POST /v1/files` (spec: CreateFileRequest). */
export const createFileRequestSchema = z
  .object({
    name: z.string().min(1).max(1000),
    contentType: z.enum(ACCEPTED_CONTENT_TYPES),
    size: z.number().int().min(1),
  })
  .strict() satisfies z.ZodType<CreateFileRequest>;

/** The `{id}` path parameter (spec: FileId). */
export const fileIdParamSchema = z.uuid();
