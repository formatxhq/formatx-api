# syntax=docker/dockerfile:1

# ---- build: compile TypeScript, then keep only production dependencies ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci runs postinstall, which generates the TypeScript interfaces from the spec.
COPY spec/swagger ./spec/swagger
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: Node plus the PDF tools the jobs shell out to ----
FROM node:22-bookworm-slim
# qpdf repairs, decrypts and linearizes PDFs; Ghostscript compresses them (milestone 5).
RUN apt-get update \
  && apt-get install -y --no-install-recommends qpdf ghostscript \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle
# The spec is served at /docs outside production.
COPY --chown=node:node spec/swagger ./spec/swagger
COPY --chown=node:node package.json ./

# Never run as root: a crafted PDF that escapes a tool lands in an unprivileged account.
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
