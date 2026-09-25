// @ts-check
// Regenerates the API contract files from the running backend:
//   api-client/openapi.json   the spec as the backend serves it (read at runtime by
//                             api-client/contract.ts to validate real responses)
//   api-client/schema.d.ts    the types generated from that file (read by the tests, and by the
//                             coverage-gap flagger)
//
// The types are generated from the saved JSON, not from the URL, so the two committed files can
// never disagree, and tools/ci/api-types.test.mjs checks that they don't. Run it whenever the
// backend pin moves (docs/maintenance.md).
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SPEC_URL = process.env.OPENAPI_URL ?? 'http://localhost:8080/swagger/v1/swagger.json';

const response = await fetch(SPEC_URL);
if (!response.ok) {
  console.error(
    `generate-api-types: ${SPEC_URL} answered ${response.status}. Is the stack up? (npm run docker:up)`,
  );
  process.exit(1);
}
const spec = await response.json();
writeFileSync('api-client/openapi.json', `${JSON.stringify(spec, null, 2)}\n`);
console.log(`wrote api-client/openapi.json (${Object.keys(spec.paths).length} paths)`);

const result = spawnSync(
  'npx',
  ['openapi-typescript', 'api-client/openapi.json', '-o', 'api-client/schema.d.ts'],
  { stdio: 'inherit', shell: true },
);
process.exit(result.status ?? 1);
