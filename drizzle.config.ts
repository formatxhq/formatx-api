import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` turns changes in the schema into a new SQL migration under drizzle/.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/database/schema/database.schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
