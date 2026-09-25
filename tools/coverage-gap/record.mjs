// @ts-check
// Runs the suites that say something about the endpoints, with hit recording switched on.
//
// A runner instead of `RECORD_ENDPOINT_HITS=... playwright test` in package.json, because that
// syntax doesn't work in cmd or PowerShell. The api and ui suites talk to the real backend (that
// is what counts as coverage); ui-mocked is recorded too so an endpoint reached ONLY by stubs
// can be told apart from one no test touches. Quarantined tests are left out. visual and a11y
// are left out: they stub everything, and visual needs its own container.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve('endpoint-hits');
// A previous run's files would be read as this run's.
rmSync(dir, { recursive: true, force: true });

const result = spawnSync(
  'npx',
  [
    'playwright',
    'test',
    '--project=api',
    '--project=ui',
    '--project=ui-mocked',
    '--grep-invert',
    '@quarantine',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', shell: true, env: { ...process.env, RECORD_ENDPOINT_HITS: dir } },
);
process.exit(result.status ?? 1);
