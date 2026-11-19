# FormatX API

The backend for FormatX, a PDF toolkit for people who handle sensitive documents: merge, split,
organize and compress, with anonymous files deleted after an hour.

**NestJS 12** · **Drizzle ORM** on Postgres · Cloudflare R2 for files · contract-first with **OpenAPI 3.1**.
The original Python/Flask version is preserved at tag [`v0-python`](../../tree/v0-python).

## Start here: the contract

[`spec/swagger/formatx-api-spec.yml`](spec/swagger/formatx-api-spec.yml) describes every endpoint, request
and response. It is written by hand and everything else follows it:

- `npm run generate` (also run by `npm install`) writes TypeScript interfaces to `spec/gen/`.
  Controllers and services use them as their types: `import type { FileView } from '@spec/formatx-api-spec'`.
- The web app generates its Angular interfaces from the same file.
- Request validators must `satisfies` the generated types, so the build fails if they drift apart.
- The contract test fails if the app serves a route the spec doesn't list (or the reverse), and every
  end-to-end test checks responses against the spec.
- `npm run start:dev`, then open **http://localhost:8080/docs** to read and try it.

## How a file moves through the API

1. `POST /v1/files` reserves a file → a **one-time upload link** and a **file token**.
2. The browser `PUT`s the bytes straight to storage (R2). They never pass through the API.
3. `POST /v1/files/{id}/complete` checks what arrived: the exact size, and the first bytes must match the
   declared type. A `.pdf` that is really something else is deleted on the spot.
4. `GET /v1/files/{id}/download` → a 5-minute download link.
5. The file is deleted one hour after upload by cleanup, or right away with `DELETE /v1/files/{id}`.
   Each deletion is logged, and the file's name and token are wiped from its row.

Every call after the first sends the token in `X-File-Token`. Only its hash is stored, and a wrong token
gets the same 404 as a file that doesn't exist. Every error has the same shape: `{ statusCode, code,
message, details? }`.

## Where things are

```
spec/swagger/formatx-api-spec.yml   the contract (hand-written)
spec/gen/                            interfaces generated from it (not committed)
src/
  main.ts                            starts the app
  app.module.ts                      lists every module
  common/                            shared by all modules
    setup/                           CORS, validation, error format, /docs
    filter/                          turns every error into the spec's ApiError
    guard/                           per-IP rate limiting
  modules/
    files/                           upload → verify → download → delete
      controller/                    routes only; hands each request to the service
      service/                       the steps (files.service.ts) and the one place files are deleted
      dto/                           request validation (Zod), checked against the spec's types
      mapper/                        database row → API response
      util/                          file tokens, file name cleaning
    cleanup/                         deletes expired files (controller, service, guard)
    storage/                         R2 / local folder / memory, and the local stand-in for R2's links
    database/                        tables (schema/), connection (provider/), migrate script (script/)
    config/                          every setting, validated at startup (schema/)
    health/                          GET /health
drizzle/                             SQL migrations
docker/                              Dockerfile and its ignore file
test/                                end-to-end and contract tests
```

## Develop

```bash
npm install          # also generates spec/gen/
npm run start:dev    # http://localhost:8080, docs at /docs
```

No database server or Docker needed: without `DATABASE_URL` the API runs on **PGlite** (Postgres compiled
to WebAssembly, inside the process) and files go to `.data/files`. Copy `.env.example` to `.env` to change
settings; `src/modules/config/schema/env.schema.ts` lists them all and refuses to start production without
a database, R2 and an internal secret.

```bash
npm run spec:lint    # the spec is valid OpenAPI
npm test             # unit tests
npm run test:e2e     # the real app, end to end, checked against the spec
npm run lint
npm run db:generate  # after editing the database schema: writes a new migration to drizzle/
```

### Adding an endpoint

1. Describe it in the spec, then `npm run generate`.
2. Add the controller method returning the generated type, and a Zod schema that `satisfies` the request type.
3. Put the logic in the module's service; add an end-to-end test that calls `expectToMatchSpec`.

## Deploy

CI runs every check above, the end-to-end tests against real Postgres 17, and builds and starts the Docker
image (Node 22 + qpdf + Ghostscript, non-root). Build it from the repo root:

```bash
docker build -f docker/Dockerfile -t formatx-api .
```

The image is meant for Cloudflare Containers behind a Worker
that routes `/api`, rate-limits and calls cleanup every 5 minutes. Run `npm run db:migrate` as a release step,
never at startup on Postgres.
