// Turns every OpenAPI spec in spec/swagger/ into TypeScript interfaces in spec/gen/.
// Runs on `npm install` (postinstall) and with `npm run generate`. spec/gen/ is not committed:
// the spec is the source of truth, and the types are always rebuilt from it.
import { readdirSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { generateApi } from 'swagger-typescript-api';

const specDir = resolve(process.cwd(), 'spec/swagger');
const outDir = resolve(process.cwd(), 'spec/gen');

for (const file of readdirSync(specDir).filter((name) => /\.ya?ml$|\.json$/.test(name))) {
  const name = basename(file, extname(file));
  await generateApi({
    input: resolve(specDir, file),
    output: outDir,
    // A declaration file: types only, nothing at runtime, importable from anywhere in src/.
    fileName: `${name}.d.ts`,
    generateClient: false,
    // String unions ('pending' | 'ready') instead of TypeScript enums, so the types match JSON exactly.
    generateUnionEnums: true,
    silent: true,
  });
  console.log(`generated spec/gen/${name}.d.ts`);
}
